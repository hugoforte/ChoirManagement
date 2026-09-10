---
status: accepted
---

# Clerk for authentication

ChoirManagement uses Clerk (one Clerk application per Choir instance, matching the one-Convex-project-per-Choir model) for Member authentication, supporting Google OAuth and username/password login. We considered Convex Auth, the official Convex library, which would avoid an extra third-party account per Choir — but Convex's own documentation describes it as beta, "not complete," and liable to change in backward-incompatible ways, which is disqualifying for a deployment a volunteer sets up once and doesn't actively maintain. We also considered Auth0, which is comparably mature to Clerk, but Clerk's dedicated Convex integration and prebuilt sign-in UI mean less custom auth code for a self-hoster to build and maintain, and both vendors are free at the scale of a single Choir (tens to low hundreds of Members).
