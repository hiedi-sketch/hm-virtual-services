---
name: Transaction route path fix
description: Why transaction routes must omit the /api/ prefix in their path definitions
---

All routers in `artifacts/api-server/src/routes/` are mounted via `router.use(subRouter)` inside the index router, which itself is mounted at `app.use("/api", router)` in `app.ts`.

Express strips the "/api" prefix before passing to the index router. So any route defined as `router.get("/api/transactions", ...)` inside a sub-router would need a request to `/api/api/transactions` to match — which never happens. Instead it falls through to the React `index.html` catch-all, returning HTML with 200 status.

**Rule:** All sub-router paths must be relative to the mounting point. Use `/transactions`, not `/api/transactions`. Auth uses `/auth/me`, QBO uses `/qbo/status`, etc. — all without the `/api/` prefix.

**Why:** Discovered when `GET /api/transactions` consistently returned 200 but with HTML (index.html), causing JSON parse failure and a "Unexpected response from server" error in the frontend.
