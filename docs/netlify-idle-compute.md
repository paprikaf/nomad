# Netlify idle compute

Netlify bills function execution time while an HTTP connection stays open,
including a database-sync SSE connection with no activity. An authenticated
browser tab used to keep `/_agent-native/events` open, hit the function timeout,
and reconnect even when the tab was hidden. Request-path and duration inspection
identified this as the main observed source of idle execution time.

Netlify builds, including previews, now return HTTP 204 promptly for the two
optional database-sync stream paths: `/_agent-native/events` and its legacy
`/_agent-native/poll-events` alias. The app configures the public core-routes
plugin with SSE disabled, retaining its existing polling fallback, auth, actions,
agent execution and chat streaming. The Nitro build target controls this policy;
non-Netlify deployments retain the framework defaults.

New pages pause their root `useDbSync` subscription while hidden when every
subscriber agrees. They retain the sidebar's shared transport key; setting
`sseUrl: false` only on the root would create a second independent polling loop.
Core still polls every two seconds during active agent work, every minute while
idle, and immediately on focus. The page chat's agent-team status checks run
every minute instead of every three seconds, so spawned-agent status can take
up to a minute to refresh even during active work. Main chat streaming is
unchanged.

Core 0.176.1's AgentSidebar owns a separate default screen-refresh subscription
and does not expose its sync or team-poll settings. Its old clients can retry the
204 stream with backoff and retain small hidden-tab polls. The server guard is
therefore essential; changing the root hook alone does not stop the billed
streams. A future shared framework sync policy should replace this containment,
configure all subscribers consistently, and remove the residual requests. Do not
copy or patch Core's protected transport runtime to do so.

When changing or removing this policy, verify a built Netlify entrypoint with an
old open tab and a fresh page. Both sync stream paths must finish promptly;
authenticated polling, a chat response, action-driven screen updates and the
sidebar handoff must still work. Compare function duration by request path after
deployment. Scheduled work and recovery workers were not the primary observed
cause and remain unchanged.

Local verification used the built Netlify handler with disposable Postgres and
real authentication. Both sync paths completed with 204; a stay action produced
poll change events and a persisted record; protected reads still rejected
unauthenticated requests. Browser signup, onboarding and Chat navigation loaded.
The real chat endpoint retained its 200 SSE response and reached the expected
missing-provider terminal error without a configured AI key. This verifies the
transport boundary, not a paid model response or the eventual production bill.
