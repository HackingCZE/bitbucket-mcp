# Security model

This fork is hardened for use with AI agents and runs **read-only by default**.

## Default mode: read-only

Without any write opt-in, the public MCP entrypoint exposes only tools whose names clearly begin with a read-oriented verb:

- `get*`
- `list*`
- `search*`
- `read*`
- `fetch*`

This intentionally conservative policy means that unknown or newly-added tools are treated as write operations until reviewed. Read-only mode is intended for browsing repositories, branches, commits, pull requests, diffs/patches, comments, statuses, pipeline state/logs, and other non-mutating Bitbucket data.

If an agent tries to call a blocked tool, the proxy returns a clear MCP error explaining that the server is read-only and that the agent should either ask the user for explicit permission to enable write access or provide the exact text/steps so the user can make the change manually. The agent must not imply that a blocked change was applied.

## Explicit write opt-in

Write operations are available only when the server process is explicitly started with:

```bash
BITBUCKET_ENABLE_WRITE=true
```

This opt-in lasts for the server process/configuration in which it is set. The MCP server does not silently remember chat approvals and does not persist an approval by itself.

Examples of operations treated as write operations include creating/updating pull requests, approvals, merges, comments/tasks, resolving/reopening threads, changing branching settings, and starting/stopping pipelines.

## Destructive operations

Delete-like tools require a second explicit opt-in in addition to write mode:

```bash
BITBUCKET_ENABLE_WRITE=true
BITBUCKET_ENABLE_DANGEROUS=true
```

Without both flags, delete operations are hidden from `tools/list` and rejected at runtime.

## Credentials and logging

The hardened public entrypoint launches the legacy Bitbucket core with file logging forcibly disabled:

```text
BITBUCKET_LOG_DISABLE=true
```

`BITBUCKET_LOG_FILE`, `BITBUCKET_LOG_DIR`, and `BITBUCKET_LOG_PER_CWD` are removed from the core process environment. This prevents Axios request objects, authorization headers, app passwords, access tokens, or request auth configuration from being serialized to the legacy file logger.

The proxy itself does not log tool arguments or environment variables. Optional diagnostics can be enabled with:

```bash
BITBUCKET_PROXY_DEBUG=true
```

Proxy diagnostics contain only lifecycle/tool-name information and pass free-form text through credential redaction. They never intentionally print Bitbucket credentials.

## Token permissions

For read-only usage, use a Bitbucket credential with the minimum read scopes required for the repositories/data you need. This gives a second layer of protection: the MCP proxy blocks writes, and Bitbucket itself should also reject writes when the credential is read-only.

Only grant Bitbucket write scopes if you have intentionally enabled `BITBUCKET_ENABLE_WRITE=true` and need those operations.

## Entry points

A normal build runs `scripts/harden-build.mjs`, which changes the compiled layout to:

```text
dist/index.js  -> hardened MCP proxy (public entrypoint)
dist/core.js   -> original Bitbucket MCP implementation (internal child process)
```

`npm start`, the package `bin`, Docker, Smithery, and MCP registry configuration all use `dist/index.js`, so normal usage goes through the read-only security layer.

Directly executing `dist/core.js` bypasses the hardened proxy and is therefore not the supported secure entrypoint for this fork.
