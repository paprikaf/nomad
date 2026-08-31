import { createAuthPlugin } from "@agent-native/core/server";

export default createAuthPlugin({
  marketing: {
    appName: "Nomad",
    tagline:
      "A private control room for travel history, visa windows, and residency day counts.",
    features: [
      "Keep a durable presence ledger across every country you visit",
      "Monitor Schengen, tax-residency, visa, and permanent-residency thresholds",
      "Plan with deterministic day counts and an agent that can act on your records",
    ],
  },
});
