# Septimus OS Frontend

Next.js 16 application for the Septimus OS interface. Authentication is cookie-based: browser code must use `fetchWithAuth` and must never persist a JWT in localStorage or a JavaScript-accessible cookie.

Route protection is implemented in `src/proxy.ts`, the supported Next.js 16 request-boundary convention. It reads only the `HttpOnly` session cookie and never handles a browser-readable token.

## Commands

```bash
npm run dev
npm run lint
npx tsc --noEmit
npm run test:e2e
```

The E2E suite targets the running Compose stack (`http://localhost:3000` by default), creates an isolated workspace, and verifies the HttpOnly session flow.
