# Hardened Bitbucket MCP fork

This fork is intended for AI-agent access to Bitbucket with **read-only behavior by default**.

## Default behavior

Run the package normally and do **not** set `BITBUCKET_ENABLE_WRITE`.

The hardened MCP entrypoint exposes read operations only. In addition to upstream read tools, this fork adds:

- `listBranches`
- `searchBranches`
- `getBranch`
- `listCommits`
- `getCommit`
- `getSource` — read a file or directory at any branch, tag, or commit

All unknown/non-read-oriented tool names are treated as write operations and are hidden/blocked.

## Write access

Write access must be explicitly enabled for the MCP server process:

```bash
BITBUCKET_ENABLE_WRITE=true
```

When a write request is blocked, the MCP error instructs the agent to ask the user whether write access should be enabled or to provide the exact text/steps for a manual change instead.

Delete-like operations require a second explicit opt-in:

```bash
BITBUCKET_ENABLE_WRITE=true
BITBUCKET_ENABLE_DANGEROUS=true
```

## Recommended credentials

For normal usage, create a Bitbucket credential with read-only repository scopes. This gives two independent protections:

1. the MCP proxy blocks write tools;
2. Bitbucket itself rejects writes for the credential.

## Logging

The hardened entrypoint forcibly disables the legacy core file logger so Axios request configuration, Authorization headers, tokens, usernames/passwords, and auth objects cannot be serialized there.

Optional proxy diagnostics are off by default and can be enabled with:

```bash
BITBUCKET_PROXY_DEBUG=true
```

They never log tool arguments or environment variables and redact credential-like text.

See `SECURITY.md` for the full security model.
