import {
  createCoreRoutesPlugin,
  getH3App,
  markDefaultPluginProvided,
} from "@agent-native/core/server";

import { createNetlifySyncGuard } from "../lib/netlify-sync.js";

// Nitro embeds the target in every bundle, including deploy previews. Unlike
// netlify.toml build variables, this does not depend on runtime env injection.
const netlify = import.meta.preset?.startsWith("netlify") === true;
const corePlugin = createCoreRoutesPlugin({ disableSSE: netlify });

export default (nitroApp: Parameters<typeof corePlugin>[0]) => {
  markDefaultPluginProvided(nitroApp, "core-routes");
  getH3App(nitroApp).use(createNetlifySyncGuard(netlify));
  return corePlugin(nitroApp);
};
