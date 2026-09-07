# Bitbucket MCP

A Model Context Protocol (MCP) server for Bitbucket Cloud and Server APIs.

> **Hardened fork:** this repository runs **read-only by default** for AI-agent use. See [SECURITY.md](SECURITY.md) for the complete security model.

## Hardened defaults

Normal startup (`npm start`, package `bin`, Docker/Smithery/MCP registry entrypoint) goes through the hardened proxy.

Without any write opt-in, agents can inspect repositories and code, including:

- list/get repositories
- list/search/get branches
- list/get commits
- read files or directories from any branch, tag, or commit with `getSource`
- inspect pull requests, diffs/patches, comments, tasks, statuses and activity
- inspect pipeline state, steps and logs
- inspect branching models/settings

Write or mutating operations are hidden and rejected by default. This includes creating/updating/merging/approving/declining pull requests, posting or changing comments/tasks, resolving/reopening threads, changing branching settings, and starting/stopping pipelines.

### Explicit write permission

To expose normal write operations, the server process must be explicitly started with:

```bash
BITBUCKET_ENABLE_WRITE=true
```

The MCP server does **not** silently persist chat approval. If write mode is disabled and an agent is asked to make a change, it receives an error instructing it to ask for explicit permission or provide the exact text/steps so the user can apply the change manually.

Delete-like operations require a second opt-in:

```bash
BITBUCKET_ENABLE_WRITE=true
BITBUCKET_ENABLE_DANGEROUS=true
```

For read-only deployments, use a Bitbucket credential with read scopes only whenever possible. This provides defense in depth: the proxy rejects writes and Bitbucket itself should reject them as well.

## Installation

Node.js 18+ is required.

```bash
npm ci
npm run build
```

Run with an API token:

```bash
BITBUCKET_URL="https://api.bitbucket.org/2.0" \
BITBUCKET_WORKSPACE="your-workspace" \
BITBUCKET_TOKEN="your-read-only-token" \
npm start
```

Or username/app-password authentication:

```bash
BITBUCKET_URL="https://api.bitbucket.org/2.0" \
BITBUCKET_WORKSPACE="your-workspace" \
BITBUCKET_USERNAME="your-email" \
BITBUCKET_PASSWORD="your-app-password" \
npm start
```

`BITBUCKET_URL` can also point at a supported self-hosted Bitbucket Server endpoint.

## Configuration

| Variable | Description | Default |
| --- | --- | --- |
| `BITBUCKET_URL` | Bitbucket API base URL | `https://api.bitbucket.org/2.0` |
| `BITBUCKET_WORKSPACE` | Default workspace | unset |
| `BITBUCKET_TOKEN` | Access token; prefer read-only scope | unset |
| `BITBUCKET_USERNAME` | Username/email used with password auth | unset |
| `BITBUCKET_PASSWORD` | App password/API token used with username auth | unset |
| `BITBUCKET_ENABLE_WRITE` | Expose non-delete write operations | `false` |
| `BITBUCKET_ENABLE_DANGEROUS` | Expose delete-like tools; requires write mode too | `false` |
| `BITBUCKET_PROXY_DEBUG` | Minimal credential-redacted proxy diagnostics on stderr | `false` |

Either `BITBUCKET_TOKEN` or both `BITBUCKET_USERNAME` and `BITBUCKET_PASSWORD` are required.

## Read-only repository tools

The hardened fork adds explicit general repository inspection tools:

- `listBranches` — list repository branches
- `searchBranches` — find branches by name
- `getBranch` — inspect a branch and its target commit
- `listCommits` — list commits, optionally from a branch/tag/commit and/or path
- `getCommit` — inspect a commit
- `getSource` — read a file or list a directory at any branch, tag or commit

The original upstream read-oriented PR, pipeline and repository tools remain available when classified as read-only.

## Credential and logging safety

The public hardened entrypoint always starts the legacy core with file logging disabled and strips legacy log-path variables before spawning it. Core stderr is suppressed. Optional proxy diagnostics redact credential-like strings and do not log tool arguments or environment variables.

Security tests specifically verify that Bearer/Basic credentials, URL userinfo, passwords/tokens and Axios request/auth/config metadata are not serialized by the hardened logging helpers. See [SECURITY.md](SECURITY.md).

## Tests

```bash
npm test
npm run build
npm run security:smoke
npm audit --omit=dev --audit-level=high
```

GitHub Actions runs these checks on pushes to `master` and on pull requests. The end-to-end smoke test launches the built MCP server and verifies read-only tool filtering, blocked writes, explicit write opt-in, the second destructive-operation opt-in, and that a test secret does not appear in stderr or the legacy file log.

## Upstream

This fork is based on [MatanYemini/bitbucket-mcp](https://github.com/MatanYemini/bitbucket-mcp) and retains its MIT license.
