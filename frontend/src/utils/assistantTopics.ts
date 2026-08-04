// Page-aware suggested topics for FleetChatAssistant. Each page/role gets
// 4-5 curated topics, each one deliberately fusing 2+ real backend sources
// into a single dense, analyst-style answer — the kind of thing you'd
// otherwise have to visit several dashboard sections to piece together
// yourself. Every number is fetched live; only the narrative structure
// (headline -> synthesis -> named evidence -> comparison -> recommendation)
// is authored. See the plan this was built from for the full endpoint audit.

export type AssistantRole = "executive" | "monitoring" | "engineering";
export type PageKey = "cockpit-view" | "fleet-health" | "automotive" | "dtc" | "datascience";

export interface TopicContext {
  selectedVehicle: string | null;
  selectedModule: string;
  fleetPositions: any[] | undefined;
  fleetSummary: any | undefined;
  connected: boolean;
}

export interface FetchSpec {
  key: string;
  url: string;
  params?: Record<string, unknown>;
}

export interface AssistantTopic {
  key: string;
  label: string | ((ctx: TopicContext) => string);
  match: (normalized: string) => boolean;
  requiresVehicle?: boolean;
  fetches?: (ctx: TopicContext) => FetchSpec[];
  respond: (data: Record<string, any>, ctx: TopicContext) => string;
}

// A plain string entry reuses the existing fleet-wide keyword matcher already
// in FleetChatAssistant.tsx instead of duplicating that logic here — the
// label IS the question text sent through the legacy matcher.
export type TopicEntry = AssistantTopic | string;

const PIPELINE_API = "http://127.0.0.1:8005";
const MODULE_KEYS = ["engine", "transmission", "battery", "body", "tyre"];

const NO_VEHICLE_MSG =
  "Select a vehicle on this page first, then ask me again and I'll look at that vehicle specifically.";

// ---------------------------------------------------------------------------
// House-style narrative helpers — reused across every topic so the voice is
// consistent: a plain number, then an honest read of whether it's good or
// bad against a real threshold, never just a bare fact.
// ---------------------------------------------------------------------------

function liveHealthOf(v: any): number {
  return Number(v?.health ?? 0);
}

function healthRead(value: number): string {
  if (value < 40) return "critical — needs attention now";
  if (value < 60) return "concerning";
  if (value < 80) return "acceptable, but worth watching";
  return "strong";
}

function vsFleetAvg(value: number, avg: number, unit = "pts"): string {
  const diff = Math.round(value - avg);
  if (Math.abs(diff) < 2) return "right in line with the fleet average";
  return diff > 0 ? `${diff} ${unit} above the fleet average` : `${Math.abs(diff)} ${unit} below the fleet average`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function moduleAverages(vehicles: any[]): { mod: string; avg: number }[] {
  return MODULE_KEYS.map((mod) => {
    const values = vehicles.map((v) => Number(v[`${mod}_contrib`] ?? 0)).filter((n) => Number.isFinite(n));
    const avg = values.length ? values.reduce((s, x) => s + x, 0) / values.length : 0;
    return { mod, avg };
  });
}

function flattenDtcRecords(modules: Record<string, any[]> | undefined): any[] {
  return Object.entries(modules ?? {}).flatMap(([mod, records]) => (records ?? []).map((r: any) => ({ ...r, module: mod })));
}

function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
}

// Vehicles not currently "active" (parked/in_service) have no live telemetry
// feeding the real-time alert/DTC pipelines, but the backend keeps a
// precomputed historical layer (data/computed/{id}/*.json) for exactly
// these vehicles — richer than the live-only sources, and only these
// vehicles have it (active vehicles 404 on the historical endpoints).
function vehicleStatusOf(ctx: TopicContext): string | undefined {
  return (ctx.fleetPositions ?? []).find((v) => v.vehicle_id === ctx.selectedVehicle)?.status;
}

function worstAtRiskVehicle(positions: any[]): any {
  return [...positions].filter((v) => liveHealthOf(v) < 50).sort((a, b) => liveHealthOf(a) - liveHealthOf(b))[0];
}

