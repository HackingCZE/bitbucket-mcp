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

For read-only deployments, use a Bitbucket credential with the smallest read scopes possible. This provides defense in depth: the hardened proxy rejects writes and the credential itself should have as little write authority as Bitbucket permits.

## Installation

Node.js 18+ is required.

```bash
npm ci
npm run build
```

The hardened proxy also loads a local `.env` file through `dotenv`, so credentials can be kept out of MCP client config files if preferred.

## Bitbucket Cloud authentication

### Atlassian API token with scopes — recommended

Bitbucket Cloud app passwords are obsolete. Use an Atlassian API token created **with Bitbucket scopes**.

For Bitbucket REST API Basic authentication, set your Atlassian account email as the username and the API token as the password:

```bash
BITBUCKET_URL="https://api.bitbucket.org/2.0"
BITBUCKET_WORKSPACE="your-workspace"
BITBUCKET_USERNAME="you@example.com"
BITBUCKET_PASSWORD="your-scoped-api-token"
```

Recommended minimum scopes for this hardened MCP:

- **Repositories: Read** — source code, branches, commits and file browsing
- **Pull requests: Read** — optional, only if you want PR inspection
- **Pipelines: Read** — optional, only if you want pipeline status/steps/logs

Do not grant repository write/admin/delete, pull-request write, or pipeline write scopes for a read-only deployment.

> Bitbucket's **Pull requests: Read** permission also permits PR comments at the API-token layer. The hardened MCP proxy still blocks comment-creation tools in read-only mode, but if you want the credential itself to be as restrictive as possible, omit the Pull requests scope and use the MCP only for repository/source inspection.

### Bearer-style access token

`BITBUCKET_TOKEN` is supported for credentials that are actually accepted by your Bitbucket endpoint as a Bearer token (for example appropriate OAuth/access-token flows):

```bash
BITBUCKET_URL="https://api.bitbucket.org/2.0"
BITBUCKET_WORKSPACE="your-workspace"
BITBUCKET_TOKEN="your-bearer-access-token"
```

Do not place an Atlassian user API token in `BITBUCKET_TOKEN` unless your specific token flow is documented to use Bearer authentication; for normal scoped Atlassian API tokens use `BITBUCKET_USERNAME` + `BITBUCKET_PASSWORD` as shown above.

`BITBUCKET_URL` can also point at a supported self-hosted Bitbucket Server endpoint.

## Configuration

| Variable | Description | Default |
| --- | --- | --- |
| `BITBUCKET_URL` | Bitbucket API base URL | `https://api.bitbucket.org/2.0` |
| `BITBUCKET_WORKSPACE` | Default workspace | unset |
| `BITBUCKET_USERNAME` | Atlassian account email/username for Basic auth | unset |
| `BITBUCKET_PASSWORD` | Scoped Atlassian API token/password used with Basic auth | unset |
| `BITBUCKET_TOKEN` | Bearer access token for token types that support Bearer auth | unset |
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
