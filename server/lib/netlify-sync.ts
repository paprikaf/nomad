import { defineEventHandler, getMethod, getRequestURL } from "h3";

const SYNC_STREAM_PATHS = new Set([
  "/_agent-native/events",
  "/_agent-native/poll-events",
]);

/** Only the optional database-sync stream is disabled; chat keeps streaming. */
export function createNetlifySyncGuard(netlify: boolean) {
  return defineEventHandler((event) => {
    if (
      !netlify ||
      getMethod(event) !== "GET" ||
      !SYNC_STREAM_PATHS.has(getRequestURL(event).pathname)
    ) {
      return;
    }

    // Old tabs and the sidebar's internal subscriber also reach this guard.
    // Core's existing /poll fallback carries cross-process changes on Netlify.
    return new Response(null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
  });
}
