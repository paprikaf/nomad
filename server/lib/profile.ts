import { getSetting, putSetting } from "@agent-native/core/settings";

import { canonicalTimeZone, isValidTimeZone } from "../../shared/compliance.js";
import type { NomadProfile } from "../../shared/types.js";
import { requireOwner } from "./owner.js";

export const DEFAULT_PROFILE: NomadProfile = {
  timeZone: "UTC",
  fiscalHomeCountry: null,
  citizenshipCountry: null,
  immigrationStatus: null,
  goals: [],
  trackedCountries: [],
  mailScanEnabled: false,
  scanFrequency: "weekly",
  lastScanAt: null,
  onboardingCompleted: false,
};

/**
 * Profile is per-user data (citizenship, visas context, travel goals) — the
 * settings key is scoped to the authenticated user, mirroring the
 * `u:<email>:...` convention core uses for credentials.
 */
function profileKey(): string {
  return `u:${requireOwner()}:nomad-profile`;
}

export async function getProfile(): Promise<NomadProfile> {
  const stored = (await getSetting(
    profileKey(),
  )) as Partial<NomadProfile> | null;
  const merged = { ...DEFAULT_PROFILE, ...(stored ?? {}) };
  merged.timeZone =
    typeof stored?.timeZone === "string" && isValidTimeZone(stored.timeZone)
      ? (canonicalTimeZone(stored.timeZone) ?? DEFAULT_PROFILE.timeZone)
      : DEFAULT_PROFILE.timeZone;
  return merged;
}

export async function saveProfile(
  patch: Partial<NomadProfile>,
): Promise<NomadProfile> {
  if (patch.timeZone !== undefined && !isValidTimeZone(patch.timeZone)) {
    throw new Error("timeZone must be a valid IANA time-zone identifier");
  }
  if (patch.timeZone !== undefined) {
    patch = {
      ...patch,
      timeZone: canonicalTimeZone(patch.timeZone) ?? DEFAULT_PROFILE.timeZone,
    };
  }
  const next = { ...(await getProfile()), ...patch };
  await putSetting(profileKey(), next);
  return next;
}
