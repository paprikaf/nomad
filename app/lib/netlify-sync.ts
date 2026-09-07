import type { MultiTabAssistantChatProps } from "@agent-native/core/client/agent-chat";

const netlify = import.meta.env.VITE_NOMAD_NETLIFY_SYNC === "true";

// Keep the same transport key as the sidebar's internal subscriber. Disabling
// SSE on only this hook would create a second independent /poll loop.
export const netlifySyncOptions = netlify ? { pauseWhenHidden: true } : {};

// AgentChatSurface forwards these public MultiTabAssistantChat options.
// AgentSidebar does not expose this option, so its cadence remains unchanged.
export const netlifyChatPollingOptions: Pick<
  MultiTabAssistantChatProps,
  "agentTeamPollMs"
> = netlify ? { agentTeamPollMs: 60_000 } : {};
