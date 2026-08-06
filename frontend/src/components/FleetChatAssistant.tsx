import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  Dialog,
  DialogContent,
  DialogTitle,
  Fab,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddCommentRoundedIcon from "@mui/icons-material/AddCommentRounded";
import ChatBubbleRoundedIcon from "@mui/icons-material/ChatBubbleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { alpha, useTheme } from "@mui/material/styles";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import { useGoldStream } from "../contexts/GoldStreamContext";
import { useStore } from "../store";
import { answerDtcQuestion } from "../utils/dtcKnowledge";
import {
  answerKnowledgeRepoQuestion,
  type KnowledgeRepoAnswer,
} from "../utils/knowledgeRepoKnowledge";
import {
  pageKeyForPath,
  topicsFor,
  ALL_TOPICS,
  NO_VEHICLE_MSG,
  type AssistantRole,
  type AssistantTopic,
  type TopicContext,
} from "../utils/assistantTopics";
import {
  buildExecutiveFleetAnswer,
  executiveQuestionIntentById,
  matchExecutiveFleetQuestion,
  type ExecutiveQuestionAnswer,
} from "../utils/executiveFleetQuestions";

const FLEET_API = "http://127.0.0.1:8009/api/fleet";
const CHAT_POSITION_KEY = "telemetrix-fleet-chat-position-v3";
const CHAT_LAUNCHER_SIZE = 50;
const CHAT_VIEWPORT_GAP = 8;
const CHAT_DEFAULT_EDGE_GAP = 20;
const CHAT_DEFAULT_BOTTOM_GAP = 88;

type ChatPosition = {
  x: number;
  y: number;
};

type StoredChatOffsets = {
  right: number;
  bottom: number;
};

const clampChatPosition = (position: ChatPosition): ChatPosition => ({
  x: Math.min(
    Math.max(CHAT_VIEWPORT_GAP, position.x),
    Math.max(CHAT_VIEWPORT_GAP, window.innerWidth - CHAT_LAUNCHER_SIZE - CHAT_VIEWPORT_GAP)
  ),
  y: Math.min(
    Math.max(CHAT_VIEWPORT_GAP, position.y),
    Math.max(CHAT_VIEWPORT_GAP, window.innerHeight - CHAT_LAUNCHER_SIZE - CHAT_VIEWPORT_GAP)
  ),
});

const chatPositionFromOffsets = (offsets: StoredChatOffsets): ChatPosition =>
  clampChatPosition({
    x: window.innerWidth - CHAT_LAUNCHER_SIZE - offsets.right,
    y: window.innerHeight - CHAT_LAUNCHER_SIZE - offsets.bottom,
  });

const persistChatPosition = (position: ChatPosition) => {
  const offsets: StoredChatOffsets = {
    right: Math.max(CHAT_VIEWPORT_GAP, window.innerWidth - CHAT_LAUNCHER_SIZE - position.x),
    bottom: Math.max(CHAT_VIEWPORT_GAP, window.innerHeight - CHAT_LAUNCHER_SIZE - position.y),
  };
  window.localStorage.setItem(CHAT_POSITION_KEY, JSON.stringify(offsets));
};

type FleetFooterSummary = Record<string, unknown> & {
  avg_driver_score?: number;
  avg_safety_score?: number;
  safety_score?: number;
};

type FleetFooterPosition = Record<string, unknown> & {
  type?: string;
  status?: string;
  status_since?: string;
  health?: number;
  driver_score?: number;
  safety_score?: number;
  driver_safety_score?: number;
};

type Message = {
  id: number;
  role: "assistant" | "user";
  text: string;
  knowledgeSection?: string;
  detailTitle?: string;
  detailText?: string;
  detailIntentId?: string;
};

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

type FleetChatAssistantProps = {
  activeAlertCount: number;
  currentRoleLabel: string;
};

const SESSIONS_STORAGE_KEY = "telemetrix-fleet-chat-sessions-v1";
const ACTIVE_SESSION_STORAGE_KEY = "telemetrix-fleet-chat-active-session-v1";
const RESET_TOKEN_STORAGE_KEY = "telemetrix-fleet-chat-reset-token-v1";
const RESET_TOKEN_API = "http://127.0.0.1:8005/api/session/reset-token";
const GREETING_TEXT =
  "Hi! I’m your AI Fleet Assistant. Ask me about fleet performance, vehicle diagnostics, driver insights, or telemetry—I’m here to help.";

const makeSessionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const freshGreeting = (): Message[] => [{ id: 1, role: "assistant", text: GREETING_TEXT }];

const deriveSessionTitle = (messages: Message[]) => {
  const firstUserMessage = messages.find((m) => m.role === "user");
  if (!firstUserMessage) return "New chat";
  return firstUserMessage.text.length > 42
    ? `${firstUserMessage.text.slice(0, 42)}…`
    : firstUserMessage.text;
};

