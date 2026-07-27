import dtcMasterRaw from "../../../../contracts/DTC_master.json?raw";

type DtcRecord = {
  dtc_code: string;
  severity: "critical" | "non_critical";
  category: string;
  description: string;
  dashboard_message: string;
  features: string[];
};

type DtcKnowledgeRecord = DtcRecord & { module: string };

type DtcContract = {
  modules: Record<string, DtcRecord[]>;
};

const contract = JSON.parse(dtcMasterRaw) as DtcContract;
const records: DtcKnowledgeRecord[] = Object.entries(contract.modules).flatMap(
  ([module, moduleRecords]) => moduleRecords.map((record) => ({ ...record, module }))
);
const categories = [...new Set(records.map((record) => record.category))];
const modules = Object.keys(contract.modules);

const normalizedWords = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const compact = (value: string) => normalizedWords(value).replace(/\s+/g, "");

const titleCase = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const featureLabel = (feature: string) => {
  const words = feature
    .split("_")
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      return ["ECU", "RPM", "HV", "SOC", "SOH", "MAF", "O2", "ABS", "TPMS"].includes(upper)
        ? upper
        : word;
    });
  return words
    .filter((word, index) => index === 0 || word.toLowerCase() !== words[index - 1].toLowerCase())
    .join(" ");
};

const levenshtein = (left: string, right: string) => {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let previous = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const current = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        previous + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
      previous = current;
    }
  }
  return row[right.length];
};

const nearestNamedValue = (question: string, values: string[]) => {
  const words = normalizedWords(question).split(" ").filter((word) => word.length >= 4);
  const direct = values.find((value) => normalizedWords(question).includes(normalizedWords(value)));
  if (direct) return direct;

  let best: { value: string; distance: number } | null = null;
  for (const value of values) {
    const targetWords = normalizedWords(value).split(" ");
    for (const word of words) {
      for (const target of targetWords) {
        const distance = levenshtein(word, target);
        const limit = Math.max(1, Math.floor(target.length * 0.24));
        if (distance <= limit && (!best || distance < best.distance)) {
          best = { value, distance };
        }
      }
    }
  }
  return best !== null ? best.value : null;
};

const solutionFor = (record: DtcKnowledgeRecord) => {
  if (record.dtc_code === "P0217") {
    return "Stop the vehicle safely and switch off the engine. Allow it to cool, then inspect coolant level and leaks, radiator airflow/fan operation, thermostat, water pump, and coolant-temperature sensing. Validate the listed signals before clearing the code and completing a controlled road test.";
  }

  const category = record.category.toLowerCase();
  if (category.includes("thermal")) {
    return "Reduce or stop operation if temperature is unsafe. Inspect the relevant cooling circuit, fluid level, pumps, fans, valves/thermostat, wiring, and temperature sensors. Confirm the listed signals agree before clearing the DTC.";
  }
  if (/battery|charging|electrical|12v/.test(category)) {
    return "Isolate the affected electrical system as required, verify voltage/current under load, inspect connectors, grounds, fuses, charging hardware, and battery condition, then validate the listed signals before clearing the DTC.";
  }
  if (/fuel|air intake|emissions|ignition/.test(category)) {
    return "Inspect intake and fuel delivery for leaks or restrictions, check ignition and emissions components relevant to the code, compare the listed live signals with specification, repair the root cause, then clear and retest.";
  }
  if (/mechanical|hydraulic|performance|load/.test(category)) {
    return "Limit vehicle load until diagnosed. Inspect fluid condition/level, pressure or actuator operation, mechanical wear, and related sensors. Compare the listed signals under a controlled test before clearing the DTC.";
  }
  if (/tire|braking|traction|stability|suspension|speed sensor/.test(category)) {
    return "Treat this as a safety-system inspection. Check the affected wheel hardware, pressure or speed sensing, wiring, calibration, and mechanical condition. Correct the cause and confirm all listed signals before returning the vehicle to service.";
  }
  if (/hvac|comfort|body control|environmental/.test(category)) {
    return "Inspect the affected body/HVAC actuator, power supply, wiring, connectors, and sensor feedback. Run the module functional test and recalibration where applicable before clearing the code.";
  }
  if (/ecu|software|data|calibration|sensor/.test(category)) {
    return "Verify power, ground, network communication, wiring, connector integrity, software/calibration level, and sensor plausibility. Use the listed features to isolate the failing input before reprogramming or replacing a module.";
  }
  return "Inspect the affected module, wiring, connectors, and listed live signals against specification. Repair the confirmed root cause, clear the DTC, and verify the fix with a controlled functional test.";
};