// ---------------------------------------------------------------------------
// Executive @ Cockpit View
// ---------------------------------------------------------------------------
const executiveCockpit: TopicEntry[] = [
  {
    key: "todays-priority",
    label: "Today's priority",
    match: (q: string) => q.includes("priority") || q.includes("top issue"),
    fetches: (ctx) => {
      const worst = worstAtRiskVehicle(ctx.fleetPositions ?? []);
      const specs: FetchSpec[] = [
        { key: "fleetSum", url: `${PIPELINE_API}/api/automotive/fleet-summary` },
        { key: "alerts", url: `${PIPELINE_API}/api/alerts/metrics` },
      ];
      if (worst && worst.status && worst.status !== "active") {
        specs.push({ key: "histAlerts", url: `${PIPELINE_API}/api/automotive/vehicle/${worst.vehicle_id}/alerts` });
      }
      return specs;
    },
    respond: (data, ctx) => {
      const positions = ctx.fleetPositions ?? [];
      const worst = worstAtRiskVehicle(positions);
      if (!worst) return "No vehicle currently needs immediate attention — fleet health is within normal range across all 40 vehicles, so today's priority is routine monitoring rather than firefighting.";
      const vehicles: any[] = data.fleetSum?.vehicles ?? [];
      const entry = vehicles.find((v) => v.vehicle_id === worst.vehicle_id);
      const worstModuleForVehicle = entry
        ? [...MODULE_KEYS].map((m) => ({ m, v: Number(entry[`${m}_contrib`] ?? 100) })).sort((a, b) => a.v - b.v)[0]
        : null;
      const openAlerts: any[] = data.alerts?.open_alerts ?? [];
      const alertForVehicle = openAlerts.find((a) => String(a.source_id) === worst.vehicle_id);
      let alertNote: string;
      if (alertForVehicle) {
        alertNote = ` There's an open alert on it right now (${String(alertForVehicle.module || "").toLowerCase()}, ${Math.round(Number(alertForVehicle.max_composite_score || 0) * 100)}% anomaly score).`;
      } else {
        const histAlerts: any[] = data.histAlerts?.alerts ?? [];
        const liveClosedAlerts: any[] = data.alerts?.closed_alerts ?? [];
        const lastClosed = [
          ...histAlerts.filter((a) => String(a.status).toUpperCase() === "CLOSED"),
          ...liveClosedAlerts.filter((a) => String(a.source_id) === worst.vehicle_id),
        ].sort((a, b) => new Date(b.peak_anomaly_ts ?? 0).getTime() - new Date(a.peak_anomaly_ts ?? 0).getTime())[0];
        alertNote = lastClosed
          ? ` No live alert is open right now, but its last one (${String(lastClosed.module || "").toLowerCase()}, resolved) was raised on ${String(lastClosed.peak_anomaly_ts || "").slice(0, 10)} — worth confirming that issue actually got fixed rather than just aging out.`
          : " No live alert is open on it yet, but at this health level I wouldn't wait for one.";
      }
      const statusNote = worst.status && worst.status !== "active"
        ? ` It's currently ${worst.status === "in_service" ? "already in the workshop" : "parked, not on the road"}, so this is about validating the fix before redeploying it rather than pulling it from a route.`
        : "";
      return `${worst.vehicle_id} is today's priority: health is ${Math.round(liveHealthOf(worst))}% (${healthRead(liveHealthOf(worst))}), status ${worst.status}.${
        worstModuleForVehicle ? ` Its weakest area is the ${worstModuleForVehicle.m} module at ${worstModuleForVehicle.v.toFixed(1)}%.` : ""
      }${alertNote}${statusNote} Recommend inspecting it before its next dispatch rather than waiting for a breakdown to force the issue.`;
    },
  },
  {
    key: "fleet-composition",
    label: "Fleet composition",
    match: (q: string) => q.includes("fleet composition") || q.includes("vehicle mix"),
    respond: (_data, ctx) => {
      const positions = ctx.fleetPositions ?? [];
      const total = positions.length || 1;
      const active = positions.filter((v) => v.status === "active").length;
      const parked = positions.filter((v) => v.status === "parked").length;
      const service = positions.filter((v) => v.status === "in_service").length;
      const avgHealth = positions.reduce((s, v) => s + liveHealthOf(v), 0) / total;
      const avgDriver = positions.reduce((s, v) => s + Number(v.driver_score ?? 0), 0) / total;
      const availability = Math.round(((active + parked) / total) * 100);
      return `${total} vehicles total: ${active} active, ${parked} parked, ${service} in workshop — ${availability}% availability. The fleet that's actually on the road is performing well, averaging ${avgHealth.toFixed(0)}% health and ${avgDriver.toFixed(0)}/100 driver score; the ${service} in workshop is really where your risk and cost concentrate, since none of them are generating utilization while they're there.`;
    },
  },
  {
    key: "biggest-risk-today",
    label: "Biggest risk today",
    match: (q: string) => q.includes("biggest risk") || q.includes("risk today") || q.includes("risk index"),
    fetches: () => [
      { key: "fleetSum", url: `${PIPELINE_API}/api/automotive/fleet-summary` },
      { key: "dtcDist", url: `${PIPELINE_API}/api/automotive/dtc/fleet-distribution` },
    ],
    respond: (data, ctx) => {
      const positions = ctx.fleetPositions ?? [];
      const critical = positions.filter((v) => liveHealthOf(v) < 50);
      const warning = positions.filter((v) => liveHealthOf(v) >= 50 && liveHealthOf(v) < 80);
      const total = positions.length || 1;
      const riskIndex = Math.round(((critical.length * 1.8 + warning.length * 0.75) / total) * 100);
      const topRisk = [...critical].sort((a, b) => liveHealthOf(a) - liveHealthOf(b))[0];
      const vehicles: any[] = data.fleetSum?.vehicles ?? [];
      const weakest = vehicles.length ? [...moduleAverages(vehicles)].sort((a, b) => a.avg - b.avg)[0] : null;
      const topFault = (data.dtcDist?.distribution ?? [])[0];
      return `Fleet risk index is ${riskIndex}% — driven by ${critical.length} critical and ${warning.length} warning vehicles.${
        topRisk ? ` ${topRisk.vehicle_id} is the single largest contributor at ${Math.round(liveHealthOf(topRisk))}% health.` : ""
      }${weakest ? ` Structurally, the ${weakest.mod} module is the fleet's weakest point (${weakest.avg.toFixed(1)}% average) — worth checking whether that's what's dragging ${topRisk?.vehicle_id ?? "your worst vehicle"} down too.` : ""}${
        topFault ? ` ${topFault.code} is the most-triggered fault fleet-wide right now (${topFault.count}× across ${topFault.vehicle_count} vehicles), which is a good early-warning signal to watch across the rest of the fleet before it spreads further.` : ""
      }`;
    },
  },
  {
    key: "safety-score",
    label: "Safety score",
    match: (q: string) => q.includes("safety") && q.includes("score"),
    respond: (_data, ctx) => {
      const scored = (ctx.fleetPositions ?? [])
        .map((p) => ({ id: p.vehicle_id, driver: p.driver || "Unassigned", score: Number(p.driver_score) }))
        .filter((p) => Number.isFinite(p.score));
      if (!scored.length) return "No driver-score data is available yet to derive a safety read from.";
      const avg = scored.reduce((s, p) => s + p.score, 0) / scored.length;
      const worst = [...scored].sort((a, b) => a.score - b.score)[0];
      const best = [...scored].sort((a, b) => b.score - a.score)[0];
      const atRisk = scored.filter((p) => p.score < 70).length;
      return `Fleet safety score — derived from driver behavior (harsh braking, acceleration, cornering rates) since there's no separate safety metric in the backend — is ${avg.toFixed(1)}/100, which is ${avg >= 85 ? "strong, above the 85 threshold we treat as safe" : avg >= 70 ? "acceptable but worth watching" : "a genuine concern"}. ${worst.driver} (${worst.id}) is the outlier at ${worst.score}/100${atRisk > 1 ? `, and ${atRisk} drivers fleet-wide sit below the 70 safety threshold` : ""}; ${best.driver} (${best.id}) is the benchmark at ${best.score}/100. Recommend using ${best.driver}'s technique as the coaching reference for ${worst.driver}.`;
    },
  },
  {
    key: "full-fleet-risk-briefing",
    label: "Full fleet risk briefing",
    match: (q: string) => q.includes("full") && q.includes("briefing"),
    fetches: () => [
      { key: "fleetSum", url: `${PIPELINE_API}/api/automotive/fleet-summary` },
      { key: "alerts", url: `${PIPELINE_API}/api/alerts/metrics` },
      { key: "dtcDist", url: `${PIPELINE_API}/api/automotive/dtc/fleet-distribution` },
    ],
    respond: (data, ctx) => {
      const positions = ctx.fleetPositions ?? [];
      const total = positions.length || 1;
      const avgHealth = positions.reduce((s, v) => s + liveHealthOf(v), 0) / total;
      const critical = positions.filter((v) => liveHealthOf(v) < 50);
      const warning = positions.filter((v) => liveHealthOf(v) >= 50 && liveHealthOf(v) < 80);
      const worst = [...critical].sort((a, b) => liveHealthOf(a) - liveHealthOf(b))[0];
      const vehicles: any[] = data.fleetSum?.vehicles ?? [];
      const weakest = vehicles.length ? [...moduleAverages(vehicles)].sort((a, b) => a.avg - b.avg)[0] : null;
      const openAlerts: any[] = data.alerts?.open_alerts ?? [];
      const topFault = (data.dtcDist?.distribution ?? [])[0];
      const urgent = positions.filter((v) => liveHealthOf(v) < 40).length;
      return `Full briefing: fleet health averages ${avgHealth.toFixed(0)}% across ${total} vehicles, with ${critical.length} critical and ${warning.length} warning. ${
        worst ? `${worst.vehicle_id} is the standout risk at ${Math.round(liveHealthOf(worst))}% health.` : "No single vehicle stands out as a crisis right now."
      } ${weakest ? `Structurally, ${weakest.mod} is the fleet's weakest module (${weakest.avg.toFixed(1)}% avg contribution) — that's a fleet-wide pattern, not one vehicle's problem.` : ""} There ${openAlerts.length === 1 ? "is" : "are"} ${openAlerts.length} open alert${openAlerts.length === 1 ? "" : "s"} right now.${
        topFault ? ` ${topFault.code} is the most common fault fleet-wide (${topFault.count}× across ${topFault.vehicle_count} vehicles).` : ""
      } ${urgent} vehicle${urgent === 1 ? " needs" : "s need"} service within the week. Bottom line: address ${worst?.vehicle_id ?? "the flagged vehicles"} first, then treat ${weakest?.mod ?? "the weak module"} as a fleet-wide inspection priority rather than a one-off repair.`;
    },
  },
];

// ---------------------------------------------------------------------------
// Monitoring @ Cockpit View
// ---------------------------------------------------------------------------
const monitoringCockpit: TopicEntry[] = [
  {
    key: "workshop-queue",
    label: "Workshop service queue",
    match: (q: string) => q.includes("workshop") || q.includes("service queue"),
    fetches: (ctx) => {
      const inService = (ctx.fleetPositions ?? []).filter((v) => v.status === "in_service");
      const specs: FetchSpec[] = [{ key: "alerts", url: `${PIPELINE_API}/api/alerts/metrics` }];
      // Every vehicle in this queue is, by definition, off the road — the
      // live fleet-wide alerts feed has nothing to say about vehicles that
      // aren't streaming, so "0 have a live alert" would otherwise silently
      // read as "these are all fine," which is wrong: they're in the
      // workshop for a documented reason sitting in their own historical
      // record.
      for (const v of inService) {
        specs.push({ key: `hist_${v.vehicle_id}`, url: `${PIPELINE_API}/api/automotive/vehicle/${v.vehicle_id}/alerts` });
      }
      return specs;
    },
    respond: (data, ctx) => {
      const positions = ctx.fleetPositions ?? [];
      const inService = [...positions].filter((v) => v.status === "in_service").sort((a, b) => liveHealthOf(a) - liveHealthOf(b));
      if (!inService.length) return "No vehicles are currently in the workshop — the whole fleet is either active or parked.";
      const openAlerts: any[] = data.alerts?.open_alerts ?? [];
      const withLiveAlerts = inService.filter((v) => openAlerts.some((a) => String(a.source_id) === v.vehicle_id)).length;
      const withHistory = inService.filter((v) => ((data[`hist_${v.vehicle_id}`]?.alerts ?? []) as any[]).length > 0).length;
      const worst = inService[0];
      const names = inService.slice(0, 5).map((v) => `${v.vehicle_id} (${Math.round(liveHealthOf(v))}%)`).join(", ");
      return `${inService.length} vehicle${inService.length === 1 ? " is" : "s are"} in the workshop right now: ${names}${inService.length > 5 ? ", …" : ""}. ${worst.vehicle_id} is the lowest-health vehicle in the queue at ${Math.round(liveHealthOf(worst))}% — that's the one to prioritize for turnaround. ${withLiveAlerts} of them ${withLiveAlerts === 1 ? "has" : "have"} a live alert open right now, and ${withHistory} of the ${inService.length} have a real fault on record in their own history — none of these vehicles are here by accident, being off the road is not the same as being clean.`;
    },
  },
  {
    key: "service-this-week",
    label: "Vehicles needing service this week",
    match: (q: string) => q.includes("need service") || q.includes("service this week") || q.includes("service window"),
    fetches: () => [{ key: "alerts", url: `${PIPELINE_API}/api/alerts/metrics` }],
    respond: (data, ctx) => {
      const positions = ctx.fleetPositions ?? [];
      const urgent = positions.filter((v) => liveHealthOf(v) < 40);
      if (!urgent.length) return "No vehicles currently fall below the 40% health threshold that triggers an immediate service window — the maintenance queue is under control this week.";
      const openAlerts: any[] = data.alerts?.open_alerts ?? [];
      const withAlert = urgent.filter((v) => openAlerts.some((a) => String(a.source_id) === v.vehicle_id));
      const ids = urgent.map((v) => v.vehicle_id).slice(0, 5).join(", ");
      return `${urgent.length} vehicle${urgent.length === 1 ? "" : "s"} need service within one week (health below 40%): ${ids}${urgent.length > 5 ? ", …" : ""}. ${withAlert.length} of those also ${withAlert.length === 1 ? "has" : "have"} a live alert open right now${
        withAlert.length ? " — those aren't just low-health, something is actively triggering on them, so prioritize them first." : ", so it's the sustained health decline flagging these rather than an active fault — still worth booking proactively."
      } Sequence the workshop bookings by health, worst first.`;
    },
  },
  {
    key: "parked-count",
    label: "Parked vehicle count",
    match: (q: string) => q.includes("parked"),
    respond: (_data, ctx) => {
      const positions = ctx.fleetPositions ?? [];
      const parked = positions.filter((v) => v.status === "parked");
      if (!parked.length) return "No vehicles are currently parked — the entire non-workshop fleet is active.";
      const flagged = parked.filter((v) => liveHealthOf(v) < 60);
      const avgHealth = parked.reduce((s, v) => s + liveHealthOf(v), 0) / parked.length;
      return `${parked.length} vehicle${parked.length === 1 ? " is" : "s are"} currently parked, averaging ${avgHealth.toFixed(0)}% health — generally the healthiest cohort since they're idle by choice, not by fault.${
        flagged.length ? ` ${flagged.length} of them ${flagged.length === 1 ? "is" : "are"} below 60% though (${flagged.map((v) => v.vehicle_id).join(", ")}) — worth checking why they're parked rather than in the workshop given that health level.` : " None of them are flagged on health, so this is routine idle capacity, not hidden risk."
      }`;
    },
  },
  {
    key: "live-stream-status",
    label: "Live stream status",
    match: (q: string) => q.includes("live") && (q.includes("stream") || q.includes("data")),
    respond: (_data, ctx) => {
      if (ctx.connected) {
        const activeCount = (ctx.fleetPositions ?? []).filter((v) => v.status === "active").length;
        return `Yes — the live telemetry stream is connected, and the dashboard is updating automatically for all ${activeCount} active vehicles. Anything I tell you right now reflects the current state, not a cached snapshot.`;
      }
      return "The live stream is currently disconnected or reconnecting — figures I'm giving you right now may be a few moments stale until it recovers. I'd hold off on any dispatch decision until it's back.";
    },
  },
  {
    key: "operations-briefing",
    label: "Operations briefing",
    match: (q: string) => q.includes("operations briefing") || (q.includes("operation") && q.includes("brief")),
    fetches: () => [{ key: "alerts", url: `${PIPELINE_API}/api/alerts/metrics` }],
    respond: (data, ctx) => {
      const positions = ctx.fleetPositions ?? [];
      const total = positions.length || 1;
      const active = positions.filter((v) => v.status === "active").length;
      const parked = positions.filter((v) => v.status === "parked").length;
      const inService = positions.filter((v) => v.status === "in_service");
      const urgent = positions.filter((v) => liveHealthOf(v) < 40).length;
      const openAlerts: any[] = data.alerts?.open_alerts ?? [];
      const worstInService = [...inService].sort((a, b) => liveHealthOf(a) - liveHealthOf(b))[0];
      return `Operations sitrep: ${active} active, ${parked} parked, ${inService.length} in workshop out of ${total}. ${openAlerts.length} open alert${openAlerts.length === 1 ? "" : "s"} right now.${
        worstInService ? ` ${worstInService.vehicle_id} is the workshop priority at ${Math.round(liveHealthOf(worstInService))}% health.` : " Workshop queue is empty."
      } ${urgent} vehicle${urgent === 1 ? " needs" : "s need"} service within the week beyond what's already in the workshop. Stream is ${ctx.connected ? "live and current" : "degraded — treat these numbers as approximate"}.`;
    },
  },
];

