// Mounts the Resend email component (#52). See convex/bulletinEmails.ts for
// how it is used and docs/guides/self-hosting.md for the env vars it needs.
import { defineApp } from "convex/server";
import resend from "@convex-dev/resend/convex.config.js";

const app = defineApp();
app.use(resend);

export default app;
