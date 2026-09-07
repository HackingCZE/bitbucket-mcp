import axios, { AxiosInstance } from "axios";
import { sanitizeForLog } from "./security.js";

export const READONLY_EXTENSION_TOOLS = [
  {
    name: "listBranches",
    description: "List branches in a Bitbucket repository without modifying anything",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Bitbucket workspace; defaults to BITBUCKET_WORKSPACE" },
        repo_slug: { type: "string", description: "Repository slug" },
        pagelen: { type: "number", minimum: 1, maximum: 100, description: "Items per page (default 50)" },
        page: { type: "number", minimum: 1, description: "1-based page number" },
        sort: { type: "string", description: "Optional Bitbucket sort expression, e.g. name" },
      },
      required: ["repo_slug"],
    },
  },
  {
    name: "searchBranches",
    description: "Search branch names in a Bitbucket repository (read-only)",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Bitbucket workspace; defaults to BITBUCKET_WORKSPACE" },
        repo_slug: { type: "string", description: "Repository slug" },
        query: { type: "string", description: "Case-sensitive substring used by Bitbucket's branch-name filter" },
        pagelen: { type: "number", minimum: 1, maximum: 100, description: "Items per page (default 50)" },
        page: { type: "number", minimum: 1, description: "1-based page number" },
      },
      required: ["repo_slug", "query"],
    },
  },
  {
    name: "getBranch",
    description: "Get metadata and target commit for a specific Bitbucket branch (read-only)",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Bitbucket workspace; defaults to BITBUCKET_WORKSPACE" },
        repo_slug: { type: "string", description: "Repository slug" },
        name: { type: "string", description: "Branch name without refs/heads prefix" },
      },
      required: ["repo_slug", "name"],
    },
  },
  {
    name: "listCommits",
    description: "List repository commits, optionally starting from a branch/tag/commit revision (read-only)",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Bitbucket workspace; defaults to BITBUCKET_WORKSPACE" },
        repo_slug: { type: "string", description: "Repository slug" },
        revision: { type: "string", description: "Optional branch, tag, or commit to start from" },
        path: { type: "string", description: "Optional file/directory path to limit commits" },
        include: { type: "string", description: "Optional Bitbucket include ref filter" },
        exclude: { type: "string", description: "Optional Bitbucket exclude ref filter" },
        pagelen: { type: "number", minimum: 1, maximum: 100, description: "Items per page (default 25)" },
        page: { type: "number", minimum: 1, description: "1-based page number" },
      },
      required: ["repo_slug"],
    },
  },
  {
    name: "getCommit",
    description: "Get one Bitbucket commit by hash or accepted commit identifier (read-only)",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Bitbucket workspace; defaults to BITBUCKET_WORKSPACE" },
        repo_slug: { type: "string", description: "Repository slug" },
        commit: { type: "string", description: "Commit hash or accepted commit identifier" },
      },
      required: ["repo_slug", "commit"],
    },
  },
  {
    name: "getSource",
    description: "Read a file or list a directory at any branch, tag, or commit without modifying the repository",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Bitbucket workspace; defaults to BITBUCKET_WORKSPACE" },
        repo_slug: { type: "string", description: "Repository slug" },
        revision: { type: "string", description: "Branch name, tag, or commit hash" },
        path: { type: "string", description: "Repository-relative file/directory path; omit for repository root" },
      },
      required: ["repo_slug", "revision"],
    },
  },
] as const;

const READONLY_EXTENSION_NAMES = new Set(READONLY_EXTENSION_TOOLS.map((tool) => tool.name));

export function isReadonlyExtensionTool(name: string): boolean {
  return READONLY_EXTENSION_NAMES.has(name as (typeof READONLY_EXTENSION_TOOLS)[number]["name"]);
}

function normalizeBaseUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (host === "bitbucket.org" || host === "www.bitbucket.org" || host === "api.bitbucket.org") {
      return "https://api.bitbucket.org/2.0";
    }
    return raw.replace(/\/+$/, "");
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function createApi(): AxiosInstance {
  const baseURL = normalizeBaseUrl(process.env.BITBUCKET_URL ?? "https://api.bitbucket.org/2.0");
  const token = process.env.BITBUCKET_TOKEN;
  const username = process.env.BITBUCKET_USERNAME;
  const password = process.env.BITBUCKET_PASSWORD;

  if (!token && !(username && password)) {
    throw new Error("Either BITBUCKET_TOKEN or BITBUCKET_USERNAME/PASSWORD is required");
  }

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  return axios.create({
    baseURL,
    headers,
    auth: username && password ? { username, password } : undefined,
    timeout: 30_000,
    maxContentLength: 5 * 1024 * 1024,
    maxBodyLength: 5 * 1024 * 1024,
  });
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required parameter: ${key}`);
  }
  return value;
}

function resolveWorkspace(args: Record<string, unknown>): string {
  const workspace = typeof args.workspace === "string" && args.workspace.trim()
    ? args.workspace.trim()
    : process.env.BITBUCKET_WORKSPACE?.trim();
  if (!workspace) {
    throw new Error("Workspace is required via the workspace argument or BITBUCKET_WORKSPACE");
  }
  return workspace;
}

function positiveInt(value: unknown, fallback: number, max = 100): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.floor(value), max));
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function mcpText(value: unknown) {
  let text: string;
  if (typeof value === "string") text = value;
  else if (Buffer.isBuffer(value)) {
    text = `[binary content; base64]\n${value.toString("base64")}`;
  } else text = JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function safeErrorMessage(error: unknown): string {
  const safe = sanitizeForLog(error) as Record<string, unknown> | undefined;
  if (safe && typeof safe === "object") {
    const status = typeof safe.status === "number" ? `HTTP ${safe.status}: ` : "";
    const bitbucketMessage = typeof safe.bitbucketMessage === "string" ? safe.bitbucketMessage : undefined;
    const message = typeof safe.message === "string" ? safe.message : "Bitbucket read request failed";
    return `${status}${bitbucketMessage ?? message}`;
  }
  return "Bitbucket read request failed";
}

export async function callReadonlyExtensionTool(name: string, rawArgs: unknown) {
  const args = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;
  const workspace = resolveWorkspace(args);
  const repoSlug = requiredString(args, "repo_slug");
  const api = createApi();
  const repoBase = `/repositories/${encodeSegment(workspace)}/${encodeSegment(repoSlug)}`;

  try {
    switch (name) {
      case "listBranches": {
        const response = await api.get(`${repoBase}/refs/branches`, {
          params: {
            pagelen: positiveInt(args.pagelen, 50),
            page: positiveInt(args.page, 1, Number.MAX_SAFE_INTEGER),
            ...(typeof args.sort === "string" && args.sort ? { sort: args.sort } : {}),
          },
        });
        return mcpText(response.data);
      }
      case "searchBranches": {
        const query = requiredString(args, "query");
        const escaped = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const response = await api.get(`${repoBase}/refs/branches`, {
          params: {
            q: `name ~ "${escaped}"`,
            pagelen: positiveInt(args.pagelen, 50),
            page: positiveInt(args.page, 1, Number.MAX_SAFE_INTEGER),
          },
        });
        return mcpText(response.data);
      }
      case "getBranch": {
        const branch = requiredString(args, "name");
        const response = await api.get(`${repoBase}/refs/branches/${encodeSegment(branch)}`);
        return mcpText(response.data);
      }
      case "listCommits": {
        const revision = typeof args.revision === "string" && args.revision.trim() ? args.revision.trim() : undefined;
        const endpoint = revision
          ? `${repoBase}/commits/${encodeSegment(revision)}`
          : `${repoBase}/commits`;
        const response = await api.get(endpoint, {
          params: {
            pagelen: positiveInt(args.pagelen, 25),
            page: positiveInt(args.page, 1, Number.MAX_SAFE_INTEGER),
            ...(typeof args.path === "string" && args.path ? { path: args.path } : {}),
            ...(typeof args.include === "string" && args.include ? { include: args.include } : {}),
            ...(typeof args.exclude === "string" && args.exclude ? { exclude: args.exclude } : {}),
          },
        });
        return mcpText(response.data);
      }
      case "getCommit": {
        const commit = requiredString(args, "commit");
        const response = await api.get(`${repoBase}/commit/${encodeSegment(commit)}`);
        return mcpText(response.data);
      }
      case "getSource": {
        const revision = requiredString(args, "revision");
        const sourcePath = typeof args.path === "string" ? args.path.replace(/^\/+/, "") : "";
        const encodedPath = sourcePath
          .split("/")
          .filter(Boolean)
          .map(encodeSegment)
          .join("/");
        const endpoint = `${repoBase}/src/${encodeSegment(revision)}${encodedPath ? `/${encodedPath}` : "/"}`;
        const response = await api.get(endpoint);
        return mcpText(response.data);
      }
      default:
        throw new Error(`Unknown read-only extension tool: ${name}`);
    }
  } catch (error) {
    throw new Error(safeErrorMessage(error));
  }
}
