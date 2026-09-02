import { useT } from "@agent-native/core/client/i18n";

import type { Stay } from "../../../shared/types";

type EvidenceKind = NonNullable<Stay["evidenceKind"]>;

const EVIDENCE_KEYS: Record<EvidenceKind, string> = {
  flight: "nomad.mailEvidence.flight",
  rail: "nomad.mailEvidence.rail",
  accommodation: "nomad.mailEvidence.accommodation",
  visa: "nomad.mailEvidence.visa",
  entry: "nomad.mailEvidence.entry",
};

export function MailEvidence({
  account,
  messageId,
  threadId,
  kind,
  provider,
  confidence,
}: {
  account?: string | null;
  messageId?: string | null;
  threadId?: string | null;
  kind?: Stay["evidenceKind"];
  provider?: string | null;
  confidence?: number | null;
}) {
  const t = useT();
  const reference = messageId ?? threadId;
  const summary = [
    provider,
    kind ? t(EVIDENCE_KEYS[kind]) : null,
    confidence !== null && confidence !== undefined
      ? t("nomad.mailEvidence.confidence", { confidence })
      : null,
  ].filter(Boolean);

  if (summary.length === 0 && !account && !reference) return null;

  return (
    <div
      data-sensitive="true"
      className="mt-2 min-w-0 rounded-md border border-border/70 bg-background/55 px-2.5 py-2 text-[11px] text-muted-foreground"
    >
      <div className="font-medium text-foreground/80">
        {t("nomad.mailEvidence.label")}
      </div>
      {summary.length > 0 && (
        <div className="mt-0.5 break-words">{summary.join(" · ")}</div>
      )}
      {(account || reference) && (
        <div
          className="mt-0.5 truncate font-mono text-[10px]"
          title={[account, reference].filter(Boolean).join(" · ")}
        >
          {[account, reference ? shortenReference(reference) : null]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}
    </div>
  );
}

function shortenReference(value: string): string {
  if (value.length <= 24) return value;
  return `${value.slice(0, 9)}…${value.slice(-10)}`;
}