// ---------------------------------------------------------------------------
// Monitoring @ Fleet Health
// ---------------------------------------------------------------------------
const monitoringFleetHealth: TopicEntry[] = [
  {
    key: "worst-module",
    label: "Worst module fleet-wide",
    match: (q: string) => q.includes("worst module") || q.includes("worst performing module"),
    fetches: () => [
      { key: "fleetSum", url: `${PIPELINE_API}/api/automotive/fleet-summary` },
      { key: "dtcMaster", url: `${PIPELINE_API}/api/automotive/dtc-master` },
      { key: "dtcDist", url: `${PIPELINE_API}/api/automotive/dtc/fleet-distribution` },
    ],
    respond: (data) => {
      const vehicles: any[] = data.fleetSum?.vehicles ?? [];
      if (!vehicles.length) return "No fleet-wide module contribution data is available yet.";
      const avgByModule = moduleAverages(vehicles);
      const worst = [...avgByModule].sort((a, b) => a.avg - b.avg)[0];
      const codesForModule: string[] = (data.dtcMaster?.modules?.[worst.mod] ?? []).map((r: any) => r.dtc_code);
      const dist: any[] = data.dtcDist?.distribution ?? [];
      const activeCodes = dist.filter((d) => codesForModule.includes(d.code));
      const affected = vehicles.filter((v) => Number(v[`${worst.mod}_contrib`] ?? 100) < 60).length;
      return `${titleCase(worst.mod)} is the worst-performing module fleet-wide, averaging ${worst.avg.toFixed(1)}% contribution across ${vehicles.length} vehicles — ${affected} of them are below the 60% concern line on this module specifically.${
        activeCodes.length
          ? ` That lines up with what's actually triggering: ${activeCodes.slice(0, 2).map((d) => `${d.code} (${d.count}× across ${d.vehicle_count} vehicles)`).join(", ")} — known ${worst.mod} faults that are live in the fleet right now, not just a theoretical weak spot.`
          : ` No ${worst.mod}-specific DTC is currently showing up in the fleet distribution, so this looks like gradual wear rather than an active fault pattern yet.`
      } Recommend prioritizing ${worst.mod} diagnostics fleet-wide during the next service pass.`;
    },
  },
  {
    key: "dtc-distribution",
    label: "DTC distribution",
    match: (q: string) => q.includes("dtc distribution") || q.includes("most common dtc") || q.includes("top dtc"),
    fetches: () => [
      { key: "dtcDist", url: `${PIPELINE_API}/api/automotive/dtc/fleet-distribution` },
      { key: "dtcMaster", url: `${PIPELINE_API}/api/automotive/dtc-master` },
      { key: "alerts", url: `${PIPELINE_API}/api/alerts/metrics` },
    ],
    respond: (data) => {
      const dist: any[] = data.dtcDist?.distribution ?? [];
      if (!dist.length) return "No DTC analysis runs have been recorded yet fleet-wide.";
      const top = dist[0];
      const allRecords: any[] = flattenDtcRecords(data.dtcMaster?.modules);
      const meta = allRecords.find((r: any) => r.dtc_code === top.code);
      const openAlerts: any[] = data.alerts?.open_alerts ?? [];
      const stillOpen = openAlerts.filter((a) => String(a.module || "").toLowerCase() === String(meta?.module || "").toLowerCase()).length;
      const rest = dist.slice(1, 3).map((d) => `${d.code} (${d.count}×)`).join(", ");
      return `${top.code}${meta ? ` (${meta.description})` : ""} is the most frequent DTC fleet-wide — ${top.count}× across ${top.vehicle_count} vehicle${top.vehicle_count === 1 ? "" : "s"}, severity ${top.severity}.${
        meta ? ` It's ${withArticle(meta.module)} fault, and there ${stillOpen === 1 ? "is" : "are"} currently ${stillOpen} open alert${stillOpen === 1 ? "" : "s"} on that module fleet-wide — ${stillOpen ? "this isn't just historical, it's actively recurring." : "so the recent instances have all been resolved rather than ongoing."}` : ""
      }${rest ? ` Next most common: ${rest}.` : ""}`;
    },
  },
  {
    key: "fleet-health-trend",
    label: "Fleet health trend",
    match: (q: string) => q.includes("health trend") || q.includes("fleet trend") || (q.includes("fleet") && q.includes("average health")),
    fetches: () => [
      { key: "fleetSum", url: `${PIPELINE_API}/api/automotive/fleet-summary` },
      { key: "alerts", url: `${PIPELINE_API}/api/alerts/metrics` },
    ],
    respond: (data) => {
      const stats = data.fleetSum?.fleet_stats ?? {};
      const openAlerts: any[] = data.alerts?.open_alerts ?? [];
      const avg = Number(stats.avg_health ?? 0);
      return `Fleet average health is ${stats.avg_health ?? "unavailable"}%, which is ${healthRead(avg)}, across ${stats.total_vehicles ?? 0} vehicles — ${stats.critical_count ?? 0} critical, ${stats.warning_count ?? 0} in the warning band. ${openAlerts.length} open alert${openAlerts.length === 1 ? "" : "s"} corroborate${openAlerts.length === 1 ? "s" : ""} that read: ${
        openAlerts.length > (stats.critical_count ?? 0) ? "there are more live alerts than critical vehicles, meaning some warning-band vehicles are already actively faulting, not just trending down." : "alert volume is consistent with the critical count, so nothing is escalating faster than expected."
      }`;
    },
  },
  {
    key: "critical-alerts-by-module",
    label: "Critical alerts by module",
    match: (q: string) => q.includes("alerts by module") || q.includes("critical alerts"),
    fetches: () => [
      { key: "alerts", url: `${PIPELINE_API}/api/alerts/metrics` },
      { key: "fleetSum", url: `${PIPELINE_API}/api/automotive/fleet-summary` },
    ],
    respond: (data) => {
      const open: any[] = data.alerts?.open_alerts ?? [];
      if (!open.length) return "No open alerts are currently recorded — nothing is actively triggering fleet-wide right now.";
      const byModule = new Map<string, number>();
      for (const a of open) {
        const mod = String(a.module || "unknown").toLowerCase();
        byModule.set(mod, (byModule.get(mod) ?? 0) + 1);
      }
      const ranked = Array.from(byModule.entries()).sort((a, b) => b[1] - a[1]);
      const [topMod, topCount] = ranked[0];
      const vehicles: any[] = data.fleetSum?.vehicles ?? [];
      const modAvg = vehicles.length ? moduleAverages(vehicles).find((m) => m.mod === topMod) : null;
      const breakdown = ranked.map(([mod, count]) => `${mod}: ${count}`).join(", ");
      return `${open.length} open alert${open.length === 1 ? "" : "s"} by module — ${breakdown}. ${titleCase(topMod)} leads with ${topCount}${
        modAvg ? `, which lines up with it averaging only ${modAvg.avg.toFixed(1)}% fleet-wide contribution — this isn't a coincidence, that module is genuinely the fleet's weak point right now.` : "."
      }`;
    },
  },
  {
    key: "full-fleet-health-briefing",
    label: "Full fleet health briefing",
    match: (q: string) => q.includes("full") && q.includes("briefing"),
    fetches: () => [
      { key: "fleetSum", url: `${PIPELINE_API}/api/automotive/fleet-summary` },
      { key: "dtcDist", url: `${PIPELINE_API}/api/automotive/dtc/fleet-distribution` },
      { key: "alerts", url: `${PIPELINE_API}/api/alerts/metrics` },
      { key: "dtcHist", url: `${PIPELINE_API}/api/automotive/dtc/history` },
    ],
    respond: (data) => {
      const stats = data.fleetSum?.fleet_stats ?? {};
      const vehicles: any[] = data.fleetSum?.vehicles ?? [];
      const weakest = vehicles.length ? [...moduleAverages(vehicles)].sort((a, b) => a.avg - b.avg)[0] : null;
      const topFault = (data.dtcDist?.distribution ?? [])[0];
      const openAlerts: any[] = data.alerts?.open_alerts ?? [];
      const runs: any[] = data.dtcHist?.runs ?? [];
      const recentRuns = runs.slice(0, 5).length;
      return `Full fleet health briefing: average health ${stats.avg_health ?? "n/a"}% across ${stats.total_vehicles ?? 0} vehicles (${stats.critical_count ?? 0} critical, ${stats.warning_count ?? 0} warning). ${
        weakest ? `${titleCase(weakest.mod)} is the structurally weakest module at ${weakest.avg.toFixed(1)}%.` : ""
      } ${topFault ? `${topFault.code} is the most common fault (${topFault.count}× across ${topFault.vehicle_count} vehicles), severity ${topFault.severity}.` : "No dominant fault pattern fleet-wide."} ${openAlerts.length} alert${openAlerts.length === 1 ? " is" : "s are"} open right now, and ${recentRuns} DTC analysis run${recentRuns === 1 ? "" : "s"} completed recently — the pipeline is actively diagnosing, not just monitoring. Read together: ${
        weakest && topFault ? `keep an eye on whether ${topFault.code} is ${withArticle(weakest.mod)} fault — if so, this is one root cause showing up in two places, not two separate problems.` : "no single module/fault correlation stands out yet."
      }`;
    },
  },
];

// ---------------------------------------------------------------------------
// Monitoring @ Vehicle Deep Dive (automotive)
// ---------------------------------------------------------------------------
const monitoringAutomotive: TopicEntry[] = [
  {
    key: "this-vehicle-health",
    label: (ctx) => (ctx.selectedVehicle ? `${ctx.selectedVehicle}'s health` : "This vehicle's health"),
    match: (q: string) => q.includes("this vehicle") && q.includes("health"),
    requiresVehicle: true,
    fetches: (ctx) => [{ key: "summary", url: `${PIPELINE_API}/api/automotive/vehicle-summary/${ctx.selectedVehicle}` }],
    respond: (data, ctx) => {
      const h = data.summary?.health_snapshot ?? {};
      if (h.health_score == null) return `No live health snapshot is available yet for ${ctx.selectedVehicle}.`;
      const contribs: Record<string, number> = h.module_contribs ?? {};
      const weakest = Object.entries(contribs).filter(([, v]) => v != null).sort((a: any, b: any) => a[1] - b[1])[0];
      return `${ctx.selectedVehicle} is at ${h.health_score}% health (${healthRead(Number(h.health_score))})${
        h.fleet_rank ? `, ranked ${ordinal(h.fleet_rank)} of ${h.fleet_total} in the fleet` : ""
      }.${weakest ? ` Its weakest module is ${weakest[0]} at ${Number(weakest[1]).toFixed(1)}% — that's almost certainly what's pulling its overall score down.` : ""} ${
        h.fleet_rank && h.fleet_total && h.fleet_rank > h.fleet_total * 0.75 ? "That rank puts it in the bottom quartile of the fleet, so this isn't a borderline case." : ""
      }`;
    },
  },
  {
    key: "this-vehicle-dtcs",
    label: (ctx) => (ctx.selectedVehicle ? `${ctx.selectedVehicle}'s DTCs` : "This vehicle's DTCs"),
    match: (q: string) => q.includes("this vehicle") && q.includes("dtc"),
    requiresVehicle: true,
    fetches: (ctx) => {
      const specs: FetchSpec[] = [
        { key: "summary", url: `${PIPELINE_API}/api/automotive/vehicle-summary/${ctx.selectedVehicle}` },
        { key: "dtcMaster", url: `${PIPELINE_API}/api/automotive/dtc-master` },
      ];
      if (vehicleStatusOf(ctx) && vehicleStatusOf(ctx) !== "active") {
        specs.push({ key: "histDtcs", url: `${PIPELINE_API}/api/automotive/vehicle/${ctx.selectedVehicle}/dtcs` });
      }
      return specs;
    },
    respond: (data, ctx) => {
      const last = data.summary?.last_dtc;
      const histDtcs: any[] = data.histDtcs?.dtcs ?? [];
      if (!last) {
        if (!histDtcs.length) return `No DTC analysis has been run yet for ${ctx.selectedVehicle}.`;
        const sorted = [...histDtcs].sort((a, b) => new Date(b.last_seen_ts ?? 0).getTime() - new Date(a.last_seen_ts ?? 0).getTime());
        const mostRecent = sorted[0];
        const criticalCount = histDtcs.filter((d) => String(d.severity).toLowerCase() === "critical").length;
        const stillOpen = histDtcs.filter((d) => String(d.status).toUpperCase() === "OPEN").length;
        return `No live DTC run this session, but ${ctx.selectedVehicle}'s historical record shows ${histDtcs.length} fault${histDtcs.length === 1 ? "" : "s"} on file — most recently ${mostRecent.dtc_code} (${mostRecent.description}) on the ${mostRecent.module} module, ${criticalCount} of them critical severity overall. ${
          stillOpen > 0
            ? `${stillOpen} of these ${stillOpen === 1 ? "is" : "are"} still marked open — this vehicle shouldn't go back into service until that's cleared.`
            : "All of them are marked closed, so nothing outstanding is blocking this vehicle from returning to service on the fault side."
        }`;
      }
      const triggers = last.triggers ?? [];
      const allRecords: any[] = flattenDtcRecords(data.dtcMaster?.modules);
      const enriched = triggers.map((t: any) => {
        const meta = allRecords.find((r) => r.dtc_code === t.code);
        return meta ? `${t.code} — ${meta.description} (${t.severity})` : `${t.code} (${t.severity})`;
      });
      return `Last DTC analysis for ${ctx.selectedVehicle} (${String(last.module || "").toUpperCase()}, run ${String(last.run_ts || "").slice(0, 16).replace("T", " ")}): ${enriched.join("; ") || "no faults triggered"}.${
        histDtcs.length ? ` That's on top of ${histDtcs.length} fault${histDtcs.length === 1 ? "" : "s"} already on this vehicle's historical record.` : ""
      } ${triggers.some((t: any) => t.severity === "CRITICAL") ? "At least one of these is critical severity — this should move up the service queue, not wait for the next scheduled slot." : "Nothing critical in this run, but worth re-checking after the next few hundred km."}`;
    },
  },
  {
    key: "next-service-due",
    label: "Next service due",
    match: (q: string) => q.includes("next service") || q.includes("service due"),
    requiresVehicle: true,
    fetches: (ctx) => [{ key: "summary", url: `${PIPELINE_API}/api/automotive/vehicle-summary/${ctx.selectedVehicle}` }],
    respond: (data, ctx) => {
      const s = data.summary?.service_info ?? {};
      const h = data.summary?.health_snapshot ?? {};
      if (s.next_service_in_km == null) return `No service-interval data is available yet for ${ctx.selectedVehicle}.`;
      const urgency = s.next_service_in_km < 500 ? "very soon" : s.next_service_in_km < 2000 ? "within the next couple of weeks" : "not urgent on distance alone";
      return `${ctx.selectedVehicle} has ${s.next_service_in_km.toLocaleString()} km remaining until its next scheduled service (odometer: ${s.odometer_km?.toLocaleString() ?? "unknown"} km) — that's due ${urgency}.${
        h.health_score != null && Number(h.health_score) < 60 ? ` Given its current health is ${h.health_score}%, I'd bring that service window forward rather than wait for the odometer to force it.` : ""
      }`;
    },
  },
  {
    key: "top-anomaly-driver",
    label: "Top anomaly driver",
    match: (q: string) => q.includes("anomaly driver") || q.includes("top anomaly"),
    requiresVehicle: true,
    fetches: (ctx) => [
      { key: "summary", url: `${PIPELINE_API}/api/automotive/vehicle-summary/${ctx.selectedVehicle}` },
      { key: "dtcMaster", url: `${PIPELINE_API}/api/automotive/dtc-master` },
    ],
    respond: (data, ctx) => {
      const drivers: any[] = data.summary?.top_anomaly_drivers ?? [];
      if (!drivers.length) return `No anomaly-driver data is available yet for ${ctx.selectedVehicle}.`;
      const top = [...drivers].sort((a, b) => Number(b.score) - Number(a.score))[0];
      const moduleCodes: any[] = data.dtcMaster?.modules?.[top.module] ?? [];
      const relatedCode = moduleCodes.find((r: any) => (r.features ?? []).some((f: string) => f === top.feature));
      return `${ctx.selectedVehicle}'s top anomaly driver is ${top.feature} on the ${top.module} module.${
        relatedCode ? ` That feature directly feeds into the ${relatedCode.dtc_code} fault (${relatedCode.description}) in the DTC contract — so this isn't just statistical noise, it's a recognized precursor to a real fault code.` : " It's not directly tied to a named DTC in the contract, so treat it as an early trend to watch rather than an imminent fault."
      }`;
    },
  },
  {
    key: "full-risk-profile",
    label: "Full risk profile of this vehicle",
    match: (q: string) => q.includes("full") && (q.includes("risk profile") || q.includes("risk")),
    requiresVehicle: true,
    fetches: (ctx) => {
      const specs: FetchSpec[] = [
        { key: "summary", url: `${PIPELINE_API}/api/automotive/vehicle-summary/${ctx.selectedVehicle}` },
        { key: "alerts", url: `${PIPELINE_API}/api/alerts/metrics` },
      ];
      if (vehicleStatusOf(ctx) && vehicleStatusOf(ctx) !== "active") {
        specs.push({ key: "histAlerts", url: `${PIPELINE_API}/api/automotive/vehicle/${ctx.selectedVehicle}/alerts` });
      }
      return specs;
    },
    respond: (data, ctx) => {
      const s = data.summary ?? {};
      const h = s.health_snapshot ?? {};
      const service = s.service_info ?? {};
      const drivers: any[] = s.top_anomaly_drivers ?? [];
      const lastDtc = s.last_dtc;
      const alerts = s.alerts_summary ?? {};
      if (h.health_score == null) return `Not enough live data yet to build a full risk profile for ${ctx.selectedVehicle}.`;
      const topDriver = [...drivers].sort((a, b) => Number(b.score) - Number(a.score))[0];
      const vehicleStatus = vehicleStatusOf(ctx);
      const histAlerts: any[] = data.histAlerts?.alerts ?? [];
      const liveClosedAlerts: any[] = data.alerts?.closed_alerts ?? [];
      const histClosed = histAlerts.filter((a) => String(a.status).toUpperCase() === "CLOSED");
      const lastClosed = [
        ...histClosed,
        ...liveClosedAlerts.filter((a) => String(a.source_id) === ctx.selectedVehicle),
      ].sort((a, b) => new Date(b.peak_anomaly_ts ?? 0).getTime() - new Date(a.peak_anomaly_ts ?? 0).getTime())[0];
      const resolvedCount = histClosed.length || alerts.closed_count || 0;
      const alertLine = (alerts.open_count ?? 0) > 0
        ? `${alerts.open_count} open, ${resolvedCount} resolved historically.`
        : lastClosed
        ? `0 open right now, ${resolvedCount} resolved historically — most recently on the ${String(lastClosed.module || "").toLowerCase()} module, ${String(lastClosed.peak_anomaly_ts || "").slice(0, 10)}.`
        : `0 open, ${resolvedCount} resolved historically.`;
      const statusLine = vehicleStatus && vehicleStatus !== "active"
        ? ` This vehicle is currently ${vehicleStatus === "in_service" ? "off the road, in the workshop" : "parked"} rather than driving, so treat this as its last-known state, not a live snapshot.`
        : "";
      return `Full risk profile for ${ctx.selectedVehicle}: ${h.health_score}% health (${healthRead(Number(h.health_score))})${h.fleet_rank ? `, ranked ${ordinal(h.fleet_rank)} of ${h.fleet_total}` : ""}.${statusLine} ${
        topDriver ? `Top anomaly driver is ${topDriver.feature} on ${topDriver.module}.` : "No anomaly-driver signal yet."
      } ${lastDtc ? `Last DTC run flagged ${(lastDtc.triggers ?? []).map((t: any) => t.code).join(", ") || "no faults"} on the ${lastDtc.module} module.` : "No DTC analysis on record yet."} Alerts: ${alertLine} Service: ${service.next_service_in_km != null ? `${service.next_service_in_km.toLocaleString()} km to next service` : "interval unknown"}. Putting it together: ${
        Number(h.health_score) < 50
          ? `this vehicle is a genuine, active risk on health alone${(alerts.open_count ?? 0) > 0 ? ", corroborated by a live open alert" : ""} — recommend pulling it from dispatch for inspection rather than monitoring it further.`
          : Number(h.health_score) < 70
          ? "this is a watch-list vehicle — not an emergency, but the trend and evidence line up enough that I'd schedule it proactively."
          : "nothing here rises to urgent; routine monitoring is appropriate."
      }`;
    },
  },
  {
    key: "recent-trips",
    label: "Recent trips",
    match: (q: string) => q.includes("trip"),
    requiresVehicle: true,
    fetches: (ctx) => [{ key: "trips", url: `${PIPELINE_API}/api/automotive/vehicle/${ctx.selectedVehicle}/trips` }],
    respond: (data, ctx) => {
      const allTrips: any[] = data.trips?.trips ?? [];
      if (!allTrips.length) return `No trip history is available yet for ${ctx.selectedVehicle}.`;
      const recent = [...allTrips].sort((a, b) => new Date(b.start_ts ?? 0).getTime() - new Date(a.start_ts ?? 0).getTime()).slice(0, 5);
      const harshTotal = (t: any) => Number(t.harsh_braking_count ?? 0) + Number(t.harsh_accel_count ?? 0) + Number(t.harsh_cornering_count ?? 0);
      const totalDistance = recent.reduce((sum, t) => sum + Number(t.distance_km ?? 0), 0);
      const totalHarsh = recent.reduce((sum, t) => sum + harshTotal(t), 0);
      const worst = [...recent].sort((a, b) => harshTotal(b) - harshTotal(a))[0];
      const avgHarshPerTrip = totalHarsh / recent.length;
      return `Over its last ${recent.length} trip${recent.length === 1 ? "" : "s"}, ${ctx.selectedVehicle} covered ${totalDistance.toFixed(1)}km with ${totalHarsh} harsh-driving event${totalHarsh === 1 ? "" : "s"} total (braking, acceleration, and cornering combined). The roughest was on ${String(worst.start_ts || "").slice(0, 10)} — ${Number(worst.distance_km ?? 0).toFixed(1)}km with ${harshTotal(worst)} harsh event${harshTotal(worst) === 1 ? "" : "s"} in that one trip alone. ${
        avgHarshPerTrip > 3
          ? "That's an elevated rate — worth pairing with the driver's safety score before assuming the vehicle itself is at fault rather than the driving style."
          : "That's a routine rate — nothing here points to aggressive driving as the cause of this vehicle's current condition."
      }`;
    },
  },
];

// ---------------------------------------------------------------------------
// Monitoring @ DTC Investigation
// ---------------------------------------------------------------------------
const monitoringDtc: TopicEntry[] = [
  "DTC P0217",
  {
    key: "last-analysis-this-vehicle",
    label: (ctx) => (ctx.selectedVehicle ? `${ctx.selectedVehicle}'s last analysis` : "Last analysis for this vehicle"),
    match: (q: string) => q.includes("last analysis") || (q.includes("this vehicle") && q.includes("analysis")),
    requiresVehicle: true,
    fetches: () => [{ key: "dtcHist", url: `${PIPELINE_API}/api/automotive/dtc/history` }],
    respond: (data, ctx) => {
      const runs: any[] = data.dtcHist?.runs ?? [];
      const match = runs.find(
        (r) => String(r.source_id) === ctx.selectedVehicle && String(r.module).toLowerCase() === ctx.selectedModule.toLowerCase()
      );
      if (!match) return `No completed DTC analysis found yet for ${ctx.selectedVehicle}'s ${ctx.selectedModule} module.`;
      const triggers = (match.triggers ?? []).map((t: any) => `${t.code} (${t.severity})`).join(", ") || "no faults triggered";
      const sameVehicleOtherModules = runs.filter((r) => String(r.source_id) === ctx.selectedVehicle && r !== match).length;
      return `Last ${ctx.selectedModule} analysis for ${ctx.selectedVehicle} (${String(match.run_ts || "").slice(0, 16).replace("T", " ")}): ${triggers}.${
        sameVehicleOtherModules ? ` This vehicle also has ${sameVehicleOtherModules} other completed analysis run${sameVehicleOtherModules === 1 ? "" : "s"} on record across other modules — worth reviewing whether ${ctx.selectedModule} is an isolated issue or part of a broader pattern on this vehicle.` : ""
      }`;
    },
  },
  {
    key: "known-dtcs-module",
    label: "Known DTCs for this module",
    match: (q: string) => q.includes("known dtc") || q.includes("possible dtc") || (q.includes("dtc") && q.includes("module")),
    fetches: (ctx) => [
      { key: "dtcMaster", url: `${PIPELINE_API}/api/automotive/dtc-master` },
      { key: "dtcDist", url: `${PIPELINE_API}/api/automotive/dtc/fleet-distribution` },
    ],
    respond: (data, ctx) => {
      const records: any[] = data.dtcMaster?.modules?.[ctx.selectedModule] ?? [];
      if (!records.length) return `No DTC catalog entries found for the ${ctx.selectedModule} module.`;
      const dist: any[] = data.dtcDist?.distribution ?? [];
      const codes = records.map((r) => r.dtc_code);
      const live = dist.filter((d) => codes.includes(d.code));
      const list = records.slice(0, 5).map((r) => {
        const hit = live.find((d) => d.code === r.dtc_code);
        return `${r.dtc_code} (${r.severity}${hit ? `, active — ${hit.count}× in fleet` : ", none seen fleet-wide recently"})`;
      }).join(", ");
      return `${titleCase(ctx.selectedModule)} has ${records.length} known DTC code${records.length === 1 ? "" : "s"} in the contract: ${list}${records.length > 5 ? ", …" : ""}. ${
        live.length ? `${live.length} of them ${live.length === 1 ? "is" : "are"} actually showing up in the fleet right now — ${ctx.selectedModule} isn't just a theoretical risk area, it's producing real faults.` : "None of them have been triggered fleet-wide recently, so this module's faults are currently dormant rather than active."
      }`;
    },
  },
  {
    key: "fleet-dtc-distribution-dtc",
    label: "Fleet DTC distribution",
    match: (q: string) => q.includes("dtc distribution") || q.includes("most common dtc") || q.includes("top dtc"),
    fetches: () => [
      { key: "dtcDist", url: `${PIPELINE_API}/api/automotive/dtc/fleet-distribution` },
      { key: "dtcMaster", url: `${PIPELINE_API}/api/automotive/dtc-master` },
    ],
    respond: (data) => {
      const dist: any[] = data.dtcDist?.distribution ?? [];
      if (!dist.length) return "No DTC analysis runs have been recorded yet.";
      const allRecords: any[] = flattenDtcRecords(data.dtcMaster?.modules);
      const top = dist.slice(0, 3).map((d) => {
        const meta = allRecords.find((r: any) => r.dtc_code === d.code);
        return `${d.code}${meta ? ` (${meta.module})` : ""} — ${d.count}× across ${d.vehicle_count} vehicles`;
      }).join("; ");
      const criticalCount = dist.filter((d) => d.severity === "CRITICAL").length;
      return `Fleet-wide DTC distribution, top codes: ${top}. ${criticalCount} of the ${dist.length} distinct codes currently in play are critical severity — ${criticalCount > dist.length / 3 ? "that's a meaningfully high share, worth flagging to fleet health as a trend, not just individual cases." : "most of what's showing up is non-critical, so this looks like normal wear-and-tear volume rather than an emerging crisis."}`;
    },
  },
  {
    key: "root-cause-briefing",
    label: "Root-cause briefing for this vehicle",
    match: (q: string) => q.includes("root cause") || q.includes("root-cause"),
    requiresVehicle: true,
    fetches: (ctx) => [
      { key: "dtcHist", url: `${PIPELINE_API}/api/automotive/dtc/history` },
      { key: "dtcMaster", url: `${PIPELINE_API}/api/automotive/dtc-master` },
      { key: "dtcDist", url: `${PIPELINE_API}/api/automotive/dtc/fleet-distribution` },
    ],
    respond: (data, ctx) => {
      const runs: any[] = data.dtcHist?.runs ?? [];
      const match = runs.find(
        (r) => String(r.source_id) === ctx.selectedVehicle && String(r.module).toLowerCase() === ctx.selectedModule.toLowerCase()
      );
      if (!match) return `No completed analysis to root-cause yet for ${ctx.selectedVehicle}'s ${ctx.selectedModule} module — run an analysis first, then ask me again.`;
      const triggers = match.triggers ?? [];
      const allRecords: any[] = flattenDtcRecords(data.dtcMaster?.modules);
      const dist: any[] = data.dtcDist?.distribution ?? [];
      const details = triggers.map((t: any) => {
        const meta = allRecords.find((r) => r.dtc_code === t.code);
        const fleetHit = dist.find((d) => d.code === t.code);
        return `${t.code}${meta ? ` (${meta.description})` : ""} — ${t.severity}, and ${fleetHit ? `seen ${fleetHit.count}× across ${fleetHit.vehicle_count} vehicles fleet-wide, so this is a known, recurring pattern` : "not currently showing up elsewhere in the fleet, so this looks isolated to this vehicle"}`;
      });
      return `Root-cause briefing for ${ctx.selectedVehicle}'s ${ctx.selectedModule} module: ${details.join(". ")}. ${
        triggers.some((t: any) => t.severity === "CRITICAL")
          ? "Given the critical severity, recommend physical inspection before returning this vehicle to active dispatch."
          : "Non-critical for now — schedule a check at the next routine service rather than pulling it from dispatch immediately."
      }`;
    },
  },
];

