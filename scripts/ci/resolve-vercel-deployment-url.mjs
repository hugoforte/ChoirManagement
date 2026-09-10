#!/usr/bin/env node
// PROTOTYPE STUB — not implemented. Adapt the deployment-polling logic from
// https://github.com/hugoforte/hugo-tessa-20-years/blob/main/.github/workflows/preview-playwright.yml
// (the inline `node -e` block under "Resolve deployment URL"): poll Vercel's
// GET /v6/deployments API for a READY deployment matching process.env.GITHUB_SHA,
// filtered by target ("production" or "preview" per --target=), and write
// `deployment_url=<url>` to $GITHUB_OUTPUT. Extracted to its own file here
// instead of inlined YAML purely for readability — same logic either way.
throw new Error("not implemented — prototype placeholder, see comment above");
