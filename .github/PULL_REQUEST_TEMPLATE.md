## Security checklist

- [ ] Read-only mode remains the default
- [ ] New write tools are blocked unless `BITBUCKET_ENABLE_WRITE=true`
- [ ] Delete-like tools require `BITBUCKET_ENABLE_DANGEROUS=true` as a second opt-in
- [ ] No credentials, auth headers, request config, or secrets are logged
- [ ] `npm test` passes
- [ ] `npm run build` passes
