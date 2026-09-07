import {
  blockedToolMessage,
  isDangerousToolName,
  isReadOnlyToolName,
  isToolAllowed,
  redactText,
  sanitizeForLog,
} from "../src/security.js";

describe("hardened Bitbucket MCP security policy", () => {
  it("allows clearly read-only tools by default", () => {
    expect(isReadOnlyToolName("listRepositories")).toBe(true);
    expect(isReadOnlyToolName("getRepository")).toBe(true);
    expect(isReadOnlyToolName("getPullRequestDiff")).toBe(true);
    expect(isReadOnlyToolName("listPipelineRuns")).toBe(true);
    expect(isReadOnlyToolName("searchBranches")).toBe(true);

    expect(isToolAllowed("getRepository", false, false)).toBe(true);
    expect(isToolAllowed("getPullRequestCommits", false, false)).toBe(true);
  });

  it("blocks write tools by default", () => {
    for (const tool of [
      "createPullRequest",
      "updatePullRequest",
      "mergePullRequest",
      "approvePullRequest",
      "declinePullRequest",
      "addPullRequestComment",
      "runPipeline",
      "stopPipeline",
      "resolveComment",
      "publishDraftPullRequest",
    ]) {
      expect(isToolAllowed(tool, false, false)).toBe(false);
    }
  });

  it("treats unknown verbs conservatively as write operations", () => {
    expect(isToolAllowed("futureMutationTool", false, false)).toBe(false);
  });

  it("shows ordinary write tools only after explicit write opt-in", () => {
    expect(isToolAllowed("mergePullRequest", true, false)).toBe(true);
    expect(isToolAllowed("addPullRequestComment", true, false)).toBe(true);
  });

  it("requires a second dangerous opt-in for delete operations", () => {
    expect(isDangerousToolName("deletePullRequestComment")).toBe(true);
    expect(isToolAllowed("deletePullRequestComment", true, false)).toBe(false);
    expect(isToolAllowed("deletePullRequestComment", true, true)).toBe(true);
  });

  it("returns agent guidance for blocked writes", () => {
    const message = blockedToolMessage("mergePullRequest", false, false);
    expect(message).toContain("read-only mode");
    expect(message).toContain("BITBUCKET_ENABLE_WRITE=true");
    expect(message).toContain("provide the exact text/steps");
  });

  it("redacts bearer/basic auth, URL userinfo and credential assignments", () => {
    const input =
      "Authorization: Bearer abc.def-123 https://user:pass@example.com password=hunter2 token='secret-token' Basic dXNlcjpwYXNz";
    const redacted = redactText(input);

    expect(redacted).not.toContain("abc.def-123");
    expect(redacted).not.toContain("user:pass");
    expect(redacted).not.toContain("hunter2");
    expect(redacted).not.toContain("secret-token");
    expect(redacted).not.toContain("dXNlcjpwYXNz");
  });

  it("never serializes axios request config, auth or headers", () => {
    const fakeAxiosError = {
      isAxiosError: true,
      name: "AxiosError",
      message: "Request failed with Bearer super-secret-token",
      code: "ERR_BAD_REQUEST",
      config: {
        headers: { Authorization: "Bearer super-secret-token" },
        auth: { username: "person@example.com", password: "super-secret-password" },
      },
      request: { rawHeaders: ["Authorization", "Bearer super-secret-token"] },
      response: {
        status: 401,
        data: { error: { message: "Unauthorized" } },
      },
    };

    const result = JSON.stringify(sanitizeForLog(fakeAxiosError));
    expect(result).toContain("401");
    expect(result).toContain("Unauthorized");
    expect(result).not.toContain("super-secret-token");
    expect(result).not.toContain("super-secret-password");
    expect(result).not.toContain("person@example.com");
    expect(result).not.toContain("Authorization\"");
  });
});
