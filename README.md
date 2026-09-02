# Nomad

Nomad is an agent-native residency and tax-presence cockpit for digital nomads.
It tracks Schengen 90/180 windows, 183-day tax thresholds, residence minimums,
and planned travel — with an AI agent that shares the same data and actions as
the UI.

Estimates are for informational purposes only and are not legal or tax advice.
Consult a qualified cross-border tax or immigration professional before making
real travel or residency decisions.

Built on [Agent Native](https://github.com/BuilderIO/agent-native).

## Import travel from Mail

Nomad does not embed the Mail template or store Gmail credentials. The
**Find trips in Mail** button opens Nomad's agent, which delegates a bounded,
read-only search to the existing [Agent-Native Mail](https://mail.agent-native.com/inbox)
agent over A2A. Mail first verifies a live Gmail connection, then returns
minimal travel evidence; Nomad stages only new candidates as pending stays for
confirmation.

For a deployed app, configure `A2A_SECRET` and connect Nomad and Mail under the
same Agent Native organization using **Organization → Cross-app authentication**.
Connect Gmail in Mail itself. Local development allows unauthenticated A2A;
that applies only when both apps run locally. A local Nomad calling hosted Mail,
and all hosted runtimes, require cross-app authentication and fail closed when
it is missing.

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

The framework's browser demo toggle swaps the cockpit to fabricated sample
data for presentation. It is not an authentication or data-isolation boundary:
the backend and agent remain connected to the signed-in user's real workspace.
Never publish a deployment with `AUTH_DISABLED=true`.

## Scripts

- `pnpm dev` — start the dev server
- `pnpm build` / `pnpm start` — production build and start
- `pnpm migrate:production` — apply framework and Nomad migrations during a
  release, before production traffic reaches the new build
- `pnpm typecheck` — typecheck the app
- `pnpm test` — run the compliance-engine test suite
- `pnpm action <name>` — invoke an app action from the CLI

## Install as a template

```bash
npx @agent-native/core@latest create my-app --template community:paprikaf/nomad
```

## Deploying a private preview

Use an authenticated preview with a dedicated test account and fabricated data.
Configure these values in the host's secret manager:

- `DATABASE_URL` — a persistent PostgreSQL or libSQL database; local SQLite is
  not durable on serverless hosts.
- `BETTER_AUTH_SECRET` — a unique random value generated for this deployment.
- `A2A_SECRET` — a unique random value used to sign production A2A requests.
- `APP_URL` — the canonical HTTPS origin of the deployed app.
- `DATABASE_AUTH_TOKEN` — only when required by the database provider.

The included `netlify.toml` runs `pnpm migrate:production` after a successful
production build. On another host, add that command to its release phase rather
than running migrations on the first request.

Do not use `AUTH_DISABLED` for a public or shared preview. A future anonymous
demo should use a server-enforced, read-only sample-data boundary.

See `AGENTS.md` for the domain model and action surface, and `DEVELOPING.md`
for architecture notes.
