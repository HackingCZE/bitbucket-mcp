# Security notes

The hardened wrapper is the supported entrypoint for this fork. It is intentionally conservative: any tool name that does not clearly start with a read verb (`get`, `list`, `search`, `read`, or `fetch`) is considered a write operation.

This protects against future upstream mutations becoming available accidentally before they are reviewed.
