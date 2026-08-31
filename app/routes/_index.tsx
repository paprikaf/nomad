import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useT } from "@agent-native/core/client/i18n";
import {
  IconInfoCircle,
  IconMailSearch,
  IconMapPin,
  IconPlus,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router";

import { AlertsPanel } from "@/components/nomad/AlertsPanel";
import { CountdownCard } from "@/components/nomad/CountdownCard";
import { CountryQuickActions } from "@/components/nomad/CountryQuickActions";
import { PassportChip } from "@/components/nomad/PassportChip";
import { RuleCards } from "@/components/nomad/RuleCards";
import { StayDialog } from "@/components/nomad/StayDialog";
import { TripTimeline } from "@/components/nomad/TripTimeline";
import { VisaDialog } from "@/components/nomad/VisaDialog";
import { WorldMap, type MapCountryStatus } from "@/components/nomad/WorldMap";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadPresenceCsv } from "@/lib/nomad";
import { useComplianceSnapshot } from "@/lib/use-compliance-snapshot";

import { countryFlag, countryName } from "../../shared/countries";
import type { Stay } from "../../shared/types";

const SEO_TITLE = "Nomad — Presence Cockpit";
const SEO_DESCRIPTION =
  "Residency and tax presence cockpit for digital nomads: a travel ledger, traffic-light map, Schengen 90/180 countdowns, and tax-day counters.";

export function meta() {
  return [
    { title: SEO_TITLE },
    { name: "description", content: SEO_DESCRIPTION },
    { property: "og:title", content: SEO_TITLE },
    { property: "og:description", content: SEO_DESCRIPTION },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: SEO_TITLE },
    { name: "twitter:description", content: SEO_DESCRIPTION },
  ];
}

