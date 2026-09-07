# Agent behavior for blocked writes

When the MCP server reports that a write operation is blocked by read-only mode, an agent should not retry the mutation or claim it succeeded. It should either ask the user whether they want to enable write access explicitly, or provide the exact proposed text/change and manual steps so the user can apply it themselves.
