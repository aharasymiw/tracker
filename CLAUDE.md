# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Trellis

Local-first, encrypted cannabis consumption tracking PWA. All data stays on-device encrypted with AES-256-GCM. No server-side processing — Cloudflare Pages serves static files only.

## Commands

Uses [Vite+](https://viteplus.dev/) as the unified toolchain (`vp` CLI).

```bash
vp dev               # Dev server at localhost:5173
vp build             # Production build → dist/
vp preview           # Preview production build
vp check             # Lint (oxlint) + format (oxfmt) + type check in one pass
vp check --fix       # Auto-fix lint and formatting issues
vp test run          # Run all Vitest unit + integration tests
vp test run tests/unit/crypto.test.ts  # Run single test file
npm run deploy       # Build + deploy to Cloudflare Pages
npx playwright test  # E2E tests (requires running dev server)
```

## Architecture

**No backend.** Vite dev server locally, Cloudflare Pages in production.

### Encryption flow

Password → PBKDF2 (600k iterations, SHA-256) → wrapping key → AES-GCM unwrap → master key in memory.
Master key never stored in plaintext. Cleared from memory on lock.

### IndexedDB stores (via `idb`)

- `meta` (unencrypted): `{ vault: VaultMeta, 'session-key': CryptoKey }` — salt, encrypted master key blob, session persistence
- `entries` (encrypted): `EncryptedRecord[]` — consumption logs
- `goals` (encrypted): `EncryptedRecord[]` — targets and intentions
- `settings` (encrypted): `EncryptedRecord` — theme, auto-lock, intention text

Each encrypted store write: Zod validate → JSON.stringify → AES-GCM encrypt → store `{id, iv, ciphertext, updatedAt}`.
Each read: fetch → AES-GCM decrypt → JSON.parse → Zod validate.

### State management

React Context only. Two root providers in `App.tsx`:

1. `AuthContext` — vault state machine (`none` → `locked` → `unlocked`), holds `masterKey: CryptoKey | null` in a ref. Auto-locks on `visibilitychange`. "Stay logged in" persists the non-extractable CryptoKey to IndexedDB and caches the flag in `localStorage['trellis-stay-logged-in']` (written by `DataContext.saveSettings`, read synchronously by AuthContext on init).
2. `DataContext` — encrypted CRUD; loads/clears data on vault state changes.

### Key files

| File                           | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `src/lib/crypto.ts`            | All WebCrypto operations (PBKDF2, AES-GCM, wrap/unwrap)          |
| `src/lib/db.ts`                | IndexedDB via `idb` — vault meta + encrypted CRUD                |
| `src/lib/schemas.ts`           | Zod schemas for all data types (validate on both write and read) |
| `src/types/index.ts`           | TypeScript interfaces                                            |
| `src/contexts/AuthContext.tsx` | Vault state machine                                              |
| `src/contexts/DataContext.tsx` | Encrypted data provider with in-memory cache                     |
| `src/hooks/useInsights.ts`     | Client-side aggregation for charts (memoized)                    |

### Routing

React Router v7 inside `<AppShell>` (Header + BottomNav). 4 tabs: Log (`/`), Journal (`/journal`), Insights (`/insights`), Goals (`/goals`). Settings at `/settings`. InsightsPage is lazy-loaded to defer Recharts bundle (~367KB gzip ~107KB).

### Styling

Tailwind v4 CSS-first. Theme tokens defined in `src/index.css` as CSS variables. Dark mode via `.dark` class on `<html>`. Theme applied immediately in `main.tsx` before React renders (reads `localStorage['trellis-theme']`) to prevent flash.

## Testing

- **Unit** (`tests/unit/`): crypto roundtrips, Zod schema validation, insights aggregation logic
- **Integration** (`tests/integration/`): IndexedDB CRUD with `fake-indexeddb`, auth flow
- **E2E** (`tests/e2e/`): Playwright on mobile viewports (not yet written — run `npx playwright test` after implementing)

Run `vp test run` for unit + integration tests (75 tests, ~1.5s).

## Deployment

```bash
npm run deploy       # vp check && vp build && wrangler pages deploy
```

CI/CD via GitHub Actions: pushes to `main` run checks + tests, then auto-deploy to Cloudflare Pages. `wrangler.toml` and `public/_headers` are already configured.
