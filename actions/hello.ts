import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: "Return a friendly greeting.",
  schema: z.object({
    name: z.string().min(1).max(100).default("world").describe("Name to greet"),
  }),
  http: { method: "GET" },
  run: async ({ name }) => {
    return { message: `Hello, ${name}!` };
  },
});
