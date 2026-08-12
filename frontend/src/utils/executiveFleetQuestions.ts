export type ExecutiveQuestionData = {
  positions: any[];
  fleetSummary?: any;
  automotiveSummary?: any;
  alerts?: any;
  dtcDistribution?: any;
};

export type ExecutiveQuestionAnswer = {
  intentId: string;
  title: string;
  text: string;
  details: string;
};

export type ExecutiveQuestionIntent = { id: string; title: string; aliases: string[] };

const intents: ExecutiveQuestionIntent[] = [
  { id: "health", title: "Fleet Health", aliases: ["overall fleet health today", "current fleet health score", "fleet health today", "how healthy is the fleet"] },
  { id: "health_cause", title: "Why Fleet Health Is Low", aliases: ["why is the fleet health score low", "what is causing low fleet health", "reason fleet health is low", "what is causing the highest maintenance risk"] },
  { id: "critical", title: "Critical Vehicles", aliases: ["which vehicles are currently critical", "show critical vehicles", "which vehicles should be removed from operation", "which vehicle issue should be escalated immediately"] },
  { id: "lowest", title: "Lowest-Health Vehicle", aliases: ["which vehicle has the lowest health score", "most critical vehicle", "recommended action for the lowest health vehicle", "main issue with the most critical vehicle", "root cause of the critical vehicle issue"] },
  { id: "availability", title: "Fleet Availability", aliases: ["how many vehicles are available right now", "fleet availability percentage", "current fleet availability", "is fleet ready for today operations"] },
  { id: "maintenance_count", title: "Vehicles Under Maintenance", aliases: ["how many vehicles are under maintenance", "vehicles in workshop", "vehicles under service"] },
  { id: "offline", title: "Offline or Inactive Vehicles", aliases: ["how many vehicles are offline or inactive", "offline vehicle count", "inactive vehicles"] },
  { id: "utilization", title: "Fleet Utilization", aliases: ["current utilization score", "why is utilization low today", "is utilization improving or declining", "fleet utilization"] },
  { id: "underutilized", title: "Underutilized Vehicles", aliases: ["which vehicles are underutilized", "low utilization vehicles", "vehicles not being used enough"] },
  { id: "overutilized", title: "Overutilized Vehicles", aliases: ["which vehicles are overutilized", "high utilization vehicles", "vehicles being used too much"] },
  { id: "risk", title: "AI Risk Index", aliases: ["current ai risk index", "how many vehicles are at risk", "which kpis are outside target", "fleet risk today"] },
  { id: "failure_forecast", title: "Predicted Failure Risk", aliases: ["which vehicles are likely to fail soon", "failures predicted in the next 7 days", "which vehicles are likely to become critical soon", "how many failures can we prevent with early maintenance"] },
  { id: "maintenance_due", title: "Maintenance Due Soon", aliases: ["which vehicles need maintenance soon", "how many vehicles need service in the next 5 days", "maintenance prioritized this week", "forecast for maintenance demand"] },
  { id: "failure_categories", title: "Predicted Failure Categories", aliases: ["top predicted failure categories", "are engine issues increasing", "are battery issues increasing", "are brake related issues increasing", "highest maintenance risk"] },
  { id: "urgent_alerts", title: "Urgent Alerts", aliases: ["most urgent alerts right now", "recent critical alerts", "which alert needs immediate attention", "how many critical alerts are open", "how many warning alerts are open"] },
  { id: "alert_trend", title: "Alert Trend", aliases: ["are alerts increasing compared to the previous period", "alert trend", "alerts compared to yesterday"] },
  { id: "business_impact", title: "Operational Impact", aliases: ["business impact of current fleet issues", "estimated downtime risk", "vehicles may cause operational disruption", "breakdown cost"] },
  { id: "actions", title: "Recommended Actions", aliases: ["top recommendations to reduce risk", "what actions should we take today", "top 3 operational concerns", "what should i focus on first in the cockpit view"] },
  { id: "cost_actions", title: "Cost-Saving Actions", aliases: ["top 3 cost saving actions", "reduce breakdown cost this month", "cost saving recommendations"] },
  { id: "safe_to_operate", title: "Operating Safety", aliases: ["which vehicles can continue operating safely", "which vehicles are safe warning and critical", "safe vehicles", "poor health vehicles"] },
  { id: "driver_impact", title: "Driver Impact", aliases: ["driver behavior impact on fleet health", "drivers linked to high risk vehicles", "drivers reducing vehicle health through harsh driving", "harsh driving impact"] },
  { id: "location_risk", title: "Location and Route Risk", aliases: ["which routes have more risk or alerts", "which region has the highest vehicle risk", "which depot or location has the most critical vehicles", "route risk"] },
  { id: "fleet_trend", title: "Fleet Trend", aliases: ["trend in fleet health compared to yesterday", "is fleet availability improving or declining", "what changed in the fleet since yesterday", "fleet trend"] },
  { id: "best", title: "Top-Performing Vehicles", aliases: ["which vehicles are performing best", "show me the top performing vehicles", "which vehicles have excellent health"] },
  { id: "health_buckets", title: "Fleet Health Distribution", aliases: ["how many vehicles are in excellent good average and poor health", "health distribution", "excellent good average poor"] },
  { id: "summary", title: "Executive Fleet Summary", aliases: ["summary of today fleet performance", "executive summary of the fleet status", "key risks leadership should know", "fleet status summary"] },
];

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const stopWords = new Set(["what", "which", "is", "are", "the", "a", "an", "of", "to", "in", "on", "for", "me", "show", "today", "current", "now", "how", "many", "give"]);
const words = (value: string) => new Set(normalize(value).split(" ").filter((word) => word.length > 2 && !stopWords.has(word)));
const similarity = (left: string, right: string) => {
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  a.forEach((word) => { if (b.has(word) || [...b].some((other) => other.startsWith(word) || word.startsWith(other))) common += 1; });
  return (2 * common) / (a.size + b.size);
};

