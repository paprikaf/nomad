# Nomad

Nomad is an agent-native residency and tax-presence cockpit for digital nomads.
It tracks Schengen 90/180 windows, 183-day tax thresholds, residence minimums,
planned travel, and inbox-derived travel confirmations — with an AI agent that
shares the same data and actions as the UI.

Estimates are for informational purposes only and are not legal or tax advice.
Consult a qualified cross-border tax or immigration professional before making
real travel or residency decisions.

Built on [Agent Native](https://github.com/BuilderIO/agent-native).

## Quickstart

Requires the Node version pinned in `.nvmrc` (better-sqlite3's prebuilt binary
is ABI-locked to whatever Node version runs the install).

```bash
nvm use          # or install/use the version in .nvmrc directly
pnpm install
cp .env.example .env
PORT=8106 pnpm dev
```

Open http://localhost:8106.

## Scripts

- `pnpm dev` — start the dev server
- `pnpm build` / `pnpm start` — production build and start
- `pnpm typecheck` — typecheck the app
- `pnpm test` — run the compliance-engine test suite
- `pnpm action <name>` — invoke an app action from the CLI

## Install as a template

```bash
npx @agent-native/core@latest create my-app --template github:paprikaf/nomad
```

See `AGENTS.md` for the domain model and action surface, and `DEVELOPING.md`
for architecture notes.
