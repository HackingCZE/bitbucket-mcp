# Workflows

`security-ci.yml` is the persistent verification worker for this hardened fork. It uses read-only repository permissions and checks unit/security tests, the hardened build, the end-to-end MCP read-only smoke test, package layout, and the production dependency audit.

No workflow in this directory should require repository write permission for normal CI.
