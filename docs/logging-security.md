# Logging security

The hardened public entrypoint forces the legacy core logger off and removes its file-log path variables before starting the core process. This prevents Axios request objects and their auth configuration from being written to disk.

The proxy itself never logs tool arguments or environment variables. Optional proxy debug output is credential-redacted and is disabled by default.
