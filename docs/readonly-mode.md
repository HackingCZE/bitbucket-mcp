# Read-only mode

The public MCP entrypoint is read-only unless `BITBUCKET_ENABLE_WRITE=true` is explicitly present in the server environment.

When read-only:

- repository, branch, commit, pull-request, diff, status, and pipeline read tools are available;
- `listBranches`, `searchBranches`, `getBranch`, `listCommits`, `getCommit`, and `getSource` provide general repository browsing;
- write tools are not returned by `tools/list`;
- attempted write calls are rejected before they reach the Bitbucket API;
- the error tells the agent to ask for permission to enable write access or provide the exact manual text/steps instead.

Delete-like operations additionally require `BITBUCKET_ENABLE_DANGEROUS=true`.