// ---------------------------------------------------------------------------
// Engineering @ Systems Ops (DataScience)
// ---------------------------------------------------------------------------
const engineeringDatascience: TopicEntry[] = [
  "Backend data availability",
  {
    key: "writer-health",
    label: "Writer service health",
    match: (q: string) => q.includes("writer") && (q.includes("health") || q.includes("status")),
    fetches: () => [{ key: "writer", url: `${PIPELINE_API}/api/writer/metrics` }],
    respond: (data) => {
      const modules = Object.values(data.writer ?? {}) as any[];
      if (!modules.length) return "No writer-service metrics are available yet.";
      const stalled = modules.filter((m) => m.status !== "RUNNING");
      const totalLag = modules.reduce((s, m) => s + Number(m.true_lag ?? 0), 0);
      const worst = [...modules].sort((a, b) => Number(b.true_lag ?? 0) - Number(a.true_lag ?? 0))[0];
      return stalled.length
        ? `Writer service issue: ${stalled.map((m) => `${m.module} is ${m.status}`).join(", ")}. Combined backlog across all modules is ${totalLag} rows — that will show up as stale data on the dashboard until it clears.`
        : `Writer service is RUNNING on all ${modules.length} modules, combined backlog ${totalLag} rows.${worst && Number(worst.true_lag ?? 0) > 0 ? ` ${worst.module} carries the largest share of that (${worst.true_lag} rows) — worth watching if it keeps growing rather than draining.` : " Backlog is effectively zero, so ingestion is fully caught up."}`;
    },
  },
  {
    key: "inference-lag",
    label: "Inference pipeline lag",
    match: (q: string) => q.includes("inference") && (q.includes("lag") || q.includes("latency")),
    fetches: () => [{ key: "inference", url: `${PIPELINE_API}/api/inference/metrics` }],
    respond: (data) => {
      const d = data.inference;
      if (d?.global_e2e_ms == null || (Number(d.active_sims ?? 0) === 0 && Number(d.active_modules ?? 0) === 0)) return "No inference-latency metrics are available yet — the inference service isn't reporting any active vehicles right now.";
      return `Inference end-to-end latency is ${d.global_e2e_ms}ms (model-only: ${d.global_inf_ms}ms) across ${d.active_sims ?? 0} active vehicles and ${d.active_modules ?? 0} modules. ${
        d.global_e2e_ms > 2000 ? "That's high enough to notice as a delay between a real sensor event and it showing up as health/anomaly data on the dashboard." : "That's fast enough that anything you see reflected on the dashboard is effectively real-time."
      }`;
    },
  },
  {
    key: "gold-lag",
    label: "Gold computation lag",
    match: (q: string) => q.includes("gold") && (q.includes("lag") || q.includes("health")),
    fetches: () => [{ key: "gold", url: `${PIPELINE_API}/api/gold/metrics` }],
    respond: (data) => {
      const d = data.gold;
      if (d == null || (d.active_sims ?? []).length === 0) return "No Gold-layer metrics are available yet — the gold service isn't reporting any active vehicles right now.";
      return `Gold layer has processed ${d.total_gold_rows ?? 0} rows across ${(d.active_sims ?? []).length} vehicles, with a max processing lag of ${d.global_max_lag ?? 0}s${
        d.fleet_vehicle_health_pct != null ? ` and fleet health computed at ${d.fleet_vehicle_health_pct}%` : ""
      }. ${Number(d.global_max_lag ?? 0) > 30 ? "That lag is high enough that fleet-wide health figures on Cockpit View and Fleet Health may be running a little behind the truly live picture." : "That lag is low enough that everything upstream (Cockpit View, Fleet Health) is showing genuinely current data."}`;
    },
  },
  {
    key: "full-pipeline-briefing",
    label: "Full pipeline health briefing",
    match: (q: string) => q.includes("full") && q.includes("briefing"),
    fetches: () => [
      { key: "writer", url: `${PIPELINE_API}/api/writer/metrics` },
      { key: "inference", url: `${PIPELINE_API}/api/inference/metrics` },
      { key: "gold", url: `${PIPELINE_API}/api/gold/metrics` },
    ],
    respond: (data) => {
      const modules = Object.values(data.writer ?? {}) as any[];
      const stalled = modules.filter((m) => m.status !== "RUNNING").length;
      const writerLag = modules.reduce((s, m) => s + Number(m.true_lag ?? 0), 0);
      const inf = data.inference ?? {};
      const gold = data.gold ?? {};
      const infHasData = inf.global_e2e_ms != null && (Number(inf.active_sims ?? 0) > 0 || Number(inf.active_modules ?? 0) > 0);
      const goldHasData = (gold.active_sims ?? []).length > 0;
      return `Full pipeline briefing: Writer — ${modules.length ? `${modules.length - stalled}/${modules.length} modules running, ${writerLag} rows backlogged` : "no data"}. Inference — ${infHasData ? `${inf.global_e2e_ms}ms end-to-end across ${inf.active_sims ?? 0} vehicles` : "no data"}. Gold — ${goldHasData ? `${gold.total_gold_rows} rows processed, ${gold.global_max_lag ?? 0}s max lag` : "no data"}. Overall: ${
        stalled > 0
          ? "the writer layer has a genuine problem right now — that's the first thing to fix, since everything downstream depends on it."
          : !modules.length && !infHasData && !goldHasData
          ? "none of the three pipeline services are currently reporting data — they may not be running in this environment, so treat dashboard freshness as unverified rather than confirmed-live."
          : infHasData && inf.global_e2e_ms > 2000
          ? "ingestion is healthy but there's real lag further downstream — data reaching the dashboard is delayed, not wrong."
          : goldHasData && Number(gold.global_max_lag ?? 0) > 30
          ? "ingestion is healthy but there's real lag further downstream — data reaching the dashboard is delayed, not wrong."
          : infHasData && goldHasData
          ? "the full pipeline is healthy end-to-end — you can trust the dashboard's numbers as current."
          : "the pipeline is only partially reporting — some services aren't live in this environment, so a full health verdict isn't possible right now."
      }`;
    },
  },
];

