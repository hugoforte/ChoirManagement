import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

import App from "./App";
import "./index.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

if (!convexUrl) throw new Error("Missing VITE_CONVEX_URL");
if (!clerkPublishableKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");

const convex = new ConvexReactClient(convexUrl);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </StrictMode>,
);
