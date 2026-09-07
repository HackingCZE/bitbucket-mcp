#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entrypoint = path.join(rootDir, "dist", "index.js");
const SECRET = "SMOKE_TEST_SECRET_MUST_NEVER_APPEAR";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createClient(extraEnv = {}) {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "bitbucket-mcp-smoke-"));
  const forbiddenLog = path.join(tempHome, "forbidden-auth.log");
  const child = spawn(process.execPath, [entrypoint], {
    cwd: rootDir,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      HOME: tempHome,
      BITBUCKET_URL: "https://api.bitbucket.org/2.0",
      BITBUCKET_WORKSPACE: "security-smoke",
      BITBUCKET_TOKEN: SECRET,
      BITBUCKET_LOG_FILE: forbiddenLog,
      BITBUCKET_PROXY_DEBUG: "true",
      ...extraEnv,
    },
  });

  const pending = new Map();
  let stderr = "";
  const stdout = createInterface({ input: child.stdout, crlfDelay: Infinity });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  stdout.on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message && message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });

  function send(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function request(id, method, params = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for MCP response ${id} (${method})`));
      }, 10000);
      pending.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      send({ jsonrpc: "2.0", id, method, params });
    });
  }

  async function initialize() {
    const response = await request(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "security-smoke", version: "1.0.0" },
    });
    assert(!response.error, `initialize failed: ${JSON.stringify(response.error)}`);
    send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  }

  async function close() {
    child.stdin.end();
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        resolve();
      }, 2000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    stdout.close();

    assert(!stderr.includes(SECRET), "proxy stderr leaked the Bitbucket token");
    if (fs.existsSync(forbiddenLog)) {
      const contents = fs.readFileSync(forbiddenLog, "utf8");
      assert(!contents.includes(SECRET), "legacy file log leaked the Bitbucket token");
      assert(contents.trim() === "", "hardened proxy allowed legacy file logging");
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  }

  return { initialize, request, close };
}

async function getToolNames(client) {
  const response = await client.request(2, "tools/list");
  assert(!response.error, `tools/list failed: ${JSON.stringify(response.error)}`);
  const tools = response.result?.tools;
  assert(Array.isArray(tools), "tools/list returned no tools array");
  return tools.map((tool) => tool.name);
}

async function testReadOnlyDefault() {
  const client = createClient({
    BITBUCKET_ENABLE_WRITE: "false",
    BITBUCKET_ENABLE_DANGEROUS: "false",
  });
  try {
    await client.initialize();
    const names = await getToolNames(client);

    assert(names.includes("listRepositories"), "read-only listRepositories is missing");
    assert(names.includes("getRepository"), "read-only getRepository is missing");
    assert(names.includes("getPullRequestCommits"), "read-only commit inspection is missing");

    const blocked = [
      "createPullRequest",
      "updatePullRequest",
      "mergePullRequest",
      "approvePullRequest",
      "addPullRequestComment",
      "runPipeline",
      "stopPipeline",
      "deletePullRequestComment",
    ];
    for (const name of blocked) {
      assert(!names.includes(name), `write tool unexpectedly visible in read-only mode: ${name}`);
    }

    const blockedCall = await client.request(3, "tools/call", {
      name: "mergePullRequest",
      arguments: { workspace: "x", repo_slug: "y", pull_request_id: "1" },
    });
    assert(blockedCall.error, "write call was not rejected in read-only mode");
    assert(
      String(blockedCall.error.message).includes("read-only mode") &&
        String(blockedCall.error.message).includes("BITBUCKET_ENABLE_WRITE=true"),
      "blocked write did not return explicit permission/manual-steps guidance"
    );
  } finally {
    await client.close();
  }
}

async function testWriteOptIn() {
  const client = createClient({
    BITBUCKET_ENABLE_WRITE: "true",
    BITBUCKET_ENABLE_DANGEROUS: "false",
  });
  try {
    await client.initialize();
    const names = await getToolNames(client);
    assert(names.includes("mergePullRequest"), "write opt-in did not expose mergePullRequest");
    assert(names.includes("addPullRequestComment"), "write opt-in did not expose comment writes");
    assert(!names.includes("deletePullRequestComment"), "dangerous delete exposed without second opt-in");
  } finally {
    await client.close();
  }
}

async function testDangerousSecondOptIn() {
  const client = createClient({
    BITBUCKET_ENABLE_WRITE: "true",
    BITBUCKET_ENABLE_DANGEROUS: "true",
  });
  try {
    await client.initialize();
    const names = await getToolNames(client);
    assert(names.includes("deletePullRequestComment"), "dangerous opt-in did not expose delete tool");
  } finally {
    await client.close();
  }
}

await testReadOnlyDefault();
await testWriteOptIn();
await testDangerousSecondOptIn();
console.log("Security smoke tests passed: read-only default, explicit write opt-in, dangerous second opt-in, and no auth logging.");