const requestedCodes = (question: string) => {
  const squashed = question
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/([PUBC])O(?=[0-9A-F]{3})/g, (_match, prefix: string) => `${prefix}0`);
  return [...new Set(squashed.match(/[PUBC][0-9A-F]{4}/g) ?? [])];
};

const formatCodeDetails = (code: string, matches: DtcKnowledgeRecord[]) => {
  const sections = matches.map((record) =>
    [
      `${record.dtc_code} — ${titleCase(record.module)} module`,
      `Severity: ${record.severity === "critical" ? "Critical" : "Non-critical"}`,
      `Category: ${record.category}`,
      `Meaning: ${record.description}`,
      `Operational impact: ${record.dashboard_message}`,
      `Signals to verify: ${record.features.map(featureLabel).join(", ")}`,
      `Recommended solution: ${solutionFor(record)}`,
    ].join("\n")
  );
  return matches.length > 1
    ? `${code} has ${matches.length} module-specific contract entries:\n\n${sections.join("\n\n")}`
    : sections[0];
};

const formatRecordList = (
  heading: string,
  matchingRecords: DtcKnowledgeRecord[],
  solutionExample?: DtcKnowledgeRecord
) => {
  const sorted = [...matchingRecords].sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === "critical" ? -1 : 1;
    return left.dtc_code.localeCompare(right.dtc_code);
  });
  const lines = sorted.map(
    (record) =>
      `• ${record.dtc_code} — ${titleCase(record.module)} | ${
        record.severity === "critical" ? "Critical" : "Non-critical"
      } | ${record.description}`
  );
  const solution = solutionExample
    ? `\nRecommended diagnostic approach: ${solutionFor(solutionExample)}`
    : "";
  return `${heading} (${sorted.length}):\n${lines.join("\n")}${solution}`;
};

export const getDtcDetails = (code: string): DtcRecord & { module: string } | null => {
  const match = records.find((r) => r.dtc_code === code.toUpperCase());
  return match ?? null;
};

export const answerDtcQuestion = (question: string): string | null => {
  const codes = requestedCodes(question);
  if (codes.length) {
    return codes
      .map((code) => {
        const matches = records.filter((record) => record.dtc_code === code);
        return matches.length
          ? formatCodeDetails(code, matches)
          : `${code} is not present in the current DTC contract. I’ll work on it and come back with a validated diagnostic entry.`;
      })
      .join("\n\n");
  }

  const normalized = normalizedWords(question);
  const diagnosticIntent = /\b(dtc|diagnostic|fault|faults|trouble code|codes?|category|categories|repair|solution)\b/.test(
    normalized
  );
  const listIntent = /\b(show|list|all|which|what|find)\b/.test(normalized);
  const directCategory = categories.find((value) =>
    normalized.includes(normalizedWords(value))
  );
  const category = nearestNamedValue(question, categories);
  const module = nearestNamedValue(question, modules);
  const explicitModule = modules.find((value) =>
    normalized.split(" ").includes(normalizedWords(value))
  );
  const wantsCritical = /\bcritical\b/.test(normalized) && !/\bnon critical\b/.test(normalized);
  const wantsNonCritical = /\bnon critical\b/.test(normalized);

  if (explicitModule && diagnosticIntent && !directCategory) {
    let matches = records.filter((record) => record.module === explicitModule);
    if (wantsCritical) matches = matches.filter((record) => record.severity === "critical");
    if (wantsNonCritical) matches = matches.filter((record) => record.severity === "non_critical");
    return formatRecordList(`${titleCase(explicitModule)} module DTC entries`, matches, matches[0]);
  }

  if (category && (diagnosticIntent || listIntent)) {
    let matches = records.filter((record) => record.category === category);
    if (explicitModule) matches = matches.filter((record) => record.module === explicitModule);
    if (wantsCritical) matches = matches.filter((record) => record.severity === "critical");
    if (wantsNonCritical) matches = matches.filter((record) => record.severity === "non_critical");
    return formatRecordList(`${category} DTC entries`, matches, matches[0]);
  }

  if (module && diagnosticIntent) {
    let matches = records.filter((record) => record.module === module);
    if (wantsCritical) matches = matches.filter((record) => record.severity === "critical");
    if (wantsNonCritical) matches = matches.filter((record) => record.severity === "non_critical");
    return formatRecordList(`${titleCase(module)} module DTC entries`, matches, matches[0]);
  }

  if (diagnosticIntent && (wantsCritical || wantsNonCritical)) {
    const severity = wantsCritical ? "critical" : "non_critical";
    const matches = records.filter((record) => record.severity === severity);
    return formatRecordList(
      `${wantsCritical ? "Critical" : "Non-critical"} DTC entries`,
      matches
    );
  }

  return null;
};

export const dtcContractSummary = {
  recordCount: records.length,
  categories,
  modules,
};