const loadStoredSessions = (): ChatSession[] => {
  try {
    const raw = window.localStorage.getItem(SESSIONS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistSessions = (sessions: ChatSession[]) => {
  window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
};

const loadInitialChatState = (): { sessions: ChatSession[]; activeSessionId: string; messages: Message[] } => {
  const sessions = loadStoredSessions();
  const savedActiveId = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
  const activeSession = sessions.find((s) => s.id === savedActiveId);
  if (activeSession) {
    return { sessions, activeSessionId: activeSession.id, messages: activeSession.messages };
  }
  return { sessions, activeSessionId: makeSessionId(), messages: freshGreeting() };
};

const roleTopics: Record<string, string[]> = {
  executive: ["Today's downtime", "Fleet composition", "Safety score"],
  monitoring: [
    "Workshop service queue",
    "Parked vehicle count",
    "Live stream status",
  ],
  engineering: [
    "Backend data availability",
    "DTC P0217",
    "Telemetry stream status",
  ],
};

const numberFrom = (record: Record<string, unknown> | undefined, keys: string[]) => {
  if (!record) return null;
  for (const key of keys) {
    const rawValue = record[key];
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    const value = Number(rawValue);
    if (Number.isFinite(value)) return value;
  }
  return null;
};

const formatMinutes = (minutes: number) => {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

export default function FleetChatAssistant({
  activeAlertCount,
  currentRoleLabel,
}: FleetChatAssistantProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const { vehicles, connected } = useGoldStream();
  const autoRefresh = useStore((s) => s.autoRefresh);
  const pageSelectedVehicle = useStore((s) => s.selectedVehicle);
  const pageSelectedModule = useStore((s) => s.selectedModule);
  const pageKey = useMemo(() => pageKeyForPath(location.pathname), [location.pathname]);
  const assistantRole = currentRoleLabel.toLowerCase() as AssistantRole;
  const { data: fleetSummary, isError: fleetSummaryError } = useQuery<FleetFooterSummary>({
    queryKey: ["fleet-summary"],
    queryFn: () => axios.get(`${FLEET_API}/summary`).then((response) => response.data),
    retry: 1,
    refetchInterval: autoRefresh ? 10000 : false,
  });
  const { data: fleetPositions, isError: fleetPositionsError } = useQuery<FleetFooterPosition[]>({
    queryKey: ["fleet-positions"],
    queryFn: () => axios.get(`${FLEET_API}/positions`).then((response) => response.data),
    retry: 1,
    refetchInterval: autoRefresh ? 10000 : false,
  });
  const [open, setOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [chatPosition, setChatPosition] = useState<ChatPosition>(() => {
    if (typeof window === "undefined") return { x: 20, y: 80 };
    try {
      const savedPosition = window.localStorage.getItem(CHAT_POSITION_KEY);
      return savedPosition
        ? chatPositionFromOffsets(JSON.parse(savedPosition) as StoredChatOffsets)
        : chatPositionFromOffsets({
            right: CHAT_DEFAULT_EDGE_GAP,
            bottom: CHAT_DEFAULT_BOTTOM_GAP,
          });
    } catch {
      return chatPositionFromOffsets({
        right: CHAT_DEFAULT_EDGE_GAP,
        bottom: CHAT_DEFAULT_BOTTOM_GAP,
      });
    }
  });
  const [typing, setTyping] = useState(false);
  const [questionInput, setQuestionInput] = useState("");
  const [initialChatState] = useState(loadInitialChatState);
  const [sessions, setSessions] = useState<ChatSession[]>(initialChatState.sessions);
  const [activeSessionId, setActiveSessionId] = useState(initialChatState.activeSessionId);
  const [messages, setMessages] = useState<Message[]>(initialChatState.messages);
  const [historyAnchorEl, setHistoryAnchorEl] = useState<HTMLElement | null>(null);
  const [detailAnswer, setDetailAnswer] = useState<{
    title: string;
    text: string;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const pageTopics = useMemo(() => topicsFor(pageKey, assistantRole), [pageKey, assistantRole]);
  // `fleetPositions` (fleet_sim_server) is a static, hand-authored seed value
  // that never changes at runtime — CockpitView.tsx already treats it as a
  // fallback only, preferring the live gold-computed health score
  // (`useGoldStream`) whenever a vehicle is actively streaming. The chatbot
  // previously read `fleetPositions.health` directly, so its numbers could
  // silently disagree with every other page for the same active vehicle at
  // the same moment. Merging gold data in here — once, at the context
  // boundary — fixes every topic that reads `ctx.fleetPositions` without
  // touching their individual logic.
  const goldHealthMap = useMemo(() => {
    const map = new Map<string, (typeof vehicles)[number]>();
    for (const v of vehicles) map.set(v.vehicle_id, v);
    return map;
  }, [vehicles]);
  const resolvedFleetPositions = useMemo(() => {
    if (!fleetPositions) return fleetPositions;
    return fleetPositions.map((p) => {
      const vehicleId = String(p.vehicle_id ?? p["id"] ?? "");
      const gold = goldHealthMap.get(vehicleId);
      if (!gold) return p;
      return {
        ...p,
        health: gold.health_score,
        engine_contrib: gold.engine_contrib,
        transmission_contrib: gold.transmission_contrib,
        battery_contrib: gold.battery_contrib,
        body_contrib: gold.body_contrib,
        tyre_contrib: gold.tyre_contrib,
      };
    });
  }, [fleetPositions, goldHealthMap]);
  const topicCtx: TopicContext = useMemo(
    () => ({
      selectedVehicle: pageSelectedVehicle,
      selectedModule: pageSelectedModule,
      fleetPositions: resolvedFleetPositions,
      fleetSummary,
      connected,
    }),
    [pageSelectedVehicle, pageSelectedModule, resolvedFleetPositions, fleetSummary, connected]
  );
  const resolvedTopics = useMemo(() => {
    if (pageTopics.length) {
      return pageTopics.map((t) =>
        typeof t === "string"
          ? { chipKey: t, display: t, topic: null as AssistantTopic | null }
          : {
              chipKey: t.key,
              display: typeof t.label === "function" ? t.label(topicCtx) : t.label,
              topic: t as AssistantTopic | null,
            }
      );
    }
    return (roleTopics[assistantRole] ?? roleTopics.monitoring).map((label) => ({
      chipKey: label,
      display: label,
      topic: null as AssistantTopic | null,
    }));
  }, [pageTopics, topicCtx, assistantRole]);
  const nextId = useRef(
    initialChatState.messages.length
      ? Math.max(...initialChatState.messages.map((m) => m.id)) + 1
      : 2
  );
  const cancelledRef = useRef(false);
  useEffect(() => () => {
    cancelledRef.current = true;
  }, []);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLDivElement | null>(null);
  const chatPositionRef = useRef<ChatPosition>(chatPosition);
  const viewportSizeRef = useRef({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  });
  const didDragChatRef = useRef(false);
  const embeddedScrollTopRef = useRef(0);
  const chatDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const averageHealth = useMemo(() => {
    const summaryHealth = numberFrom(fleetSummary, ["avg_health", "average_health"]);
    if (summaryHealth !== null) return summaryHealth;
    const positionHealth = (fleetPositions ?? [])
      .map((position) => numberFrom(position, ["health", "health_score"]))
      .filter((value): value is number => value !== null);
    if (positionHealth.length) {
      return positionHealth.reduce((sum, value) => sum + value, 0) / positionHealth.length;
    }
    if (!vehicles.length) return null;
    return (
      vehicles.reduce((sum, vehicle) => sum + Number(vehicle.health_score || 0), 0) /
      vehicles.length
    );
  }, [fleetPositions, fleetSummary, vehicles]);

  const fleetCounts = useMemo(() => {
    const positionsAvailable = Array.isArray(fleetPositions);
    const normalizedType = (position: FleetFooterPosition) =>
      String(
        position.type ??
          position["vehicle_type"] ??
          position["body_type"] ??
          position["category"] ??
          ""
      ).toLowerCase();
    const normalizedStatus = (position: FleetFooterPosition) =>
      String(position.status ?? "").toLowerCase();

    const countType = (matches: string[], summaryKeys: string[]) => {
      const summaryValue = numberFrom(fleetSummary, summaryKeys);
      if (summaryValue !== null) return summaryValue;
      if (!positionsAvailable) return null;
      return fleetPositions.filter((position) =>
        matches.some((match) => normalizedType(position).includes(match))
      ).length;
    };

    const countStatus = (statuses: string[], summaryKeys: string[]) => {
      const summaryValue = numberFrom(fleetSummary, summaryKeys);
      if (summaryValue !== null) return summaryValue;
      if (!positionsAvailable) return null;
      return fleetPositions.filter((position) => statuses.includes(normalizedStatus(position))).length;
    };

    const totalFromSummary = numberFrom(fleetSummary, ["total", "total_vehicles", "vehicle_count"]);
    return {
      total: totalFromSummary ?? (positionsAvailable ? fleetPositions.length : null),
      trucks: countType(["truck", "lorry"], ["trucks", "truck_count", "total_trucks"]),
      vans: countType(["van", "shuttle"], ["vans", "van_count", "total_vans"]),
      active: countStatus(["active", "available", "moving", "online"], [
        "active",
        "active_vehicles",
        "available_vehicles",
      ]),
      parked: countStatus(["parked"], ["parked", "parked_vehicles"]),
      service: countStatus(["in_service", "service", "workshop"], [
        "in_service",
        "service_vehicles",
      ]),
    };
  }, [fleetPositions, fleetSummary]);

  const footerMetrics = useMemo(() => {
    const summaryMinutes = numberFrom(fleetSummary, [
      "downtime_today_minutes",
      "downtime_minutes_today",
      "today_downtime_minutes",
      "total_downtime_today_minutes",
    ]);
    const summaryHours = numberFrom(fleetSummary, [
      "downtime_today_hours",
      "today_downtime_hours",
    ]);

    let downtimeMinutes: number | null = null;
    let downtimeLogic =
      "No downtime duration field is currently returned by the fleet backend. The card will update automatically when the data becomes available.";

    if (summaryMinutes !== null) {
      downtimeMinutes = summaryMinutes;
      downtimeLogic =
        "Backend value: the fleet summary’s downtime-today minutes field, covering the current local calendar day.";
    } else if (summaryHours !== null) {
      downtimeMinutes = summaryHours * 60;
      downtimeLogic =
        "Backend value: the fleet summary’s downtime-today hours field, converted to hours and minutes for display.";
    } else if (fleetPositions?.length) {
      const perVehicleDowntime = fleetPositions
        .map((position) =>
          numberFrom(position, [
            "downtime_today_minutes",
            "downtime_minutes_today",
            "today_downtime_minutes",
          ])
        )
        .filter((value): value is number => value !== null);

      if (perVehicleDowntime.length) {
        downtimeMinutes = perVehicleDowntime.reduce((sum, value) => sum + value, 0);
        downtimeLogic =
          "Calculated from real vehicle data: sum of every vehicle’s backend downtime-today minutes field.";
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const now = Date.now();
        const nonOperationalStatuses = new Set([
          "parked",
          "offline",
          "in_service",
          "service",
          "workshop",
          "breakdown",
        ]);
        const currentDowntime = fleetPositions
          .filter((position) =>
            nonOperationalStatuses.has(String(position.status ?? "").toLowerCase())
          )
          .map((position) => {
            const rawTimestamp =
              position.status_since ??
              String(position["status_since_ts"] ?? position["last_status_change"] ?? "");
            const timestamp = Date.parse(rawTimestamp);
            if (!Number.isFinite(timestamp)) return null;
            return Math.max(0, now - Math.max(timestamp, today.getTime())) / 60000;
          })
          .filter((value): value is number => value !== null);

        if (currentDowntime.length) {
          downtimeMinutes = currentDowntime.reduce((sum, value) => sum + value, 0);
          downtimeLogic =
            "Calculated from real status timestamps: for currently parked, offline, workshop, service, or breakdown vehicles, sum the time since status_since, capped at today 00:00 local time.";
        }
      }
    }

    const summaryDriver = numberFrom(fleetSummary, ["avg_driver_score"]);
    const driverValues = (fleetPositions ?? [])
      .map((position) => numberFrom(position, ["driver_score"]))
      .filter((value): value is number => value !== null);
    const driverScore =
      summaryDriver ??
      (driverValues.length
        ? driverValues.reduce((sum, value) => sum + value, 0) / driverValues.length
        : null);
    const driverLogic =
      summaryDriver !== null
        ? "Backend value: avg_driver_score from the fleet summary. The service aggregates the current driver scores across the monitored fleet."
        : driverValues.length
        ? "Calculated from real position data: arithmetic mean of all vehicles that currently provide driver_score. Vehicles without a score are excluded."
        : "No driver score is currently returned by the fleet backend.";

    const summarySafety = numberFrom(fleetSummary, [
      "avg_safety_score",
      "safety_score",
      "driver_safety_score",
    ]);
    const safetyValues = (fleetPositions ?? [])
      .map((position) =>
        numberFrom(position, ["safety_score", "driver_safety_score"])
      )
      .filter((value): value is number => value !== null);
    const safetyScore =
      summarySafety ??
      (safetyValues.length
        ? safetyValues.reduce((sum, value) => sum + value, 0) / safetyValues.length
        : null);
    const safetyLogic =
      summarySafety !== null
        ? "Backend value: the fleet-level safety score returned by the fleet summary."
        : "Calculated from real position data: arithmetic mean of the available safety_score or driver_safety_score values. Missing scores are excluded.";

    return {
      downtimeMinutes,
      downtimeLogic,
      driverScore,
      driverLogic,
      safetyScore,
      safetyLogic,
    };
  }, [fleetPositions, fleetSummary]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing, open]);

  // Keeps the active chat's saved copy in sync with what's on screen, so
  // reopening it later (or just reloading the page) picks up right where it
  // left off. Runs on every message change — cheap, and simpler than a
  // separate explicit "save" step scattered across every place messages
  // change (ask, askPageTopic, pushAssistantAnswer, session switches).
  useEffect(() => {
    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeSessionId);
    setSessions((current) => {
      const title = deriveSessionTitle(messages);
      const updated: ChatSession = { id: activeSessionId, title, messages, updatedAt: Date.now() };
      const index = current.findIndex((s) => s.id === activeSessionId);
      const next =
        index >= 0
          ? current.map((s, i) => (i === index ? updated : s))
          : [updated, ...current];
      persistSessions(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeSessionId]);

  // `run.py --reset` can't reach into the browser's localStorage on its
  // own — it only kills processes and clears server-side files — so this is
  // the bridge: check once on load whether the backend's reset token has
  // moved past what we last saw, and if so, wipe every saved chat session
  // (including the one currently on screen) rather than leaving stale
  // pre-reset conversations sitting in the browser indefinitely.
  useEffect(() => {
    let cancelled = false;
    axios
      .get(RESET_TOKEN_API)
      .then(({ data }) => {
        if (cancelled) return;
        const remoteToken = String(data?.reset_token ?? "none");
        const seenToken = window.localStorage.getItem(RESET_TOKEN_STORAGE_KEY);
        if (seenToken !== null && seenToken !== remoteToken) {
          persistSessions([]);
          setSessions([]);
          const freshId = makeSessionId();
          window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, freshId);
          setActiveSessionId(freshId);
          setMessages(freshGreeting());
          nextId.current = 2;
        }
        window.localStorage.setItem(RESET_TOKEN_STORAGE_KEY, remoteToken);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    const keepLauncherOnScreen = () => {
      if (!chatPositionRef.current) return;
      const previousViewport = viewportSizeRef.current;
      const rightOffset =
        previousViewport.width - CHAT_LAUNCHER_SIZE - chatPositionRef.current.x;
      const bottomOffset =
        previousViewport.height - CHAT_LAUNCHER_SIZE - chatPositionRef.current.y;
      viewportSizeRef.current = { width: window.innerWidth, height: window.innerHeight };
      const nextPosition = chatPositionFromOffsets({
        right: Math.max(CHAT_VIEWPORT_GAP, rightOffset),
        bottom: Math.max(CHAT_VIEWPORT_GAP, bottomOffset),
      });
      chatPositionRef.current = nextPosition;
      setChatPosition(nextPosition);
      persistChatPosition(nextPosition);
    };

    window.addEventListener("resize", keepLauncherOnScreen);
    return () => window.removeEventListener("resize", keepLauncherOnScreen);
  }, []);

  useEffect(() => {
    const hasScrolledContent = () => {
      const documentScrollTop =
        window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
      if (documentScrollTop > 120 || embeddedScrollTopRef.current > 120) return true;
      const embeddedPageScrolled = Array.from(
        document.querySelectorAll<HTMLIFrameElement>("iframe")
      ).some((frame) => {
        try {
          const frameDocument = frame.contentDocument;
          return (
            Number(frameDocument?.scrollingElement?.scrollTop) > 120 ||
            Number(frameDocument?.documentElement.scrollTop) > 120 ||
            Number(frameDocument?.body.scrollTop) > 120
          );
        } catch {
          return false;
        }
      });
      if (embeddedPageScrolled) return true;
      // Only the page's own designated scroll containers count — not every
      // scrollable descendant of <main>, which previously also matched small
      // internal widgets (e.g. the AI Executive Summary's own scroll box),
      // wrongly showing this button when only a widget was scrolled.
      return Array.from(document.querySelectorAll<HTMLElement>("[data-app-page-scroll]")).some(
        (element) => element.scrollTop > 120
      );
    };

    const refreshVisibility = () => setShowScrollTop(hasScrolledContent());
    const handleEmbeddedScroll = (event: MessageEvent) => {
      if (
        typeof event.data === "object" &&
        event.data !== null &&
        event.data.type === "knowledge:scroll"
      ) {
        embeddedScrollTopRef.current = Number(event.data.scrollTop) || 0;
        refreshVisibility();
      }
    };

    document.addEventListener("scroll", refreshVisibility, true);
    window.addEventListener("scroll", refreshVisibility, { passive: true });
    window.addEventListener("message", handleEmbeddedScroll);
    window.requestAnimationFrame(refreshVisibility);
    const visibilityPoll = window.setInterval(refreshVisibility, 250);

    return () => {
      document.removeEventListener("scroll", refreshVisibility, true);
      window.removeEventListener("scroll", refreshVisibility);
      window.removeEventListener("message", handleEmbeddedScroll);
      window.clearInterval(visibilityPoll);
    };
  }, []);

  const beginChatDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const launcherBounds = launcherRef.current?.getBoundingClientRect();
    if (!launcherBounds) return;
    didDragChatRef.current = false;
    chatDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: launcherBounds.left,
      originY: launcherBounds.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveChat = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = chatDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.hypot(deltaX, deltaY) >= 5) didDragChatRef.current = true;
    if (!didDragChatRef.current) return;
    event.preventDefault();

    const nextPosition = clampChatPosition({
      x: drag.originX + deltaX,
      y: drag.originY + deltaY,
    });
    chatPositionRef.current = nextPosition;
    setChatPosition(nextPosition);
  };

  const finishChatDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = chatDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    chatDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (didDragChatRef.current && chatPositionRef.current) {
      persistChatPosition(chatPositionRef.current);
    }
  };

  const toggleChat = () => {
    if (didDragChatRef.current) {
      didDragChatRef.current = false;
      return;
    }
    setOpen((value) => !value);
  };

  const scrollToPageTop = () => {
    const scrollOptions: ScrollToOptions = { top: 0, left: 0, behavior: "smooth" };
    window.scrollTo(scrollOptions);
    document.querySelectorAll<HTMLElement>("[data-app-page-scroll]").forEach((element) => {
      if (element.scrollTop > 0) element.scrollTo(scrollOptions);
    });
    document.querySelectorAll<HTMLIFrameElement>("iframe").forEach((frame) => {
      try {
        frame.contentWindow?.scrollTo(scrollOptions);
        frame.contentWindow?.postMessage("scroll:top", "*");
      } catch {
        frame.contentWindow?.postMessage("scroll:top", "*");
      }
    });
  };

  const answerFor = (question: string): string | KnowledgeRepoAnswer => {
    const normalized = question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const unavailable =
      "That value is not available from the fleet backend right now. I’ll calculate it automatically when live data is returned.";

    const dtcAnswer = answerDtcQuestion(question);
    if (dtcAnswer) return dtcAnswer;

    const knowledgeAnswer = answerKnowledgeRepoQuestion(question);
    if (knowledgeAnswer) return knowledgeAnswer;

    if (normalized.includes("driver") && normalized.includes("score")) {
      return footerMetrics.driverScore !== null
        ? `The overall driver score is ${footerMetrics.driverScore.toFixed(1)}/100. It is calculated from the backend fleet average, or from the mean of available vehicle driver scores when the fleet average is not supplied.`
        : unavailable;
    }
    if (
      normalized.includes("fleet composition") ||
      normalized.includes("vehicle mix")
    ) {
      const truckText =
        fleetCounts.trucks !== null ? `${fleetCounts.trucks} trucks` : "truck count unavailable";
      const vanText =
        fleetCounts.vans !== null ? `${fleetCounts.vans} vans` : "van count unavailable";
      return `The current backend fleet composition is ${truckText} and ${vanText}, across ${
        fleetCounts.total ?? "an unavailable number of"
      } total vehicles.`;
    }
    if (
      normalized.includes("backend data") ||
      normalized.includes("data availability")
    ) {
      if (!fleetSummaryError && !fleetPositionsError && connected) {
        return "Fleet summary, vehicle-position, and live-stream data are currently available from the backend.";
      }
      const unavailableSources = [
        fleetSummaryError ? "fleet summary" : null,
        fleetPositionsError ? "vehicle positions" : null,
        !connected ? "live telemetry stream" : null,
      ].filter(Boolean);
      return `Backend availability is degraded for: ${unavailableSources.join(", ")}. The assistant will use the remaining live sources until recovery.`;
    }
    if (normalized.includes("downtime") || normalized.includes("down time")) {
      return footerMetrics.downtimeMinutes !== null
        ? `Today’s fleet downtime is ${formatMinutes(footerMetrics.downtimeMinutes)}. The calculation uses the backend’s today value when supplied; otherwise it totals available vehicle downtime or today’s non-operational status durations.`
        : unavailable;
    }
    if (normalized.includes("truck") || normalized.includes("lorry")) {
      return fleetCounts.trucks !== null
        ? `${fleetCounts.trucks} ${fleetCounts.trucks === 1 ? "truck is" : "trucks are"} available in the current backend fleet snapshot.`
        : unavailable;
    }
    if (normalized.includes("van") || normalized.includes("shuttle")) {
      return fleetCounts.vans !== null
        ? `${fleetCounts.vans} ${fleetCounts.vans === 1 ? "van is" : "vans are"} available in the current backend fleet snapshot.`
        : unavailable;
    }
    if (normalized.includes("safety") && normalized.includes("score")) {
      // There is no distinct "safety_score" field anywhere in the backend —
      // driver_score already IS the safety-behavior metric (built from harsh
      // braking/accel/cornering rates upstream), so treat them as the same
      // real number instead of returning a "not provided" dead-end.
      const scored = (fleetPositions ?? [])
        .map((p) => ({ id: String(p.vehicle_id ?? p["id"] ?? ""), driver: String(p.driver ?? "Unassigned"), score: Number(p.driver_score) }))
        .filter((p) => Number.isFinite(p.score));
      if (!scored.length) return unavailable;
      const avg = scored.reduce((s, p) => s + p.score, 0) / scored.length;
      const worst = [...scored].sort((a, b) => a.score - b.score)[0];
      const best = [...scored].sort((a, b) => b.score - a.score)[0];
      const atRisk = scored.filter((p) => p.score < 70).length;
      const read = avg >= 85 ? "strong — above the 85 threshold we treat as safe" : avg >= 70 ? "acceptable but worth watching" : "a genuine concern";
      return `Fleet safety score (from driver behavior — harsh braking, acceleration and cornering rates) is ${avg.toFixed(1)}/100, which is ${read}. ${worst.driver} (${worst.id}) is the outlier at ${worst.score}/100${atRisk > 1 ? `, and ${atRisk} drivers overall are below the 70 safety threshold` : ""}; ${best.driver} (${best.id}) is the benchmark at ${best.score}/100. Recommend a coaching session with ${worst.driver} focused on the specific harsh-event pattern before their next long route.`;
    }
    if (normalized.includes("parked")) {
      return fleetCounts.parked !== null
        ? `${fleetCounts.parked} ${fleetCounts.parked === 1 ? "vehicle is" : "vehicles are"} currently parked.`
        : unavailable;
    }
    if (normalized.includes("service") || normalized.includes("workshop")) {
      return fleetCounts.service !== null
        ? `${fleetCounts.service} ${fleetCounts.service === 1 ? "vehicle is" : "vehicles are"} currently in service or the workshop.`
        : unavailable;
    }
    if (normalized.includes("active") || normalized.includes("available vehicle")) {
      return fleetCounts.active !== null
        ? `${fleetCounts.active} ${fleetCounts.active === 1 ? "vehicle is" : "vehicles are"} active in the current backend snapshot.`
        : unavailable;
    }
    if (
      normalized.includes("total") ||
      normalized.includes("fleet size") ||
      normalized.includes("how many vehicles")
    ) {
      return fleetCounts.total !== null
        ? `The backend currently reports ${fleetCounts.total} ${fleetCounts.total === 1 ? "vehicle" : "vehicles"} in the fleet.`
        : unavailable;
    }
    if (normalized.includes("health")) {
      return averageHealth !== null
        ? `The fleet’s average health score is ${averageHealth.toFixed(1)}%, calculated from the backend fleet summary or available vehicle health scores.`
        : unavailable;
    }
    if (normalized.includes("alert") || normalized.includes("warning")) {
      return activeAlertCount > 0
        ? `There ${activeAlertCount === 1 ? "is" : "are"} ${activeAlertCount} active ${activeAlertCount === 1 ? "alert" : "alerts"}. Use the notification bell for details.`
        : "There are no active alerts in the current dashboard snapshot.";
    }
    if (
      normalized.includes("connected") ||
      normalized.includes("live data") ||
      normalized.includes("stream")
    ) {
      return connected
        ? "Yes. The live vehicle stream is connected and dashboard data is updating automatically."
        : "The live stream is currently reconnecting. The dashboard will resume updates automatically when the service is available.";
    }
    if (normalized.includes("role") || normalized.includes("workspace")) {
      return `You are currently using the ${currentRoleLabel} workspace.`;
    }

    if (fleetSummaryError || fleetPositionsError) {
      return "I couldn’t match that question, and part of the fleet backend is currently unavailable. Try asking about driver score, today’s downtime, trucks, vans, active vehicles, parked vehicles, fleet health, safety score, or alerts.";
    }
    return "I can answer fleet questions about driver score, today’s downtime, trucks, vans, total or active vehicles, parked or service vehicles, fleet health, safety score, alerts, and live-stream status.";
  };

  const minDelay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  // Runs a page-aware topic: resolves its data fetch (shared across repeat
  // questions via the query cache, so a suggested chip clicked twice in a
  // row doesn't re-hit the backend) then formats the answer from real data.
  const runTopic = async (
    topic: AssistantTopic,
    ctx: TopicContext
  ): Promise<string> => {
    if (topic.requiresVehicle && !ctx.selectedVehicle) return NO_VEHICLE_MSG;
    try {
      const data: Record<string, any> = {};
      if (topic.fetches) {
        const specs = topic.fetches(ctx);
        const results = await Promise.all(
          specs.map((spec) =>
            queryClient.fetchQuery({
              queryKey: ["chat-topic", spec.url, JSON.stringify(spec.params ?? {})],
              queryFn: () => axios.get(spec.url, { params: spec.params }).then((r) => r.data),
              staleTime: 120000,
              gcTime: 600000,
            })
          )
        );
        specs.forEach((spec, i) => {
          data[spec.key] = results[i];
        });
      }
      return topic.respond(data, ctx);
    } catch {
      return "I couldn't reach the backend for that just now — try again in a moment.";
    }
  };

  const resolveAnswer = async (
    question: string
  ): Promise<string | KnowledgeRepoAnswer | ExecutiveQuestionAnswer> => {
    const normalized = question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const executiveIntent = matchExecutiveFleetQuestion(question);
    if (executiveIntent) {
      const cachedAlerts = queryClient.getQueryData<any>(["layout-alert-notifications"]);
      return buildExecutiveFleetAnswer(executiveIntent, {
        positions: resolvedFleetPositions ?? [],
        fleetSummary,
        alerts: cachedAlerts ?? {
          open_alerts: Array.from({ length: activeAlertCount }, () => ({
            severity: "open",
          })),
        },
      });
    }
    // Current page's own topics win first — a bare "full briefing" should
    // mean *this* page's briefing, not whichever other page's topic happens
    // to share the same generic trigger words. Only once nothing local
    // matches do we search every topic on every page/role, so a distinctly-
    // worded question (a DTC code, "recent trips", "workshop queue", etc.)
    // still resolves correctly no matter where you're standing.
    const localMatch = pageTopics.find(
      (t): t is AssistantTopic => typeof t !== "string" && t.match(normalized)
    );
    if (localMatch) return runTopic(localMatch, topicCtx);
    const globalMatch = ALL_TOPICS.find((t) => t.match(normalized));
    if (globalMatch) return runTopic(globalMatch, topicCtx);
    return answerFor(question);
  };

  const pushAssistantAnswer = (answer: string | KnowledgeRepoAnswer | ExecutiveQuestionAnswer) => {
    if (cancelledRef.current) return;
    setMessages((current) => [
      ...current,
      {
        id: nextId.current++,
        role: "assistant",
        text: typeof answer === "string" ? answer : answer.text,
        knowledgeSection:
          typeof answer === "string" || !("section" in answer) ? undefined : answer.section,
        detailTitle:
          typeof answer === "string" || !("details" in answer) ? undefined : answer.title,
        detailText:
          typeof answer === "string" || !("details" in answer) ? undefined : answer.details,
        detailIntentId:
          typeof answer === "string" || !("intentId" in answer) ? undefined : answer.intentId,
      },
    ]);
    setTyping(false);
  };

  const ask = (question: string) => {
    const cleanQuestion = question.trim();
    if (typing || !cleanQuestion) return;
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: "user", text: cleanQuestion },
    ]);
    setQuestionInput("");
    setTyping(true);

    const delay = 1200 + Math.floor(Math.random() * 1000);
    Promise.all([resolveAnswer(cleanQuestion), minDelay(delay)]).then(([answer]) =>
      pushAssistantAnswer(answer)
    );
  };

  const askPageTopic = (topic: AssistantTopic, displayLabel: string) => {
    if (typing) return;
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: "user", text: displayLabel },
    ]);
    setTyping(true);

    const delay = 1200 + Math.floor(Math.random() * 1000);
    Promise.all([runTopic(topic, topicCtx), minDelay(delay)]).then(([answer]) =>
      pushAssistantAnswer(answer)
    );
  };

  const openExecutiveDetails = async (message: Message) => {
    if (!message.detailIntentId) {
      setDetailAnswer({
        title: message.detailTitle ?? "Fleet Details",
        text: message.detailText ?? "No additional details are available.",
      });
      return;
    }

    const intent = executiveQuestionIntentById(message.detailIntentId);
    if (!intent) return;
    setDetailAnswer({
      title: message.detailTitle ?? intent.title,
      text: message.detailText ?? "",
    });
    setDetailLoading(true);

    const alertIntents = new Set([
      "urgent_alerts",
      "alert_trend",
      "business_impact",
      "actions",
      "summary",
    ]);
    const automotiveIntents = new Set([
      "health_cause",
      "lowest",
      "failure_forecast",
      "maintenance_due",
      "failure_categories",
      "summary",
    ]);
    const dtcIntents = new Set(["health_cause", "failure_categories", "summary"]);

    const fetchDetail = async (key: string, url: string) => {
      try {
        return await queryClient.fetchQuery({
          queryKey: ["executive-chat-detail", key],
          queryFn: () => axios.get(url).then((response) => response.data),
          staleTime: 120000,
          gcTime: 600000,
        });
      } catch {
        return undefined;
      }
    };

    const [alerts, automotiveSummary, dtcDistribution] = await Promise.all([
      alertIntents.has(intent.id)
        ? fetchDetail("alerts", "http://127.0.0.1:8005/api/alerts/metrics")
        : Promise.resolve(undefined),
      automotiveIntents.has(intent.id)
        ? fetchDetail("automotive-summary", "http://127.0.0.1:8005/api/automotive/fleet-summary")
        : Promise.resolve(undefined),
      dtcIntents.has(intent.id)
        ? fetchDetail(
            "dtc-distribution",
            "http://127.0.0.1:8005/api/automotive/dtc/fleet-distribution"
          )
        : Promise.resolve(undefined),
    ]);

    if (cancelledRef.current) return;
    const detailed = buildExecutiveFleetAnswer(intent, {
      positions: resolvedFleetPositions ?? [],
      fleetSummary,
      alerts: alerts ?? queryClient.getQueryData(["layout-alert-notifications"]),
      automotiveSummary,
      dtcDistribution,
    });
    setDetailAnswer({ title: detailed.title, text: detailed.details });
    setDetailLoading(false);
  };

  // Switching sessions or starting a new one while an answer is still in
  // flight would let that pending answer land in whichever session happens
  // to be active by the time it resolves — the hamburger button and its menu
  // items are disabled while typing (below) so this can't actually happen,
  // but these still guard defensively since they're plain functions, not
  // disabled JSX themselves.
  const startNewChat = () => {
    if (typing) return;
    const freshId = makeSessionId();
    nextId.current = 2;
    setActiveSessionId(freshId);
    setMessages(freshGreeting());
    setHistoryAnchorEl(null);
  };

  const openSession = (session: ChatSession) => {
    if (typing) return;
    setActiveSessionId(session.id);
    setMessages(session.messages);
    nextId.current = session.messages.length
      ? Math.max(...session.messages.map((m) => m.id)) + 1
      : 2;
    setHistoryAnchorEl(null);
  };

  const deleteSession = (id: string, event: ReactMouseEvent) => {
    event.stopPropagation();
    const remaining = sessions.filter((s) => s.id !== id);
    persistSessions(remaining);
    setSessions(remaining);
    if (id !== activeSessionId) return;
    if (remaining.length) {
      openSession([...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0]);
    } else {
      startNewChat();
    }
  };

  const orderedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions]
  );

  const dark = theme.palette.mode === "dark";
  const accent = dark ? "#38bdf8" : "#005071";

  return (
    <>
      <Box
        ref={launcherRef}
        component="aside"
        aria-label="Fleet assistant launcher"
        data-testid="fleet-status-bar"
        sx={{
          position: "fixed",
          left: chatPosition.x,
          top: chatPosition.y,
          right: "auto",
          bottom: "auto",
          width: 50,
          height: 50,
          zIndex: (muiTheme) => muiTheme.zIndex.modal - 1,
          pointerEvents: "auto",
          border: 0,
          background: "transparent",
        }}
      >
        <Box
          aria-label="Live fleet status"
          sx={{
            position: "absolute",
            left: { xs: 12, sm: 20 },
            right: { xs: 76, sm: 92 },
            top: 0,
            bottom: 0,
            display: "none",
            alignItems: "center",
            gap: { xs: 0.7, sm: 0.9, lg: 1.1 },
            minWidth: 0,
            overflow: "hidden",
            pointerEvents: "auto",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.8,
              minWidth: { xs: 94, sm: 120 },
              flex: { xs: "1 1 auto", sm: "1.25 1 0" },
              height: 44,
              px: { xs: 1, sm: 1.35 },
              borderRadius: 1.6,
              bgcolor: dark ? "rgba(56,189,248,.07)" : "rgba(255,255,255,.56)",
              border: `1px solid ${
                dark ? "rgba(56,189,248,.15)" : "rgba(0,80,113,.14)"
              }`,
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: connected ? "#22c55e" : "#f59e0b",
                boxShadow: connected
                  ? "0 0 10px rgba(34,197,94,.72)"
                  : "0 0 10px rgba(245,158,11,.62)",
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: 9,
                  lineHeight: 1.1,
                  color: "text.secondary",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                }}
              >
                Fleet stream
              </Typography>
              <Typography sx={{ fontSize: 11, lineHeight: 1.3, fontWeight: 800 }} noWrap>
                {connected ? "Live updates" : "Reconnecting"}
              </Typography>
            </Box>
          </Box>

          {[
            {
              label: "Downtime (Today)",
              value:
                footerMetrics.downtimeMinutes !== null
                  ? formatMinutes(footerMetrics.downtimeMinutes)
                  : "No data",
              logic: footerMetrics.downtimeLogic,
              hideOnXs: false,
            },
            {
              label: "Overall Driver Score",
              value:
                footerMetrics.driverScore !== null
                  ? `${footerMetrics.driverScore.toFixed(1)}/100`
                  : "No data",
              logic: footerMetrics.driverLogic,
              hideOnXs: true,
            },
            ...(footerMetrics.safetyScore !== null
              ? [
                  {
                    label: "Safety Score",
                    value: `${footerMetrics.safetyScore.toFixed(1)}/100`,
                    logic: footerMetrics.safetyLogic,
                    hideOnXs: true,
                  },
                ]
              : []),
            {
              label: "Workspace",
              value: currentRoleLabel,
              logic:
                "The active role workspace controls which dashboard views and navigation tabs are available.",
              hideOnXs: true,
            },
          ].map((item) => (
            <Box
              key={item.label}
              sx={{
                display: item.hideOnXs ? { xs: "none", sm: "block" } : "block",
                px: { xs: 1, sm: 1.35 },
                py: 0.65,
                height: 44,
                boxSizing: "border-box",
                minWidth: { sm: 92 },
                flex: "1 1 0",
                borderRadius: 1.6,
                bgcolor: dark ? "rgba(56,189,248,.07)" : "rgba(255,255,255,.56)",
                border: `1px solid ${
                  dark ? "rgba(56,189,248,.15)" : "rgba(0,80,113,.14)"
                }`,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.45, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 9,
                    lineHeight: 1.1,
                    color: "text.secondary",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                  }}
                  noWrap
                >
                  {item.label}
                </Typography>
                <Tooltip title={item.logic} arrow placement="top">
                  <InfoOutlinedIcon
                    tabIndex={0}
                    aria-label={`${item.label} calculation logic`}
                    sx={{
                      fontSize: 12.5,
                      color: dark ? "#7dd3fc" : "#005071",
                      flexShrink: 0,
                      cursor: "help",
                    }}
                  />
                </Tooltip>
              </Box>
              <Typography sx={{ fontSize: 11.5, lineHeight: 1.35, fontWeight: 850 }} noWrap>
                {item.value}
              </Typography>
            </Box>
          ))}
        </Box>

        <Fab
          data-testid="fleet-chat-button"
          aria-label={open ? "Close fleet assistant" : "Open fleet assistant"}
          aria-description="Drag to reposition. Click to open or close."
          title="Drag to reposition · Click to open"
          onClick={toggleChat}
          onPointerDown={beginChatDrag}
          onPointerMove={moveChat}
          onPointerUp={finishChatDrag}
          onPointerCancel={finishChatDrag}
          disableRipple
          disableFocusRipple
          size="medium"
          sx={{
            pointerEvents: "auto",
            position: "absolute",
            right: 0,
            top: 0,
            transform: "none",
            width: 48,
            height: 48,
            color: "#fff",
            bgcolor: accent,
            opacity: open ? 1 : 0.58,
            cursor: chatDragRef.current ? "grabbing" : "grab",
            touchAction: "none",
            userSelect: "none",
            transition: "opacity .18s ease, transform .18s ease, box-shadow .18s ease",
            boxShadow: dark
              ? "0 8px 24px rgba(0,0,0,.34), 0 0 16px rgba(56,189,248,.26)"
              : "0 8px 22px rgba(15,47,69,.22), 0 0 14px rgba(0,80,113,.2)",
            "&:hover, &:focus-visible": {
              opacity: 1,
              transform: "scale(1.04)",
              bgcolor: dark ? "#0ea5e9" : "#003e59",
            },
          }}
        >
          {open ? <CloseRoundedIcon /> : <ChatBubbleRoundedIcon />}
        </Fab>

        {showScrollTop && (
          <Tooltip title="Scroll to top" placement="top" arrow>
            <Fab
              data-testid="scroll-to-top-button"
              aria-label="Scroll to top"
              onClick={scrollToPageTop}
              size="small"
              sx={{
                pointerEvents: "auto",
                position: "absolute",
                top: 7,
                ...(chatPosition && chatPosition.x < 66 ? { left: 56 } : { right: 56 }),
                width: 34,
                height: 34,
                minHeight: 34,
                color: "#fff",
                bgcolor: accent,
                opacity: 0.9,
                border: `1px solid ${alpha("#ffffff", 0.22)}`,
                boxShadow: dark
                  ? "0 7px 20px rgba(0,0,0,.3), 0 0 12px rgba(56,189,248,.2)"
                  : "0 7px 18px rgba(15,47,69,.18), 0 0 10px rgba(0,80,113,.14)",
                animation: "scroll-top-enter .18s ease-out",
                "@keyframes scroll-top-enter": {
                  from: { opacity: 0, transform: "translateY(6px) scale(.92)" },
                  to: { opacity: 0.9, transform: "translateY(0) scale(1)" },
                },
                transition: "opacity .18s ease, transform .18s ease",
                "&:hover, &:focus-visible": {
                  opacity: 1,
                  transform: "translateY(-2px)",
                  bgcolor: dark ? "#0ea5e9" : "#003e59",
                },
              }}
            >
              <KeyboardArrowUpRoundedIcon sx={{ fontSize: 20 }} />
            </Fab>
          </Tooltip>
        )}
      </Box>

      {open && (
        <Paper
          role="dialog"
          aria-label="Fleet Assistant chat"
          elevation={18}
          sx={{
            position: "fixed",
            zIndex: (muiTheme) => muiTheme.zIndex.modal,
            right: { xs: 10, sm: 22 },
            bottom: { xs: 148, sm: 150 },
            width: { xs: "calc(100vw - 20px)", sm: 370 },
            height: {
              xs: "min(560px, calc(100vh - 172px))",
              sm: "min(560px, calc(100vh - 174px))",
            },
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: 3,
            border: `1px solid ${alpha(accent, dark ? 0.28 : 0.2)}`,
            bgcolor: dark ? "#0b1422" : "#ffffff",
            boxShadow: dark
              ? "0 24px 70px rgba(0,0,0,.55), 0 0 30px rgba(56,189,248,.12)"
              : "0 24px 65px rgba(30,41,59,.22), 0 0 24px rgba(240,90,36,.10)",
          }}
        >
          <Box
            sx={{
              px: 2,
              py: 1.5,
              display: "flex",
              alignItems: "center",
              gap: 1.2,
              color: "#fff",
              background: dark
                ? "linear-gradient(135deg, #0c4a6e, #0369a1)"
                : "linear-gradient(135deg, #005071, #0b7fab)",
            }}
          >
            <IconButton
              aria-label="Chat history"
              aria-haspopup="menu"
              aria-expanded={Boolean(historyAnchorEl)}
              onClick={(event) => setHistoryAnchorEl(event.currentTarget)}
              disabled={typing}
              size="small"
              sx={{ color: "inherit" }}
            >
              <MenuRoundedIcon fontSize="small" />
            </IconButton>
            <Menu
              anchorEl={historyAnchorEl}
              open={Boolean(historyAnchorEl)}
              onClose={() => setHistoryAnchorEl(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
              transformOrigin={{ vertical: "top", horizontal: "left" }}
              slotProps={{ paper: { sx: { width: 260, maxHeight: 360 } } }}
            >
              <MenuItem onClick={startNewChat} sx={{ gap: 1 }}>
                <AddCommentRoundedIcon sx={{ fontSize: 18, color: accent }} />
                <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>New chat</Typography>
              </MenuItem>
              <Divider />
              {orderedSessions.length ? (
                orderedSessions.map((session) => (
                  <MenuItem
                    key={session.id}
                    onClick={() => openSession(session)}
                    selected={session.id === activeSessionId}
                    sx={{ display: "flex", alignItems: "center", gap: 1 }}
                  >
                    <Typography
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 12,
                        fontWeight: session.id === activeSessionId ? 800 : 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {session.title}
                    </Typography>
                    <IconButton
                      aria-label={`Delete chat: ${session.title}`}
                      size="small"
                      onClick={(event) => deleteSession(session.id, event)}
                      sx={{ p: 0.4, color: "text.secondary", "&:hover": { color: "#ef4444" } }}
                    >
                      <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </MenuItem>
                ))
              ) : (
                <MenuItem disabled sx={{ fontSize: 12, fontStyle: "italic" }}>
                  No previous chats yet
                </MenuItem>
              )}
            </Menu>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                bgcolor: "rgba(255,255,255,.16)",
                border: "1px solid rgba(255,255,255,.25)",
                flexShrink: 0,
              }}
            >
              <SmartToyRoundedIcon fontSize="small" />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 800 }}>
                Fleet Assistant
              </Typography>
              <Typography sx={{ fontSize: 10.5, opacity: 0.86 }}>
                {connected ? "Live fleet data connected" : "Dashboard assistant"}
              </Typography>
            </Box>
            <IconButton
              aria-label="Close fleet assistant"
              onClick={() => setOpen(false)}
              size="small"
              sx={{ color: "inherit" }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ flex: 1, overflowY: "auto", p: 1.5 }}>
            <Stack spacing={1.1}>
              {messages.map((message) => (
                <Box
                  key={message.id}
                  sx={{
                    alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "84%",
                    px: 1.25,
                    py: 0.9,
                    borderRadius:
                      message.role === "user" ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
                    color:
                      message.role === "user"
                        ? "#fff"
                        : theme.palette.text.primary,
                    bgcolor:
                      message.role === "user"
                        ? accent
                        : dark
                        ? "rgba(148,163,184,.10)"
                        : "#f1f5f9",
                    border:
                      message.role === "assistant"
                        ? `1px solid ${dark ? "rgba(148,163,184,.12)" : "#e2e8f0"}`
                        : "none",
                  }}
                >
                  <Typography sx={{ fontSize: 11.5, lineHeight: 1.48, whiteSpace: "pre-line" }}>
                    {message.text}
                  </Typography>
                  {message.knowledgeSection && (
                    <Button
                      size="small"
                      startIcon={<MenuBookRoundedIcon sx={{ fontSize: "14px !important" }} />}
                      onClick={() =>
                        navigate(
                          `/knowledge-repo?section=${encodeURIComponent(message.knowledgeSection!)}`
                        )
                      }
                      sx={{
                        mt: 0.55,
                        p: 0,
                        minWidth: 0,
                        color: accent,
                        fontSize: 10.5,
                        fontWeight: 800,
                        lineHeight: 1.35,
                        textTransform: "none",
                        justifyContent: "flex-start",
                        "&:hover": { bgcolor: "transparent", textDecoration: "underline" },
                      }}
                    >
                      For more information, click here
                    </Button>
                  )}
                  {message.detailText && (
                    <Button
                      size="small"
                      startIcon={<VisibilityOutlinedIcon sx={{ fontSize: "14px !important" }} />}
                      onClick={() => openExecutiveDetails(message)}
                      sx={{
                        mt: 0.6,
                        p: 0,
                        minWidth: 0,
                        color: accent,
                        fontSize: 10.5,
                        fontWeight: 850,
                        lineHeight: 1.35,
                        textTransform: "none",
                        justifyContent: "flex-start",
                        "&:hover": { bgcolor: "transparent", textDecoration: "underline" },
                      }}
                    >
                      View details
                    </Button>
                  )}
                </Box>
              ))}
              {typing && (
                <Box
                  aria-label="Fleet Assistant is typing"
                  sx={{
                    alignSelf: "flex-start",
                    display: "flex",
                    gap: 0.5,
                    px: 1.3,
                    py: 1.15,
                    borderRadius: "14px 14px 14px 3px",
                    bgcolor: dark ? "rgba(148,163,184,.10)" : "#f1f5f9",
                  }}
                >
                  {[0, 1, 2].map((dot) => (
                    <Box
                      key={dot}
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        bgcolor: accent,
                        animation: "typing-dot 1s ease-in-out infinite",
                        animationDelay: `${dot * 160}ms`,
                        "@keyframes typing-dot": {
                          "0%, 60%, 100%": { transform: "translateY(0)", opacity: 0.4 },
                          "30%": { transform: "translateY(-4px)", opacity: 1 },
                        },
                      }}
                    />
                  ))}
                </Box>
              )}
              <Box ref={messageEndRef} />
            </Stack>
          </Box>

          <Box
            sx={{
              px: 1.4,
              py: 1.2,
              borderTop: `1px solid ${theme.palette.divider}`,
              bgcolor: dark ? "rgba(15,23,42,.68)" : "#fafafa",
            }}
          >
            <Typography
              sx={{
                fontSize: 9.5,
                color: "text.secondary",
                fontWeight: 700,
                mb: 0.75,
                textTransform: "uppercase",
                letterSpacing: ".06em",
              }}
            >
              Suggested topics
            </Typography>
            <Stack
              direction="row"
              useFlexGap
              flexWrap="wrap"
              gap={0.65}
            >
              {resolvedTopics.map((item) => (
                <Chip
                  key={item.chipKey}
                  label={item.display}
                  onClick={() => (item.topic ? askPageTopic(item.topic, item.display) : ask(item.display))}
                  disabled={typing}
                  size="small"
                  sx={{
                    height: 25,
                    fontSize: 9.8,
                    fontWeight: 650,
                    border: `1px solid ${alpha(accent, 0.3)}`,
                    bgcolor: alpha(accent, dark ? 0.1 : 0.06),
                    "&:hover": { bgcolor: alpha(accent, dark ? 0.2 : 0.12) },
                  }}
                />
              ))}
            </Stack>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 1 }}>
              <TextField
                value={questionInput}
                onChange={(event) => setQuestionInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    ask(questionInput);
                  }
                }}
                disabled={typing}
                placeholder="Ask about your fleet…"
                aria-label="Ask the Fleet Assistant a question"
                size="small"
                fullWidth
                autoComplete="off"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    height: 36,
                    borderRadius: 2,
                    fontSize: 11.5,
                    bgcolor: dark ? "rgba(15,23,42,.62)" : "#fff",
                    "&.Mui-focused fieldset": { borderColor: accent },
                  },
                }}
              />
              <IconButton
                aria-label="Send fleet question"
                onClick={() => ask(questionInput)}
                disabled={typing || !questionInput.trim()}
                sx={{
                  width: 36,
                  height: 36,
                  flexShrink: 0,
                  color: "#fff",
                  bgcolor: accent,
                  "&:hover": { bgcolor: dark ? "#0ea5e9" : "#003e59" },
                  "&.Mui-disabled": {
                    color: alpha("#fff", 0.7),
                    bgcolor: alpha(accent, 0.42),
                  },
                }}
              >
                <SendRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
          </Box>
        </Paper>
      )}
      <Dialog
        open={Boolean(detailAnswer)}
        onClose={() => setDetailAnswer(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            pb: 1,
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 16, fontWeight: 900 }}>{detailAnswer?.title}</Typography>
            <Typography sx={{ mt: 0.2, fontSize: 10.5, color: "text.secondary" }}>
              Live backend-derived fleet explanation
            </Typography>
          </Box>
          <IconButton
            size="small"
            aria-label="Close fleet details"
            onClick={() => setDetailAnswer(null)}
          >
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {detailLoading && (
            <Typography sx={{ mb: 1, fontSize: 10.5, fontWeight: 800, color: accent }}>
              Loading the latest supporting data…
            </Typography>
          )}
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha(accent, dark ? 0.07 : 0.035),
              borderColor: alpha(accent, 0.18),
            }}
          >
            <Typography
              sx={{
                fontSize: 12,
                lineHeight: 1.65,
                color: "text.secondary",
                whiteSpace: "pre-line",
              }}
            >
              {detailAnswer?.text || "Preparing fleet details…"}
            </Typography>
          </Paper>
        </DialogContent>
      </Dialog>
    </>
  );
}