export default function CockpitRoute() {
  const t = useT();
  const navigate = useNavigate();
  const {
    data: snap,
    isDemo,
    error,
    refetch,
    isFetching,
  } = useComplianceSnapshot();
  const [dialogStay, setDialogStay] = useState<Stay | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogCountry, setDialogCountry] = useState<string | undefined>();
  const [visaDialogOpen, setVisaDialogOpen] = useState(false);
  const [visaCountry, setVisaCountry] = useState<string | undefined>();

  const mapStatuses = useMemo<MapCountryStatus[]>(() => {
    if (!snap) return [];
    const ruleById = new Map(snap.rules.map((rc) => [rc.rule.id, rc]));
    return snap.countries.map((c) => ({
      code: c.countryCode,
      severity: c.severity,
      here: c.here,
      usedDays: c.usedDays,
      limitDays: c.limitDays,
      ruleName: c.primaryRuleId
        ? (ruleById.get(c.primaryRuleId)?.rule.name ?? null)
        : null,
      // ruleIds arrive actionability-ranked (primary first) from the engine.
      rules: c.ruleIds.flatMap((id) => {
        const rc = ruleById.get(id);
        return rc
          ? [
              {
                name: rc.rule.name,
                usedDays: rc.usedDays,
                limitDays: rc.limitDays,
                severity: rc.severity,
              },
            ]
          : [];
      }),
    }));
  }, [snap]);

  // Hero countdown: the tightest max-rule at the current location.
  const countdownRule = useMemo(() => {
    if (!snap) return null;
    const present = snap.rules.filter(
      (rc) => rc.present && rc.rule.kind !== "presence-minimum",
    );
    if (present.length === 0) return null;
    const withExit = present.filter((rc) => rc.daysUntilExit !== null);
    if (withExit.length > 0) {
      return withExit.reduce((a, b) =>
        (a.daysUntilExit ?? Infinity) <= (b.daysUntilExit ?? Infinity) ? a : b,
      );
    }
    return present.reduce((a, b) => (a.pct >= b.pct ? a : b));
  }, [snap]);

  if (!snap && !error) {
    return (
      <div className="flex h-full flex-col gap-4 p-6">
        <Skeleton className="h-14 w-full" />
        <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-12">
          <Skeleton className="lg:col-span-8" />
          <Skeleton className="lg:col-span-4" />
        </div>
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="nomad-panel max-w-md p-6 text-center">
          <div className="text-base font-semibold">
            {t("nomad.cockpit.loadErrorTitle")}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("nomad.cockpit.loadErrorBody")}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {t("nomad.cockpit.retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (!snap.profile.onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top status bar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 md:px-6 md:py-4">
        <div className="mr-1">
          <div className="text-xs text-muted-foreground">
            {t("nomad.cockpit.title")}
          </div>
          <div className="text-lg font-semibold leading-tight">
            {t("nomad.cockpit.subtitle")}
          </div>
        </div>
        {snap.profile.fiscalHomeCountry && (
          <div className="nomad-chip hidden items-center gap-2 px-3 py-1.5 text-xs sm:flex">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "hsl(var(--primary))" }}
            />
            {t("nomad.cockpit.fiscalHome")}
            <b className="text-foreground">
              {countryFlag(snap.profile.fiscalHomeCountry)}{" "}
              {countryName(snap.profile.fiscalHomeCountry)}
              {snap.profile.immigrationStatus === "pr"
                ? ` · ${t("nomad.cockpit.prBadge")}`
                : ""}
            </b>
          </div>
        )}
        <PassportChip
          citizenshipCountry={snap.profile.citizenshipCountry}
          disabled={isDemo}
        />
        {snap.currentLocation && (
          <div className="nomad-chip hidden items-center gap-1.5 px-3 py-1.5 text-xs md:flex">
            <IconMapPin className="size-3.5 text-muted-foreground" />
            {t("nomad.cockpit.nowIn")}
            <b className="text-foreground">
              {snap.currentLocation.city
                ? `${snap.currentLocation.city}, ${snap.currentLocation.countryCode}`
                : countryName(snap.currentLocation.countryCode)}
            </b>
            · {t("nomad.cockpit.dayN", { day: snap.currentLocation.dayNumber })}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {isDemo && (
            <span className="nomad-chip border-primary/25 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
              {t("nomad.demo.sampleData")}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="rounded-lg text-xs font-medium"
            disabled={isDemo}
            title={isDemo ? t("nomad.demo.disabledHint") : undefined}
            onClick={() =>
              sendToAgentChat({
                message: t("nomad.cockpit.findTripsInMailPrompt"),
                submit: true,
                openSidebar: true,
              })
            }
          >
            <IconMailSearch className="size-3.5" />
            {t("nomad.cockpit.findTripsInMail")}
          </Button>
          <Button
            size="sm"
            className="rounded-lg text-xs font-medium"
            disabled={isDemo}
            title={isDemo ? t("nomad.demo.disabledHint") : undefined}
            onClick={() => {
              setDialogStay(null);
              setDialogCountry(undefined);
              setDialogOpen(true);
            }}
          >
            <IconPlus className="size-3.5" />
            {t("nomad.cockpit.addTrip")}
          </Button>
        </div>
      </header>

      <div className="flex items-start gap-2 border-b border-border/70 bg-muted/30 px-4 py-2 text-xs text-muted-foreground md:px-6">
        <IconInfoCircle className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {isDemo ? `${t("nomad.demo.samplePrefix")} ` : ""}
          {t("nomad.cockpit.disclaimer")}
        </span>
        {error && (
          <button
            type="button"
            className="ml-auto shrink-0 font-medium text-foreground underline-offset-4 hover:underline"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {t("nomad.cockpit.retry")}
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mx-4 mt-4 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive md:mx-6"
        >
          {t("nomad.cockpit.staleData")}
        </div>
      )}

      {/* Body grid */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto p-4 md:p-6 lg:grid-cols-12 lg:overflow-hidden">
        <section className="flex min-h-[480px] flex-col gap-5 lg:col-span-8 lg:min-h-0">
          <WorldMap
            statuses={mapStatuses}
            onSelect={(code) => navigate(`/countries/${code}`)}
            quickActions={(code, close) => (
              <CountryQuickActions
                code={code}
                snapshot={snap}
                close={close}
                disabled={isDemo}
                onLogTrip={(c) => {
                  setDialogStay(null);
                  setDialogCountry(c);
                  setDialogOpen(true);
                }}
                onAddVisa={(c) => {
                  setVisaCountry(c);
                  setVisaDialogOpen(true);
                }}
                onDetails={(c) => navigate(`/countries/${c}`)}
              />
            )}
            overlay={
              countdownRule ? (
                <CountdownCard
                  rule={countdownRule}
                  capLabel={
                    countdownRule.cappedByVisaId
                      ? (snap.visas.find(
                          (vc) => vc.visa.id === countdownRule.cappedByVisaId,
                        )?.visa.label ?? null)
                      : null
                  }
                />
              ) : null
            }
          />
          <TripTimeline
            snapshot={snap}
            disabled={isDemo}
            onEdit={(stay) => {
              setDialogStay(stay);
              setDialogOpen(true);
            }}
          />
        </section>

        <aside className="flex min-h-0 flex-col gap-4 lg:col-span-4 lg:overflow-y-auto lg:pr-1">
          <AlertsPanel alerts={snap.alerts} disabled={isDemo} />
          <RuleCards
            rules={snap.rules}
            onExport={() =>
              downloadPresenceCsv(
                [...snap.trips, ...snap.pendingStays],
                isDemo ? "nomad-demo-presence-log.csv" : "presence-log.csv",
              )
            }
          />
        </aside>
      </div>

      <StayDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setDialogCountry(undefined);
        }}
        stay={dialogStay}
        defaultCountryCode={dialogCountry}
      />
      <VisaDialog
        open={visaDialogOpen}
        onOpenChange={setVisaDialogOpen}
        visa={null}
        defaultCountryCode={visaCountry}
      />
    </div>
  );
}