export const matchExecutiveFleetQuestion = (question: string): ExecutiveQuestionIntent | null => {
  const normalized = normalize(question);
  let best: { intent: ExecutiveQuestionIntent; score: number } | null = null;
  for (const intent of intents) {
    for (const alias of intent.aliases) {
      const normalizedAlias = normalize(alias);
      const score = normalized.includes(normalizedAlias) || normalizedAlias.includes(normalized)
        ? 1
        : similarity(normalized, normalizedAlias);
      if (!best || score > best.score) best = { intent, score };
    }
  }
  return best && best.score >= 0.48 ? best.intent : null;
};

export const executiveQuestionIntentById = (intentId: string) =>
  intents.find((intent) => intent.id === intentId) ?? null;

const health = (vehicle: any) => Number(vehicle?.health ?? vehicle?.health_score ?? 0);
const status = (vehicle: any) => String(vehicle?.status ?? "unknown").toLowerCase();
const id = (vehicle: any) => String(vehicle?.vehicle_id ?? vehicle?.id ?? "Unknown");
const list = (vehicles: any[], limit = 6) => vehicles.slice(0, limit).map((vehicle) => `${id(vehicle)} (${Math.round(health(vehicle))}%)`).join(", ") || "None";
const percent = (value: number) => `${Math.round(value)}%`;
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const routeOf = (vehicle: any) => String(vehicle?.route_name ?? vehicle?.route ?? vehicle?.depot ?? vehicle?.location ?? "Unassigned");

