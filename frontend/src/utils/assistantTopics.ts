// Page-aware suggested topics for FleetChatAssistant. Each page/role only
// ever sees 3-4 curated topics grounded in real endpoints that page (or a
// sibling page covering the same data) already calls — see the plan this
// was built from for the exact endpoint audit behind each entry.

export type AssistantRole = "executive" | "monitoring" | "engineering";
export type PageKey = "cockpit-view" | "fleet-health" | "automotive" | "dtc" | "datascience";

export interface TopicContext {
  selectedVehicle: string | null;
  selectedModule: string;
  fleetPositions: any[] | undefined;
  fleetSummary: any | undefined;
}

export interface FetchSpec {
  url: string;
  params?: Record<string, unknown>;
}

export interface AssistantTopic {
  key: string;
  label: string | ((ctx: TopicContext) => string);
  match: (normalized: string) => boolean;
  requiresVehicle?: boolean;
  fetch?: (ctx: TopicContext) => FetchSpec;
  respond: (data: any, ctx: TopicContext) => string;
}

// A plain string entry reuses the existing fleet-wide keyword matcher already
// in FleetChatAssistant.tsx (driver score, fleet composition, safety score,
// etc.) instead of duplicating that logic here — the label IS the question
// text sent through the legacy matcher.
export type TopicEntry = AssistantTopic | string;

const PIPELINE_API = "http://127.0.0.1:8005";

const NO_VEHICLE_MSG =
  "Select a vehicle on this page first, then ask me again and I'll look at that vehicle specifically.";

function liveHealthOf(v: any): number {
  return Number(v?.health ?? 0);
}

// ---------------------------------------------------------------------------
// Executive @ Cockpit View
// ---------------------------------------------------------------------------
const executiveCockpit: TopicEntry[] = [
  {
    key: "todays-priority",
    label: "Today's priority",
    match: (q: string) => q.includes("priority") || q.includes("top issue"),
    respond: (_data, ctx) => {
      const positions = ctx.fleetPositions ?? [];
      const worst = [...positions]
        .filter((v) => liveHealthOf(v) < 50)
        .sort((a, b) => liveHealthOf(a) - liveHealthOf(b))[0];
      if (!worst) return "No vehicle currently needs immediate attention — fleet health is within normal range.";
      return `${worst.vehicle_id} needs immediate attention: health is ${Math.round(liveHealthOf(worst))}%, status ${worst.status}. Prioritize inspection before its next dispatch.`;
    },
  },
  "Fleet composition",
  {
    key: "biggest-risk-today",
    label: "Biggest risk today",
    match: (q: string) => q.includes("biggest risk") || q.includes("risk today") || q.includes("risk index"),
    respond: (_data, ctx) => {
      const positions = ctx.fleetPositions ?? [];
      const critical = positions.filter((v) => liveHealthOf(v) < 50);
      const warning = positions.filter((v) => liveHealthOf(v) >= 50 && liveHealthOf(v) < 80);
      const total = positions.length || 1;
      const riskIndex = Math.round(((critical.length * 1.8 + warning.length * 0.75) / total) * 100);
      const topRisk = [...critical].sort((a, b) => liveHealthOf(a) - liveHealthOf(b))[0];
      return `Fleet risk index is ${riskIndex}%, driven by ${critical.length} critical and ${warning.length} warning vehicles.${
        topRisk ? ` ${topRisk.vehicle_id} is the single largest contributor at ${Math.round(liveHealthOf(topRisk))}% health.` : ""
      }`;
    },
  },
  "Safety score",
];

