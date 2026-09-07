# Default tool policy

The proxy exposes only clearly read-oriented verbs by default. New upstream tools are therefore blocked unless their names begin with `get`, `list`, `search`, `read`, or `fetch`, or they are reviewed and implemented as explicit hardened read-only extensions.
