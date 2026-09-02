import { closeDbExec, withMigrationRuntime } from "@agent-native/core/db";
import { runFrameworkReleaseMigrations } from "@agent-native/core/server";

import { runNomadMigrations } from "../server/plugins/db.js";

/**
 * Release-time schema entrypoint for this community template.
 *
 * The repository's hosted deployment runs this after a successful production
 * build. People who scaffold the template inherit the same command and can run
 * it from their own release pipeline against their configured database.
 */
async function main(): Promise<void> {
  await withMigrationRuntime(async () => {
    await runFrameworkReleaseMigrations(null);
    await runNomadMigrations(null);
  });
}

try {
  await main();
} finally {
  await closeDbExec();
}
