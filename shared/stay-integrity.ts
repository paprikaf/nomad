import { dayNumber } from "./compliance";
import type { Stay } from "./types";

export type StayInterval = Pick<
  Stay,
  "id" | "countryCode" | "entryDate" | "exitDate" | "status"
>;

/** True when a confirmed stay in `countryCode` already covers `date`. */
export function confirmedStayCoversDate(
  stay: StayInterval,
  countryCode: string,
  date: string,
): boolean {
  if (
    stay.status !== "confirmed" ||
    stay.countryCode.toUpperCase() !== countryCode.toUpperCase()
  ) {
    return false;
  }
  const day = dayNumber(date);
  return (
    dayNumber(stay.entryDate) <= day &&
    (stay.exitDate === null || dayNumber(stay.exitDate) >= day)
  );
}

/**
 * Reject a proposed confirmed stay that makes the physical-presence ledger
 * impossible. Entry and exit dates are inclusive, so two different countries
 * may share exactly one boundary day for travel; no other overlap is allowed.
 * Pending evidence is deliberately exempt until the user confirms it.
 */
export function assertConfirmedStayIntegrity(
  candidate: StayInterval,
  existing: StayInterval[],
): void {
  if (candidate.status !== "confirmed") return;

  const candidateStart = dayNumber(candidate.entryDate);
  const candidateEnd = candidate.exitDate
    ? dayNumber(candidate.exitDate)
    : Infinity;
  const transitionParticipants = new Map<number, Set<string>>();

  for (const other of existing) {
    if (other.id === candidate.id || other.status !== "confirmed") continue;

    if (candidate.exitDate === null && other.exitDate === null) {
      throw new Error(
        "Only one confirmed ongoing stay can be open at a time. Close the current stay before opening another.",
      );
    }

    const otherStart = dayNumber(other.entryDate);
    const otherEnd = other.exitDate ? dayNumber(other.exitDate) : Infinity;
    const overlapStart = Math.max(candidateStart, otherStart);
    const overlapEnd = Math.min(candidateEnd, otherEnd);
    if (overlapStart > overlapEnd) continue;

    const oneDayCountryTransition =
      overlapStart === overlapEnd &&
      candidate.countryCode.toUpperCase() !== other.countryCode.toUpperCase() &&
      ((candidate.exitDate !== null && candidateEnd === otherStart) ||
        (other.exitDate !== null && otherEnd === candidateStart));

    if (!oneDayCountryTransition) {
      throw new Error(
        "Confirmed stays cannot overlap. A move between different countries may share only its single transition day.",
      );
    }

    const participants =
      transitionParticipants.get(overlapStart) ?? new Set<string>();
    participants.add(candidate.id);
    participants.add(other.id);
    if (participants.size > 2) {
      throw new Error(
        "A transition day can include at most the country being left and the country being entered.",
      );
    }
    transitionParticipants.set(overlapStart, participants);
  }
}
