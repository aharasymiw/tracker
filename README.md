# Less Lately

A local-first, encrypted app for tracking cannabis use, built to help you understand your patterns and cut back deliberately. Deployed on Cloudflare Pages, moving to `app.lesslately.com`.

## Privacy model

**Your data never leaves your device.** There is no backend — Cloudflare Pages serves static files, and the app runs entirely in your browser:

- All records (entries, goals, settings) are encrypted at rest in IndexedDB with **AES-256-GCM**. The master key is wrapped by a key derived from your password (**PBKDF2, 600k iterations, SHA-256**) and held non-extractable in memory only while unlocked.
- The deployed app makes **zero third-party requests** (fonts are self-hosted), and a Content-Security-Policy with `connect-src 'self'` makes that browser-enforced.
- No accounts, no analytics, no sync. Moving devices = export a backup file, transfer it yourself, import on the other device.
- Lost password = lost data, by design. **Export backups regularly** (Settings → Data; optionally password-encrypted).

## Stack

React 19 + TypeScript PWA, built with [Vite+](https://viteplus.dev/) (`vp` CLI). Tailwind v4 (CSS-first), React Router v7, Zod validation on every encrypted read/write, `idb` for IndexedDB, hand-rolled SVG charts, Workbox precaching for offline.

## Development

```bash
npm install          # or: vp install
npm run dev          # dev server at localhost:5173
vp check --fix       # lint (oxlint) + format (oxfmt) + types, auto-fixing
vp test run          # unit + integration tests (Vitest, jsdom + fake-indexeddb)
npx playwright test  # e2e (starts its own dev server on :4173)
npm run build        # vp check && vp build → dist/
```

Key layout:

| Path                           | Purpose                                         |
| ------------------------------ | ----------------------------------------------- |
| `src/lib/crypto.ts`            | All WebCrypto: PBKDF2, AES-GCM, key wrap/unwrap |
| `src/lib/db.ts`                | IndexedDB: vault meta + encrypted CRUD          |
| `src/lib/schemas.ts`           | Zod schemas (validated on write _and_ read)     |
| `src/contexts/AuthContext.tsx` | Vault state machine, auto-lock, cross-tab lock  |
| `src/contexts/DataContext.tsx` | Encrypted data provider                         |
| `src/lib/backup.ts`            | JSON (plain/encrypted) + CSV export/import      |
| `public/_headers`              | CSP and security headers served by Cloudflare   |
| `scripts/icons/`               | App icon generator (canvas → PNG at all sizes)  |

## Deployment

Pushes to `main` run checks + tests in GitHub Actions, then deploy to Cloudflare Pages. Manual deploy: `npm run deploy`.
