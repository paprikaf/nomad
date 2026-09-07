import { createApp, defineEventHandler, toWebHandler } from "h3";
import { describe, expect, it, vi } from "vitest";

import { createNetlifySyncGuard } from "./netlify-sync";

function runtime(netlify = true) {
  const app = createApp();
  const downstream = vi.fn(
    () => new Response("framework route", { status: 401 }),
  );
  app.use(createNetlifySyncGuard(netlify));
  app.use(defineEventHandler(downstream));
  return { request: toWebHandler(app), downstream };
}

describe("Netlify idle sync containment", () => {
  it.each(["events", "poll-events"])(
    "ends the %s stream before the framework opens an idle connection",
    async (route) => {
      const { request, downstream } = runtime();
      const response = await request(
        new Request(`https://example.test/_agent-native/${route}?since=42`),
      );
      expect(response.status).toBe(204);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe("");
      expect(downstream).not.toHaveBeenCalled();
    },
  );

  it.each([
    "/_agent-native/poll?since=42",
    "/_agent-native/agent-chat",
    "/_agent-native/agent-chat/stream",
    "/_agent-native/auth/session",
    "/_agent-native/actions/list-stays",
    "/_agent-native/events/other",
    "/other/_agent-native/events",
  ])("preserves normal routing and auth for %s", async (path) => {
    const { request, downstream } = runtime();
    const response = await request(new Request(`https://example.test${path}`));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("framework route");
    expect(downstream).toHaveBeenCalledOnce();
  });

  it("leaves non-Netlify sync routing unchanged", async () => {
    const { request, downstream } = runtime(false);
    const response = await request(
      new Request("https://example.test/_agent-native/events"),
    );
    expect(response.status).toBe(401);
    expect(downstream).toHaveBeenCalledOnce();
  });

  it("does not bypass framework method checks for writes", async () => {
    const { request, downstream } = runtime();
    const response = await request(
      new Request("https://example.test/_agent-native/events", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(401);
    expect(downstream).toHaveBeenCalledOnce();
  });
});
