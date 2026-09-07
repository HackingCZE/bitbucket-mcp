import {
  isReadonlyExtensionTool,
  READONLY_EXTENSION_TOOLS,
} from "../src/readonly-tools.js";
import { isToolAllowed } from "../src/security.js";

describe("read-only Bitbucket repository extensions", () => {
  it("exposes branch, commit and source browsing tools", () => {
    const names = READONLY_EXTENSION_TOOLS.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "listBranches",
        "searchBranches",
        "getBranch",
        "listCommits",
        "getCommit",
        "getSource",
      ])
    );
  });

  it("recognizes all extension tools and keeps them allowed in read-only mode", () => {
    for (const tool of READONLY_EXTENSION_TOOLS) {
      expect(isReadonlyExtensionTool(tool.name)).toBe(true);
      expect(isToolAllowed(tool.name, false, false)).toBe(true);
    }
  });

  it("does not claim mutating tools as read-only extensions", () => {
    expect(isReadonlyExtensionTool("mergePullRequest")).toBe(false);
    expect(isReadonlyExtensionTool("createBranch")).toBe(false);
    expect(isReadonlyExtensionTool("updateFile")).toBe(false);
  });
});