export const PAGE_TOPICS: Partial<Record<PageKey, Partial<Record<AssistantRole, TopicEntry[]>>>> = {
  "cockpit-view": {
    executive: executiveCockpit,
    monitoring: monitoringCockpit,
  },
  "fleet-health": {
    monitoring: monitoringFleetHealth,
  },
  automotive: {
    monitoring: monitoringAutomotive,
  },
  dtc: {
    monitoring: monitoringDtc,
  },
  datascience: {
    engineering: engineeringDatascience,
  },
};

export function pageKeyForPath(pathname: string): PageKey | null {
  if (pathname.startsWith("/cockpit-view") || pathname === "/") return "cockpit-view";
  if (pathname.startsWith("/fleet-health")) return "fleet-health";
  if (pathname.startsWith("/automotive")) return "automotive";
  if (pathname.startsWith("/dtc")) return "dtc";
  if (pathname.startsWith("/datascience")) return "datascience";
  return null;
}

export function topicsFor(pageKey: PageKey | null, role: AssistantRole): TopicEntry[] {
  if (!pageKey) return [];
  return PAGE_TOPICS[pageKey]?.[role] ?? [];
}

// Every real topic across every page and role, flattened — used so a typed
// question can be answered from wherever the user actually is, not just the
// page it was designed for. Page/role still fully controls which topics show
// up as suggested chips (topicsFor above); this only widens what typed text
// can resolve to. Plain-string aliases are excluded — they already resolve
// via the universal answerFor()/DTC-knowledge fallback regardless of page.
export const ALL_TOPICS: AssistantTopic[] = Object.values(PAGE_TOPICS).flatMap((byRole) =>
  Object.values(byRole ?? {}).flatMap((topics) =>
    (topics ?? []).filter((t): t is AssistantTopic => typeof t !== "string")
  )
);

export { NO_VEHICLE_MSG };
