import {
  ensureAdditiveColumns,
  getDbExec,
  runMigrations,
} from "@agent-native/core/db";

import * as schema from "../db/schema.js";

function isDrizzleTable(value: unknown): value is object {
  return (
    !!value &&
    typeof value === "object" &&
    Object.getOwnPropertySymbols(value).some((s) =>
      s.toString().includes("drizzle"),
    )
  );
}

const schemaTables = Object.values(schema).filter(isDrizzleTable);

// Convention: every migration entry carries a unique `name:` slug so parallel
// branches can never claim each other's version numbers (see the storing-data
// skill for the full rationale).
const runNomadMigrations = runMigrations(
  [
    {
      version: 1,
      name: "nomad-stays-table",
      sql: `CREATE TABLE IF NOT EXISTS stays (
    id TEXT PRIMARY KEY,
    country_code TEXT NOT NULL,
    city TEXT,
    entry_date TEXT NOT NULL,
    exit_date TEXT,
    source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'inbox', 'import')),
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'pending')),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
    },
    {
      version: 2,
      name: "nomad-rules-table",
      sql: `CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('rolling-window', 'calendar-year', 'presence-minimum')),
    country_code TEXT,
    zone TEXT,
    limit_days INTEGER NOT NULL,
    window_days INTEGER,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
    },
    {
      version: 3,
      name: "nomad-stays-entry-date-idx",
      sql: `CREATE INDEX IF NOT EXISTS stays_entry_date_idx ON stays (entry_date)`,
    },
    {
      version: 4,
      name: "nomad-stays-country-idx",
      sql: `CREATE INDEX IF NOT EXISTS stays_country_code_idx ON stays (country_code)`,
    },
    {
      version: 5,
      name: "nomad-visas-table",
      sql: `CREATE TABLE IF NOT EXISTS visas (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    country_code TEXT,
    zone TEXT,
    expires_on TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
    },
    {
      version: 6,
      name: "nomad-visas-valid-from",
      sql: `ALTER TABLE visas ADD COLUMN IF NOT EXISTS valid_from TEXT`,
    },
    {
      version: 7,
      name: "nomad-per-user-owner-email",
      sql: `ALTER TABLE stays ADD COLUMN IF NOT EXISTS owner_email TEXT NOT NULL DEFAULT 'local@localhost';
ALTER TABLE rules ADD COLUMN IF NOT EXISTS owner_email TEXT NOT NULL DEFAULT 'local@localhost';
ALTER TABLE visas ADD COLUMN IF NOT EXISTS owner_email TEXT NOT NULL DEFAULT 'local@localhost'`,
    },
    {
      version: 8,
      name: "nomad-stays-owner-idx",
      sql: `CREATE INDEX IF NOT EXISTS stays_owner_email_idx ON stays (owner_email)`,
    },
    {
      version: 9,
      name: "nomad-rules-preset-slug-column",
      sql: `ALTER TABLE rules ADD COLUMN IF NOT EXISTS preset_slug TEXT`,
    },
    {
      version: 10,
      name: "nomad-rules-owner-preset-slug-unique-idx",
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS rules_owner_preset_slug_unique_idx ON rules (owner_email, preset_slug)`,
    },
  ],
  { table: "nomad_migrations" },
);

export default async (nitroApp: unknown): Promise<void> => {
  await runNomadMigrations(nitroApp);
  try {
    const summary = await ensureAdditiveColumns({
      db: getDbExec(),
      tables: schemaTables,
    });
    if (summary.errors.length > 0) {
      console.warn(
        "[db] ensureAdditiveColumns completed with errors:",
        summary.errors,
      );
    }
  } catch (err) {
    console.warn(
      "[db] ensureAdditiveColumns failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }
};
