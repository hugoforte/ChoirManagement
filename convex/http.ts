// The app's only HTTP endpoint: Resend's delivery webhook (#52).
//
// The handler is a thin pass-through to the Resend component, which verifies
// the Svix signature with RESEND_WEBHOOK_SECRET, records the event against
// its own email row, and then calls this app's `onEmailEvent` mutation —
// convex/bulletinEmails.ts's `handleEmailEvent` — to advance the matching
// bulletinEmailSends row. Nothing in this file trusts the request body.
import { httpRouter } from "convex/server";

import { httpAction } from "./_generated/server";
import { handleResendWebhook, resendWebhookSecret } from "./bulletinEmails";

const http = httpRouter();

http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // A deployment with no mail provider has no webhook secret either, and
    // the component throws rather than returning a response when the secret
    // is empty. Answering 503 keeps an unconfigured deployment from turning
    // a stray request into a logged exception, and tells whoever registered
    // the URL why it is being refused.
    if (!resendWebhookSecret()) {
      return new Response("Resend webhook is not configured on this deployment", { status: 503 });
    }
    return await handleResendWebhook(ctx, request);
  }),
});

export default http;
