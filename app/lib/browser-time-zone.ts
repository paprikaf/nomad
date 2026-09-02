import { useEffect, useState } from "react";

/** The current browser's canonical IANA time zone, with a safe UTC fallback. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Resolve only after hydration so server UTC never seeds a browser query. */
export function useBrowserTimeZone(): string | null {
  const [timeZone, setTimeZone] = useState<string | null>(null);
  useEffect(() => setTimeZone(browserTimeZone()), []);
  return timeZone;
}
