# agenda

A local-first paper-style planner: weekly and monthly spreads, rich-text day entries, a drawing
layer on every page, everything stored in SQLite on your device. See `ARCHITECTURE.md` for how it
is put together and `TS_MIGRATION_PLAN.md` for the plan it follows.

## Prerequisites (Windows, not WSL)

- Node.js 22+ and Yarn 1
- Rust (stable) and the Tauri 2 prerequisites (WebView2, MSVC build tools)

## Commands

```sh
yarn install                      # once, from the repo root
yarn dev                          # desktop app (Vite + Tauri shell in apps/desktop)
yarn --cwd apps/frontend dev      # the app in a browser on sql.js, http://localhost:3000
yarn test                         # unit and parity tests
yarn smoke                        # browser smoke test on the installed Edge
yarn build                        # desktop bundle
```

Data from the previous Rust-backed build can be imported once the desktop app has been launched
once: `node apps/desktop/scripts/import-legacy-db.mjs --dry-run`, then without `--dry-run`.
