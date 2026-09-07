# Branch, commit, and source read tools

The hardened layer adds six Bitbucket Cloud read-only tools:

- `listBranches`
- `searchBranches`
- `getBranch`
- `listCommits`
- `getCommit`
- `getSource`

They use Bitbucket Cloud GET endpoints only and require repository read access. `getSource` accepts a branch, tag, or commit revision and a repository-relative path, allowing an agent to inspect code from any branch or commit without modifying it.
