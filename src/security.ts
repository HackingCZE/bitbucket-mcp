export const READ_ONLY_TOOL_PREFIXES = ["get", "list", "search", "read", "fetch"] as const;

export function isTruthyEnv(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

/**
 * Conservative policy: only clearly read-oriented tool names are considered read-only.
 * Any unknown/new tool is treated as a write operation until explicitly reviewed.
 */
export function isReadOnlyToolName(name: string): boolean {
  const normalized = String(name || "").trim().toLowerCase();
  return READ_ONLY_TOOL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/** Delete-like operations require both write and dangerous opt-ins. */
export function isDangerousToolName(name: string): boolean {
  return /^delete/i.test(String(name || "").trim());
}

export function isToolAllowed(
  name: string,
  writeEnabled: boolean,
  dangerousEnabled: boolean
): boolean {
  if (isReadOnlyToolName(name)) return true;
  if (!writeEnabled) return false;
  if (isDangerousToolName(name) && !dangerousEnabled) return false;
  return true;
}

export function blockedToolMessage(
  name: string,
  writeEnabled: boolean,
  dangerousEnabled: boolean
): string {
  if (!writeEnabled) {
    return (
      `This Bitbucket MCP server is running in read-only mode. ` +
      `Write operation '${name}' requires explicit permission. ` +
      `Ask the user whether they want to enable write access by setting ` +
      `BITBUCKET_ENABLE_WRITE=true and restarting the server, or provide the exact ` +
      `text/steps so the user can apply the change manually. Do not imply that the change was made.`
    );
  }

  if (isDangerousToolName(name) && !dangerousEnabled) {
    return (
      `Destructive Bitbucket operation '${name}' is disabled. ` +
      `It requires both BITBUCKET_ENABLE_WRITE=true and ` +
      `BITBUCKET_ENABLE_DANGEROUS=true. Ask the user for explicit permission or ` +
      `provide manual steps instead. Do not imply that the change was made.`
    );
  }

  return `Bitbucket operation '${name}' is blocked by the server security policy.`;
}

const SENSITIVE_KEY = /^(authorization|proxy-authorization|auth|password|passwd|token|access[_-]?token|refresh[_-]?token|secret|api[_-]?key|cookie|set-cookie)$/i;

/** Redact common credential forms from free-form text before it can reach logs. */
export function redactText(input: string): string {
  return String(input)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@]+(?::[^\s/@]*)?)@/gi, "$1[REDACTED]@")
    .replace(
      /((?:password|passwd|token|access[_-]?token|refresh[_-]?token|authorization|secret|api[_-]?key)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[REDACTED]"
    );
}

function safeBitbucketErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  const nestedError = record.error;
  if (nestedError && typeof nestedError === "object") {
    const message = (nestedError as Record<string, unknown>).message;
    if (typeof message === "string") return redactText(message);
  }
  if (typeof record.message === "string") return redactText(record.message);
  return undefined;
}

/**
 * Recursively sanitize data before logging. Axios-like errors are reduced to a
 * minimal safe shape so request config, headers and auth objects never get serialized.
 */
export function sanitizeForLog(value: unknown, key?: string, seen = new WeakSet<object>()): unknown {
  if (key && SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;

  if (value instanceof Error) {
    const maybeAxios = value as Error & {
      isAxiosError?: boolean;
      code?: string;
      response?: { status?: number; data?: unknown };
    };
    if (maybeAxios.isAxiosError) {
      return {
        name: value.name,
        message: redactText(value.message),
        code: maybeAxios.code,
        status: maybeAxios.response?.status,
        bitbucketMessage: safeBitbucketErrorMessage(maybeAxios.response?.data),
      };
    }
    return { name: value.name, message: redactText(value.message) };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, undefined, seen));
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) return "[Circular]";
    seen.add(objectValue);

    // Axios errors are sometimes plain objects after serialization.
    if (objectValue.isAxiosError === true) {
      const response = objectValue.response as Record<string, unknown> | undefined;
      return {
        name: typeof objectValue.name === "string" ? objectValue.name : "AxiosError",
        message: redactText(String(objectValue.message ?? "Bitbucket request failed")),
        code: typeof objectValue.code === "string" ? objectValue.code : undefined,
        status: typeof response?.status === "number" ? response.status : undefined,
        bitbucketMessage: safeBitbucketErrorMessage(response?.data),
      };
    }

    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(objectValue)) {
      if (SENSITIVE_KEY.test(childKey)) {
        result[childKey] = "[REDACTED]";
      } else if (["request", "config", "agent"].includes(childKey.toLowerCase())) {
        // These objects can contain headers/auth and are not useful in hardened logs.
        result[childKey] = "[REDACTED]";
      } else {
        result[childKey] = sanitizeForLog(childValue, childKey, seen);
      }
    }
    return result;
  }

  return redactText(String(value));
}
