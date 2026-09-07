# Explicit write opt-in

Write access is never inferred from a chat request. It must be configured on the MCP server process itself with `BITBUCKET_ENABLE_WRITE=true`.

If a write tool is requested while the server is read-only, the server returns guidance telling the agent to ask whether the user wants write access enabled or to provide manual text/steps instead.

The approval is not silently persisted by the MCP server. It lasts only according to the external server configuration/environment.
