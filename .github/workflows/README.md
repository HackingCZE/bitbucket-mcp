# Workflows

`security-ci.yml` runs on the hardened security branch and pull requests to `master`. It installs dependencies with `npm ci`, runs all Jest tests, builds the hardened package entrypoint, and verifies that the build contains both the public proxy (`dist/index.js`) and the internal core (`dist/core.js`).
