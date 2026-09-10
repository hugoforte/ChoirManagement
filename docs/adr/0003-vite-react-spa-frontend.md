---
status: accepted
---

# Vite + React SPA frontend, not Next.js

ChoirManagement's frontend is a Vite-built React single-page application, not Next.js. It builds to static files deployable on any web server, needs no separate Node server process for a self-hoster to run and secure, and pairs directly with Convex's client-side reactive queries. Next.js's server-rendering strengths matter less for an app that sits almost entirely behind a login, and its extra runtime cuts against the goal of a setup a volunteer "technical Member" can operate without ongoing ops work.
