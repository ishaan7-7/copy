export type KnowledgeRepoAnswer = {
  text: string;
  section: string;
};

type KnowledgeEntry = KnowledgeRepoAnswer & {
  matches: (normalizedQuestion: string) => boolean;
};

const includesAll = (question: string, terms: string[]) =>
  terms.every((term) => question.includes(term));

const knowledgeEntries: KnowledgeEntry[] = [
  {
    section: "doc-mqtt",
    matches: (question) => question.includes("mqtt"),
    text: "MQTT provides a lightweight publish/subscribe path for vehicle telemetry. The edge telematics unit collects CAN, GPS, IMU, and analog data, validates and enriches it, then publishes it through structured fleet topics. QoS levels, retained messages, persistent sessions, and Last Will messages provide delivery and connection-state controls for unreliable cellular networks.",
  },
  {
    section: "doc-vt",
    matches: (question) =>
      includesAll(question, ["telemetry", "signal"]) ||
      includesAll(question, ["ecu", "signal"]) ||
      question.includes("signal catalog"),
    text: "The telemetry signal catalog is organized by ECU and supports ICE, hybrid, and battery-electric vehicles. It covers engine, transmission, braking and stability, body control, ADAS, battery management, electric drive, restraint, telematics, infotainment, HVAC, gateway, chassis, and auxiliary signals with units and diagnostic relevance.",
  },
  {
    section: "doc-vf",
    matches: (question) =>
      (question.includes("dtc") || question.includes("diagnostic trouble")) &&
      (question.includes("structure") ||
        question.includes("classification") ||
        question.includes("obd") ||
        question.includes("diagnostic mode")),
    text: "A DTC identifies the affected vehicle domain and fault family. The repository explains powertrain, chassis, body, and network code structures; generic versus manufacturer-specific codes; OBD-II diagnostic modes; freeze-frame data; readiness monitors; and ECU-specific fault classifications used during investigation.",
  },
  {
    section: "doc-vm",
    matches: (question) =>
      includesAll(question, ["derived", "metric"]) ||
      includesAll(question, ["computed", "metric"]) ||
      question.includes("metric formula") ||
      question.includes("predictive maintenance metric"),
    text: "The derived-metrics reference defines 105 computed measures across engine, battery and energy, fuel, drivetrain, vehicle dynamics, braking, thermal, electrical, driver behavior, predictive maintenance, emissions, and ADAS. Each metric links formulas and input signals to diagnostic, predictive, performance, or compliance use cases.",
  },
  {
    section: "p1",
    matches: (question) =>
      question.includes("fleet operations manager") ||
      includesAll(question, ["fleet manager", "insight"]),
    text: "For a Fleet Operations Manager, the repository connects live location, utilization, fuel or energy efficiency, driver behavior, maintenance risk, and safety events to operational KPIs. The intended outcome is faster dispatch decisions, less unplanned downtime, better asset utilization, and targeted driver or maintenance action.",
  },
  {
    section: "p7",
    matches: (question) =>
      question.includes("ev fleet manager") || includesAll(question, ["electric fleet", "insight"]),
    text: "For an EV Fleet Manager, the repository focuses on state of charge and health, energy efficiency, range adequacy, thermal risk, charging power and cost, missed charging events, regenerative braking, charger utilization, and battery replacement planning.",
  },
];

export const answerKnowledgeRepoQuestion = (question: string): KnowledgeRepoAnswer | null => {
  const normalized = question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const match = knowledgeEntries.find((entry) => entry.matches(normalized));
  return match ? { text: match.text, section: match.section } : null;
};

export const knowledgeRepoQuestions = [
  "How does MQTT support vehicle telemetry?",
  "What vehicle telemetry signals are available?",
  "How are DTCs structured and classified?",
  "What derived fleet metrics are available?",
];
