#!/usr/bin/env node
import "dotenv/config";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  callReadonlyExtensionTool,
  isReadonlyExtensionTool,
  READONLY_EXTENSION_TOOLS,
} from "./readonly-tools.js";
import {
  blockedToolMessage,
  isToolAllowed,
  isTruthyEnv,
  redactText,
} from "./security.js";

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: Record<string, unknown>;
};

const writeEnabled = isTruthyEnv(process.env.BITBUCKET_ENABLE_WRITE);
const dangerousEnabled = isTruthyEnv(process.env.BITBUCKET_ENABLE_DANGEROUS);
const debugEnabled = isTruthyEnv(process.env.BITBUCKET_PROXY_DEBUG);

function safeDebug(message: string): void {
  if (!debugEnabled) return;
  process.stderr.write(`[bitbucket-mcp] ${redactText(message)}\n`);
}

function writeJson(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function jsonRpcError(
  request: JsonRpcMessage,
  code: number,
  message: string
): JsonRpcMessage {
  return {
    jsonrpc: request.jsonrpc ?? "2.0",
    id: request.id ?? null,
    error: { code, message: redactText(message) },
  };
}

function blockedError(request: JsonRpcMessage, toolName: string): JsonRpcMessage {
  return jsonRpcError(
    request,
    -32601,
    blockedToolMessage(toolName, writeEnabled, dangerousEnabled)
  );
}

function filterToolsResponse(message: unknown): unknown {
  if (Array.isArray(message)) {
    return message.map((entry) => filterToolsResponse(entry));
  }
  if (!message || typeof message !== "object") return message;

  const response = message as JsonRpcMessage;
  const result = response.result;
  if (!result || !Array.isArray(result.tools)) return message;

  const allowedCoreTools = result.tools.filter((tool) => {
    if (!tool || typeof tool !== "object") return false;
    const name = (tool as Record<string, unknown>).name;
    return typeof name === "string"
      ? isToolAllowed(name, writeEnabled, dangerousEnabled)
      : false;
  });

  const existingNames = new Set(
    allowedCoreTools
      .map((tool) =>
        tool && typeof tool === "object"
          ? (tool as Record<string, unknown>).name
          : undefined
      )
      .filter((name): name is string => typeof name === "string")
  );

  const extensionTools = READONLY_EXTENSION_TOOLS.filter(
    (tool) => !existingNames.has(tool.name)
  );

  return {
    ...response,
    result: {
      ...result,
      tools: [...allowedCoreTools, ...extensionTools],
    },
  };
}

const corePath = fileURLToPath(new URL("./core.js", import.meta.url));
const coreEnv = { ...process.env };

// Hardened mode never lets the legacy core write request errors to disk. The
// core can otherwise serialize Axios request metadata that may include auth.
coreEnv.BITBUCKET_LOG_DISABLE = "true";
delete coreEnv.BITBUCKET_LOG_FILE;
delete coreEnv.BITBUCKET_LOG_DIR;
delete coreEnv.BITBUCKET_LOG_PER_CWD;

const core = spawn(process.execPath, [corePath], {
  stdio: ["pipe", "pipe", "pipe"],
  env: coreEnv,
});

// Intentionally consume and suppress core stderr. The hardened proxy only emits
// its own credential-redacted diagnostics when BITBUCKET_PROXY_DEBUG=true.
core.stderr.resume();

core.on("error", (error) => {
  process.stderr.write(
    `[bitbucket-mcp] Failed to start hardened core: ${redactText(error.message)}\n`
  );
  process.exitCode = 1;
});

core.on("exit", (code, signal) => {
  safeDebug(`Core exited (code=${String(code)}, signal=${String(signal)})`);
  if (process.exitCode === undefined) process.exitCode = code ?? 0;
});

async function handleReadonlyExtensionCall(
  request: JsonRpcMessage,
  toolName: string,
  args: unknown
): Promise<void> {
  if (request.id === undefined) return;
  try {
    const result = await callReadonlyExtensionTool(toolName, args);
    writeJson({
      jsonrpc: request.jsonrpc ?? "2.0",
      id: request.id,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bitbucket read request failed";
    writeJson(jsonRpcError(request, -32603, message));
  }
}

const clientInput = createInterface({ input: process.stdin, crlfDelay: Infinity });
clientInput.on("line", (line) => {
  if (!line.trim()) return;

  let payload: unknown;
  try {
    payload = JSON.parse(line);
  } catch {
    // Preserve protocol behavior for malformed input by passing it to the core.
    core.stdin.write(`${line}\n`);
    return;
  }

  const messages = Array.isArray(payload) ? payload : [payload];
  const forward: unknown[] = [];

  for (const item of messages) {
    if (!item || typeof item !== "object") {
      forward.push(item);
      continue;
    }

    const request = item as JsonRpcMessage;
    if (request.method === "tools/call") {
      const toolName = request.params?.name;
      if (typeof toolName === "string") {
        if (isReadonlyExtensionTool(toolName)) {
          void handleReadonlyExtensionCall(
            request,
            toolName,
            request.params?.arguments
          );
          continue;
        }

        if (!isToolAllowed(toolName, writeEnabled, dangerousEnabled)) {
          safeDebug(`Blocked tool call: ${toolName}`);
          if (request.id !== undefined) writeJson(blockedError(request, toolName));
          continue;
        }
      }
    }

    forward.push(item);
  }

  if (forward.length === 0) return;
  if (Array.isArray(payload)) {
    core.stdin.write(`${JSON.stringify(forward)}\n`);
  } else {
    core.stdin.write(`${JSON.stringify(forward[0])}\n`);
  }
});

clientInput.on("close", () => core.stdin.end());

const coreOutput = createInterface({ input: core.stdout, crlfDelay: Infinity });
coreOutput.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const payload = JSON.parse(line);
    writeJson(filterToolsResponse(payload));
  } catch {
    // Never pass non-JSON core output onto stdout; stdout is the MCP channel.
    safeDebug("Suppressed invalid non-JSON output from core");
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    core.kill(signal);
  });
}
