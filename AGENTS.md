## Instruction Source

Follow `.github/copilot-instructions.md` as the single source of truth for project policy, coding rules, and the feature delivery workflow. This file (and the sections below) cover issue-tracker and domain-doc conventions specifically — see `docs/agents/` for detail.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `hugoforte/ChoirManagement`, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root (created lazily as needed). See `docs/agents/domain.md`.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
