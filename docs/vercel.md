# Vercel frontend + Railway backend

Import the existing `0xalpar/seatback` GitHub repository. Set the production branch
to `release/mvp`, root directory to the repository root (`.`), framework to Vite,
and Node.js to 24.x. The root `vercel.json` defines pinned pnpm installation,
the monorepo build, output directory, SPA routing, and Railway API rewrites.
Do not select `apps/web` as the root directory.

`scripts/build-vercel.mjs` checks the committed Devnet deployment against the
compiler IDL, builds shared contracts first, and supplies public browser settings:
same-origin API, the verified Devnet program ID, official Devnet RPC, fixture mode
off, and local-validator override off. This check is configuration validation,
not independent on-chain deployment verification. No frontend secrets are needed.

Use the stable production Vercel domain, not a changing preview URL. Set Railway
API and worker `WEB_ORIGIN` to that exact HTTPS origin and redeploy. The backend
deliberately allows one canonical origin; switching it means the previous Sites
domain can no longer authenticate. Preview deployments can render public pages
but cannot authenticate unless their exact origin is separately configured.
Never replace origin checks with `*`.

`/v1/*` and `/health` are proxied to the real Railway API. The frontend uses an
empty API base; it must not call localhost, Docker DNS, or a cross-origin API
directly. Cookies remain HttpOnly, Secure and SameSite=Lax, scoped to the frontend
host. Browser requests retain credentials and CSRF protection. Session cookies,
private API responses and authentication endpoints must never be cached.

Keep PostgreSQL, worker, runtime gate key and session secrets on Railway. Do not
copy them into Vercel variables. Vercel only hosts the frontend/proxy; no local
validator RPC is exposed. Local Docker configuration remains separate.

After deployment, verify `/health`, `/v1/events`, direct `/events` navigation,
challenge/signature/session/logout through the production URL, then wallet
connection in an extension-enabled browser. A wallet extension signature needs
the user's interaction. Provider unit tests are not a live wallet approval test.
Push a subsequent verified commit and check that Vercel's production deployment
source SHA matches it to confirm automatic GitHub deployment. Do not merge main.
