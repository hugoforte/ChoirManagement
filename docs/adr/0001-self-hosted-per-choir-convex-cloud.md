---
status: accepted
---

# Self-hosted, one Convex Cloud project per Choir

ChoirManagement is self-hosted: each Choir runs its own instance, deployed to its own Convex Cloud project, set up by a volunteer "technical Member" following a setup guide. We considered a single multi-tenant hosted service (lower adoption friction, one deployment to maintain) but rejected it — it would require the maintainers to operate a production service for every Choir, and doesn't fit the project's AGPL, community-run character. We also considered Convex's self-hosted `convex-backend` (Docker, fully vendor-independent) but rejected it in favor of Convex Cloud: running and maintaining a database server is too much ops burden for a volunteer, whereas signing up for a free Convex Cloud project is not. There is no shared backend between Choirs; a Choir wanting isolation from another Choir gets it by construction.