// ---------------------------------------------------------------------------
// Monitoring @ Cockpit View
// ---------------------------------------------------------------------------
const monitoringCockpit: TopicEntry[] = [
  "Workshop service queue",
  {
    key: "service-this-week",
    label: "Vehicles needing service this week",
    match: (q: string) => q.includes("need service") || q.includes("service this week") || q.includes("service window"),
    respond: (_data, ctx) => {
      const positions = ctx.fleetPositions ?? [];
      const urgent = positions.filter((v) => liveHealthOf(v) < 40);
      if (!urgent.length) return "No vehicles currently fall below the 40% health threshold that triggers an immediate service window.";
      const ids = urgent.map((v) => v.vehicle_id).slice(0, 5).join(", ");
      return `${urgent.length} vehicle${urgent.length === 1 ? "" : "s"} need service within one week (health below 40%): ${ids}${urgent.length > 5 ? ", …" : ""}.`;
    },
  },
  "Parked vehicle count",
  "Live stream status",
];

// ---------------------------------------------------------------------------
// Monitoring @ Fleet Health
// ---------------------------------------------------------------------------
const MODULE_KEYS = ["engine", "transmission", "battery", "body", "tyre"];

const monitoringFleetHealth: TopicEntry[] = [
  {
    key: "worst-module",
    label: "Worst module fleet-wide",
    match: (q: string) => q.includes("worst module") || q.includes("worst performing module"),
    fetch: () => ({ url: `${PIPELINE_API}/api/automotive/fleet-summary` }),
    respond: (data) => {
      const vehicles: any[] = data?.vehicles ?? [];
      if (!vehicles.length) return "No fleet-wide module contribution data is available yet.";
      const avgByModule = MODULE_KEYS.map((mod) => {
        const values = vehicles.map((v) => Number(v[`${mod}_contrib`] ?? 0));
        const avg = values.reduce((s, x) => s + x, 0) / (values.length || 1);
        return { mod, avg };
      });
      const worst = [...avgByModule].sort((a, b) => a.avg - b.avg)[0];
      return `${worst.mod.charAt(0).toUpperCase() + worst.mod.slice(1)} is the worst-performing module fleet-wide, averaging ${worst.avg.toFixed(1)}% contribution across ${vehicles.length} vehicles.`;
    },
  },
  {
    key: "dtc-distribution",
    label: "DTC distribution",
    match: (q: string) => q.includes("dtc distribution") || q.includes("most common dtc") || q.includes("top dtc"),
    fetch: () => ({ url: `${PIPELINE_API}/api/automotive/dtc/fleet-distribution` }),
    respond: (data) => {
      const dist: any[] = data?.distribution ?? [];
      if (!dist.length) return "No DTC analysis runs have been recorded yet.";
      const top = dist.slice(0, 3).map((d) => `${d.code} (${d.count}× across ${d.vehicle_count} vehicles)`).join(", ");
      return `Most frequent DTCs fleet-wide: ${top}.`;
    },
  },
  {
    key: "fleet-health-trend",
    label: "Fleet health trend",
    match: (q: string) => q.includes("health trend") || q.includes("fleet trend") || (q.includes("fleet") && q.includes("average health")),
    fetch: () => ({ url: `${PIPELINE_API}/api/automotive/fleet-summary` }),
    respond: (data) => {
      const stats = data?.fleet_stats ?? {};
      return `Fleet average health is ${stats.avg_health ?? "unavailable"}% across ${stats.total_vehicles ?? 0} vehicles — ${stats.critical_count ?? 0} critical and ${stats.warning_count ?? 0} in the warning band.`;
    },
  },
  {
    key: "critical-alerts-by-module",
    label: "Critical alerts by module",
    match: (q: string) => q.includes("alerts by module") || q.includes("critical alerts"),
    fetch: () => ({ url: `${PIPELINE_API}/api/alerts/metrics` }),
    respond: (data) => {
      const open: any[] = data?.open_alerts ?? [];
      if (!open.length) return "No open alerts are currently recorded.";
      const byModule = new Map<string, number>();
      for (const a of open) {
        const mod = String(a.module || "unknown").toLowerCase();
        byModule.set(mod, (byModule.get(mod) ?? 0) + 1);
      }
      const breakdown = Array.from(byModule.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([mod, count]) => `${mod}: ${count}`)
        .join(", ");
      return `${open.length} open alert${open.length === 1 ? "" : "s"} by module — ${breakdown}.`;
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
    fetch: (ctx) => ({ url: `${PIPELINE_API}/api/automotive/vehicle-summary/${ctx.selectedVehicle}` }),
    respond: (data, ctx) => {
      const h = data?.health_snapshot ?? {};
      if (h.health_score == null) return `No live health snapshot is available yet for ${ctx.selectedVehicle}.`;
      return `${ctx.selectedVehicle} is at ${h.health_score}% health (${h.status ?? "status unavailable"})${
        h.fleet_rank ? `, ranked ${h.fleet_rank} of ${h.fleet_total} in the fleet` : ""
      }.`;
    },
  },
  {
    key: "this-vehicle-dtcs",
    label: (ctx) => (ctx.selectedVehicle ? `${ctx.selectedVehicle}'s DTCs` : "This vehicle's DTCs"),
    match: (q: string) => q.includes("this vehicle") && q.includes("dtc"),
    requiresVehicle: true,
    fetch: (ctx) => ({ url: `${PIPELINE_API}/api/automotive/vehicle-summary/${ctx.selectedVehicle}` }),
    respond: (data, ctx) => {
      const last = data?.last_dtc;
      if (!last) return `No DTC analysis has been run yet for ${ctx.selectedVehicle}.`;
      const triggers = (last.triggers ?? []).map((t: any) => `${t.code} (${t.severity})`).join(", ") || "no faults triggered";
      return `Last DTC analysis for ${ctx.selectedVehicle} (${String(last.module || "").toUpperCase()}, run ${String(last.run_ts || "").slice(0, 16).replace("T", " ")}): ${triggers}.`;
    },
  },
  {
    key: "next-service-due",
    label: "Next service due",
    match: (q: string) => q.includes("next service") || q.includes("service due"),
    requiresVehicle: true,
    fetch: (ctx) => ({ url: `${PIPELINE_API}/api/automotive/vehicle-summary/${ctx.selectedVehicle}` }),
    respond: (data, ctx) => {
      const s = data?.service_info ?? {};
      if (s.next_service_in_km == null) return `No service-interval data is available yet for ${ctx.selectedVehicle}.`;
      return `${ctx.selectedVehicle} has ${s.next_service_in_km.toLocaleString()} km remaining until its next scheduled service (odometer: ${s.odometer_km?.toLocaleString() ?? "unknown"} km).`;
    },
  },
  {
    key: "top-anomaly-driver",
    label: "Top anomaly driver",
    match: (q: string) => q.includes("anomaly driver") || q.includes("top anomaly"),
    requiresVehicle: true,
    fetch: (ctx) => ({ url: `${PIPELINE_API}/api/automotive/vehicle-summary/${ctx.selectedVehicle}` }),
    respond: (data, ctx) => {
      const drivers: any[] = data?.top_anomaly_drivers ?? [];
      if (!drivers.length) return `No anomaly-driver data is available yet for ${ctx.selectedVehicle}.`;
      const top = [...drivers].sort((a, b) => Number(b.score) - Number(a.score))[0];
      return `${ctx.selectedVehicle}'s top anomaly driver is ${top.feature} on the ${top.module} module.`;
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
    fetch: () => ({ url: `${PIPELINE_API}/api/automotive/dtc/history` }),
    respond: (data, ctx) => {
      const runs: any[] = data?.runs ?? [];
      const match = runs.find(
        (r) => String(r.source_id) === ctx.selectedVehicle && String(r.module).toLowerCase() === ctx.selectedModule.toLowerCase()
      );
      if (!match) return `No completed DTC analysis found yet for ${ctx.selectedVehicle}'s ${ctx.selectedModule} module.`;
      const triggers = (match.triggers ?? []).map((t: any) => `${t.code} (${t.severity})`).join(", ") || "no faults triggered";
      return `Last ${ctx.selectedModule} analysis for ${ctx.selectedVehicle} (${String(match.run_ts || "").slice(0, 16).replace("T", " ")}): ${triggers}.`;
    },
  },
  {
    key: "known-dtcs-module",
    label: "Known DTCs for this module",
    match: (q: string) => q.includes("known dtc") || q.includes("possible dtc") || (q.includes("dtc") && q.includes("module")),
    fetch: () => ({ url: `${PIPELINE_API}/api/automotive/dtc-master` }),
    respond: (data, ctx) => {
      const records: any[] = data?.modules?.[ctx.selectedModule] ?? [];
      if (!records.length) return `No DTC catalog entries found for the ${ctx.selectedModule} module.`;
      const list = records.slice(0, 5).map((r) => `${r.dtc_code} (${r.severity})`).join(", ");
      return `${ctx.selectedModule.charAt(0).toUpperCase() + ctx.selectedModule.slice(1)} has ${records.length} known DTC code${records.length === 1 ? "" : "s"}: ${list}${records.length > 5 ? ", …" : ""}.`;
    },
  },
  {
    key: "fleet-dtc-distribution-dtc",
    label: "Fleet DTC distribution",
    match: (q: string) => q.includes("dtc distribution") || q.includes("most common dtc") || q.includes("top dtc"),
    fetch: () => ({ url: `${PIPELINE_API}/api/automotive/dtc/fleet-distribution` }),
    respond: (data) => {
      const dist: any[] = data?.distribution ?? [];
      if (!dist.length) return "No DTC analysis runs have been recorded yet.";
      const top = dist.slice(0, 3).map((d) => `${d.code} (${d.count}× across ${d.vehicle_count} vehicles)`).join(", ");
      return `Most frequent DTCs fleet-wide: ${top}.`;
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
    fetch: () => ({ url: `${PIPELINE_API}/api/writer/metrics` }),
    respond: (data) => {
      const modules = Object.values(data ?? {}) as any[];
      if (!modules.length) return "No writer-service metrics are available yet.";
      const stalled = modules.filter((m) => m.status !== "RUNNING");
      const totalLag = modules.reduce((s, m) => s + Number(m.true_lag ?? 0), 0);
      return stalled.length
        ? `Writer service: ${stalled.map((m) => `${m.module} is ${m.status}`).join(", ")}. Total backlog across modules: ${totalLag} rows.`
        : `Writer service is RUNNING on all ${modules.length} modules with a combined backlog of ${totalLag} rows.`;
    },
  },
  {
    key: "inference-lag",
    label: "Inference pipeline lag",
    match: (q: string) => q.includes("inference") && (q.includes("lag") || q.includes("latency")),
    fetch: () => ({ url: `${PIPELINE_API}/api/inference/metrics` }),
    respond: (data) => {
      if (data?.global_e2e_ms == null) return "No inference-latency metrics are available yet.";
      return `Inference end-to-end latency is ${data.global_e2e_ms}ms (model-only: ${data.global_inf_ms}ms) across ${data.active_sims ?? 0} active vehicles and ${data.active_modules ?? 0} modules.`;
    },
  },
  {
    key: "gold-lag",
    label: "Gold computation lag",
    match: (q: string) => q.includes("gold") && (q.includes("lag") || q.includes("health"))    ,
    fetch: () => ({ url: `${PIPELINE_API}/api/gold/metrics` }),
    respond: (data) => {
      if (data == null) return "No Gold-layer metrics are available yet.";
      return `Gold layer has processed ${data.total_gold_rows ?? 0} rows across ${(data.active_sims ?? []).length} vehicles, with a max processing lag of ${data.global_max_lag ?? 0}s${
        data.fleet_vehicle_health_pct != null ? ` and fleet health at ${data.fleet_vehicle_health_pct}%` : ""
      }.`;
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

export { NO_VEHICLE_MSG };
