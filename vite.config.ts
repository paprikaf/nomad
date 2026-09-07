import { createRequire } from "node:module";

import { agentNative } from "@agent-native/core/vite";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

const reactRouterPlugins = reactRouter as unknown as () => any[];
const agentNativePlugins = agentNative as unknown as (
  options?: Parameters<typeof agentNative>[0],
) => any[];
const appRequire = createRequire(import.meta.url);
const coreRequire = createRequire(
  appRequire.resolve("@agent-native/core/vite"),
);
const netlifyTarget =
  // guard:allow-env-credential — NITRO_PRESET is the build target, not a user credential.
  process.env.NITRO_PRESET?.startsWith("netlify") ??
  process.env.NETLIFY === "true";

export default defineConfig({
  define: {
    // Netlify builds include previews. Match the server's compiled Nitro preset.
    "import.meta.env.VITE_NOMAD_NETLIFY_SYNC": JSON.stringify(
      netlifyTarget ? "true" : "false",
    ),
  },
  resolve: {
    // Core and Toolkit both use Assistant UI contexts. Force one published
    // instance so chat state and the contextual sidebar share the same store.
    dedupe: [
      "@assistant-ui/react",
      "@assistant-ui/core",
      "@assistant-ui/store",
      "@assistant-ui/tap",
    ],
    alias: [
      {
        find: /^@assistant-ui\/react$/,
        replacement: coreRequire.resolve("@assistant-ui/react"),
      },
      {
        find: /^@assistant-ui\/core$/,
        replacement: coreRequire.resolve("@assistant-ui/core"),
      },
      {
        find: /^@assistant-ui\/store$/,
        replacement: coreRequire.resolve("@assistant-ui/store"),
      },
      {
        find: /^@assistant-ui\/tap$/,
        replacement: coreRequire.resolve("@assistant-ui/tap"),
      },
      {
        find: /^assistant-stream$/,
        replacement: coreRequire.resolve("assistant-stream"),
      },
      {
        find: /^assistant-stream\/utils$/,
        replacement: coreRequire.resolve("assistant-stream/utils"),
      },
    ],
  },
  plugins: [
    ...reactRouterPlugins(),
    ...agentNativePlugins({
      // shiki only runs in AssistantChat's useEffect — keep it out of the
      // CF Pages Functions bundle (25 MiB limit).
      ssrStubs: ["shiki"],
    }),
  ],
});