export const buildExecutiveFleetAnswer = (intent: ExecutiveQuestionIntent, data: ExecutiveQuestionData): ExecutiveQuestionAnswer => {
  const positions = data.positions ?? [];
  const total = positions.length || Number(data.fleetSummary?.total ?? data.fleetSummary?.total_vehicles ?? 0);
  const ranked = [...positions].sort((a, b) => health(a) - health(b));
  const critical = ranked.filter((vehicle) => health(vehicle) < 50);
  const warning = ranked.filter((vehicle) => health(vehicle) >= 50 && health(vehicle) < 80);
  const safe = ranked.filter((vehicle) => health(vehicle) >= 80);
  const active = positions.filter((vehicle) => ["active", "available", "moving", "online"].includes(status(vehicle)));
  const parked = positions.filter((vehicle) => status(vehicle) === "parked");
  const workshop = positions.filter((vehicle) => ["in_service", "service", "workshop", "maintenance"].includes(status(vehicle)));
  const offline = positions.filter((vehicle) => ["offline", "inactive", "disconnected"].includes(status(vehicle)));
  const avgHealth = Number(data.fleetSummary?.avg_health ?? data.fleetSummary?.average_health ?? average(positions.map(health)));
  const availability = total ? ((active.length + parked.length) / total) * 100 : 0;
  const utilization = Number(data.fleetSummary?.fleet_utilization_pct ?? data.fleetSummary?.utilization ?? (total ? (active.length / total) * 100 : 0));
  const riskIndex = total ? ((critical.length * 1.8 + warning.length * .75) / total) * 100 : 0;
  const worst = ranked[0];
  const soon = ranked.filter((vehicle) => health(vehicle) < 60 && !workshop.includes(vehicle));
  const predicted = ranked.filter((vehicle) => health(vehicle) < 70 && !workshop.includes(vehicle));
  const alerts = data.alerts ?? {};
  const openAlerts: any[] = alerts.open_alerts ?? [];
  const closedAlerts: any[] = alerts.closed_alerts ?? [];
  const criticalAlerts = openAlerts.filter((alert) => String(alert.severity).toLowerCase() === "critical");
  const warningAlerts = openAlerts.filter((alert) => String(alert.severity).toLowerCase() === "warning");
  const dtcs: any[] = data.dtcDistribution?.distribution ?? [];
  const automotiveVehicles: any[] = data.automotiveSummary?.vehicles ?? [];
  const moduleNames = ["engine", "transmission", "battery", "body", "tyre"];
  const moduleAverages = moduleNames.map((module) => ({ module, value: average(automotiveVehicles.map((vehicle) => Number(vehicle[`${module}_contrib`] ?? 100))) })).sort((a, b) => a.value - b.value);
  const weakestModule = moduleAverages[0];
  const detailBase = `Backend snapshot: ${total} vehicles; ${active.length} active, ${parked.length} parked, ${workshop.length} in workshop, ${offline.length} offline. Fleet Health ${percent(avgHealth)}, Availability ${percent(availability)}, Utilization ${percent(utilization)}, Risk Index ${percent(riskIndex)}.`;

  const answer = (text: string, details: string) => ({ intentId: intent.id, title: intent.title, text, details: `${details}\n\n${detailBase}` });
  switch (intent.id) {
    case "health": return answer(`• Fleet Health: ${percent(avgHealth)}\n• ${critical.length} Critical and ${warning.length} Warning vehicles\n• ${safe.length} vehicles are in Good or Excellent health`, `Health is calculated from the latest backend vehicle scores. Lowest vehicles: ${list(ranked)}.`);
    case "health_cause": return answer(`• Fleet Health is ${percent(avgHealth)}\n• ${critical.length + warning.length} vehicles are below the 80% target\n• Main pressure: ${weakestModule ? `${weakestModule.module} performance` : "vehicle component health"}`, `The lowest module average is ${weakestModule ? `${weakestModule.module} at ${percent(weakestModule.value)}` : "not available"}. Most common fault: ${dtcs[0]?.code ?? "not available"}.`);
    case "critical": return answer(`• ${critical.length} vehicles are currently Critical\n• ${list(critical)}\n• Remove them from operation until reviewed`, `Critical means health below 50%. Full Critical list: ${list(critical, 50)}.`);
    case "lowest": return answer(worst ? `• ${id(worst)} has the lowest health at ${percent(health(worst))}\n• Status: ${status(worst)}\n• Action: inspect and fix before the next route` : "• No vehicle health data is available", `The likely issue is the weakest component contribution or an active alert. ${weakestModule ? `Fleet-wide, ${weakestModule.module} is currently weakest.` : "Module evidence is not available."}`);
    case "availability": return answer(`• ${active.length + parked.length} of ${total} vehicles are available\n• Availability: ${percent(availability)}\n• ${workshop.length + offline.length} are unavailable`, `Available includes backend statuses Active and Parked; workshop and offline vehicles are excluded.`);
    case "maintenance_count": return answer(`• ${workshop.length} vehicles are under maintenance\n• ${soon.length} additional vehicles need service soon\n• Priority: ${list(soon, 3)}`, `Workshop vehicles: ${list(workshop, 50)}. Maintenance-soon is derived from health below 60% and not already in service.`);
    case "offline": return answer(`• ${offline.length} vehicles are Offline or Inactive\n• ${workshop.length} are in Workshop\n• ${total - active.length - parked.length} are not currently available`, `Offline vehicles: ${list(offline, 50)}.`);
    case "utilization": return answer(`• Utilization: ${percent(utilization)}\n• ${active.length} of ${total} vehicles are active\n• ${parked.length} parked vehicles are the main unused capacity`, `Utilization uses the backend value when supplied; otherwise it is Active vehicles divided by Total Fleet.`);
    case "underutilized": return answer(`• ${parked.length + offline.length} vehicles are underutilized\n• Parked: ${parked.length}; Offline: ${offline.length}\n• Review: ${list([...parked, ...offline], 5)}`, `Underutilized is inferred from Parked, Offline, or Inactive backend status. A dedicated utilization field will override this when available.`);
    case "overutilized": { const over = positions.filter((vehicle) => Number(vehicle.utilization ?? vehicle.utilization_score ?? 0) >= 85); return answer(`• ${over.length} vehicles are above 85% utilization\n• ${list(over, 5)}\n• Balance assignments to protect maintenance windows`, `Overutilized requires a utilization value of 85% or more. Vehicles without that backend field are excluded.`); }
    case "risk": return answer(`• AI Risk Index: ${percent(riskIndex)}\n• ${critical.length + warning.length} vehicles are at risk\n• Highest risk: ${worst ? `${id(worst)} at ${percent(health(worst))} health` : "None"}`, `Risk weights Critical vehicles more heavily than Warning vehicles. At-risk list: ${list([...critical, ...warning], 50)}.`);
    case "failure_forecast": return answer(`• ${predicted.length} vehicles show near-term failure risk\n• Highest risk: ${list(predicted, 5)}\n• Early maintenance can reduce avoidable breakdowns`, `Predicted risk currently uses backend health below 70% outside the workshop. Failure-model output will be used directly when supplied.`);
    case "maintenance_due": return answer(`• ${soon.length} vehicles need near-term service\n• ${Math.min(soon.length, critical.length)} should be prioritized immediately\n• Queue: ${list(soon, 5)}`, `Near-term maintenance is based on health below 60% and current workshop status. Full queue: ${list(soon, 50)}.`);
    case "failure_categories": return answer(`• Highest category: ${weakestModule?.module ?? dtcs[0]?.module ?? "Not available"}\n• Top fault: ${dtcs[0]?.code ?? "No active DTC trend"}\n• Monitor Engine, Battery, Brake, and Transmission patterns`, `Module averages: ${moduleAverages.map((item) => `${item.module} ${percent(item.value)}`).join(", ") || "not available"}. DTC distribution: ${dtcs.slice(0, 8).map((item) => `${item.code} (${item.count})`).join(", ") || "not available"}.`);
    case "urgent_alerts": return answer(`• ${criticalAlerts.length} Critical alerts are open\n• ${warningAlerts.length} Warning alerts are open\n• Immediate attention: ${criticalAlerts[0]?.source_id ?? openAlerts[0]?.source_id ?? "No open alert"}`, `Recent open alerts: ${openAlerts.slice(0, 12).map((alert) => `${alert.source_id}: ${alert.module ?? "vehicle"} (${alert.severity ?? "open"})`).join("; ") || "None"}. Resolved today: ${alerts.resolved_today ?? closedAlerts.length}.`);
    case "alert_trend": return answer(`• ${openAlerts.length} alerts are currently open\n• ${closedAlerts.length} recent alerts are resolved\n• Period comparison: ${alerts.alert_change_pct ?? alerts.change_vs_previous ?? "not provided by backend"}`, `A reliable trend needs current and previous-period counts. The backend currently reports ${openAlerts.length} open and ${closedAlerts.length} closed alert records.`);
    case "business_impact": return answer(`• ${critical.length} vehicles may disrupt operations\n• ${workshop.length} vehicles are already unavailable in Workshop\n• Estimated capacity exposure: ${percent(total ? ((critical.length + workshop.length) / total) * 100 : 0)}`, `Potential disruption vehicles: ${list([...critical, ...soon], 50)}. Downtime duration is shown only when the backend supplies timestamps or downtime fields.`);
    case "actions": return answer(`• Fix ${worst ? id(worst) : "the lowest-health vehicle"} first\n• Clear ${criticalAlerts.length} Critical alerts\n• Schedule ${soon.length} near-term maintenance checks\n• Reassign parked capacity where possible`, `Priority is based on health, alert severity, service need, and operational availability. Critical vehicles should not return to service before review.`);
    case "cost_actions": return answer(`• Service high-risk vehicles before breakdown\n• Combine Warning repairs with planned workshop visits\n• Rebalance parked capacity before adding overtime`, `These actions target unplanned downtime, repeat workshop visits, and unnecessary capacity cost. Highest-cost exposure: ${list([...critical, ...soon], 5)}.`);
    case "safe_to_operate": return answer(`• Safe: ${safe.length}\n• Warning: ${warning.length}\n• Critical: ${critical.length}\n• Critical vehicles should be removed pending inspection`, `Safe vehicles: ${list(safe, 50)}. Warning: ${list(warning, 50)}. Critical: ${list(critical, 50)}.`);
    case "driver_impact": { const risky = positions.filter((vehicle) => Number(vehicle.driver_score ?? 100) < 70 || health(vehicle) < 60).sort((a, b) => Number(a.driver_score ?? 100) - Number(b.driver_score ?? 100)); return answer(`• ${risky.length} driver-vehicle assignments need review\n• Lowest score: ${risky[0]?.driver ?? "Not available"} — ${risky[0]?.driver_score ?? "N/A"}/100\n• Focus on braking, acceleration, and cornering SOPs`, `High-risk assignments: ${risky.slice(0, 12).map((vehicle) => `${vehicle.driver ?? "Unassigned"} / ${id(vehicle)} (${vehicle.driver_score ?? "N/A"}, health ${percent(health(vehicle))})`).join("; ") || "None"}.`); }
    case "location_risk": { const groups = new Map<string, any[]>(); [...critical, ...warning].forEach((vehicle) => { const key = routeOf(vehicle); groups.set(key, [...(groups.get(key) ?? []), vehicle]); }); const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length); return answer(`• Highest-risk location: ${sorted[0]?.[0] ?? "Not available"}\n• At-risk vehicles there: ${sorted[0]?.[1].length ?? 0}\n• Review route conditions and depot maintenance capacity`, `Risk by route/location: ${sorted.map(([name, vehicles]) => `${name}: ${vehicles.length}`).join("; ") || "No route data available"}.`); }
    case "fleet_trend": return answer(`• Fleet Health: ${percent(avgHealth)}\n• Availability: ${percent(availability)}\n• Utilization: ${percent(utilization)}\n• Yesterday comparison is ${data.fleetSummary?.change_vs_yesterday ?? "not supplied by the backend"}`, `Trend statements require historical KPI values. Current snapshot is available; the assistant will calculate direction automatically when previous-period fields are returned.`);
    case "best": { const best = [...ranked].reverse().slice(0, 5); return answer(`• ${safe.length} vehicles have Good or Excellent health\n• Best: ${list(best, 5)}\n• Prioritize them for high-value routes`, `Top-performing vehicles: ${list([...ranked].reverse(), 50)}.`); }
    case "health_buckets": { const excellent = positions.filter((vehicle) => health(vehicle) >= 90); const good = positions.filter((vehicle) => health(vehicle) >= 80 && health(vehicle) < 90); const averageVehicles = positions.filter((vehicle) => health(vehicle) >= 60 && health(vehicle) < 80); const poor = positions.filter((vehicle) => health(vehicle) < 60); return answer(`• Excellent: ${excellent.length}\n• Good: ${good.length}\n• Average: ${averageVehicles.length}\n• Poor: ${poor.length}`, `Excellent ≥90%, Good 80–89%, Average 60–79%, Poor <60%. Poor-health vehicles: ${list(poor, 50)}.`); }
    case "summary": return answer(`• Fleet Health ${percent(avgHealth)}; Availability ${percent(availability)}\n• ${critical.length} Critical, ${warning.length} Warning, ${openAlerts.length} open alerts\n• ${workshop.length} in Workshop; Utilization ${percent(utilization)}\n• First priority: ${worst ? id(worst) : "routine monitoring"}`, `Leadership risks: ${list([...critical, ...warning], 10)}. Top fault: ${dtcs[0]?.code ?? "not available"}. Near-term service queue: ${list(soon, 20)}.`);
    default: return answer("• Fleet data is available, but this question needs a more specific KPI.", detailBase);
  }
};