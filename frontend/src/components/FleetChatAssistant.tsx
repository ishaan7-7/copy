import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Box,
  Chip,
  Fab,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ChatBubbleRoundedIcon from "@mui/icons-material/ChatBubbleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import { alpha, useTheme } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import Draggable from "react-draggable";
import { useGoldStream } from "../contexts/GoldStreamContext";

const FLEET_API = "http://127.0.0.1:8009/api/fleet";
const CHAT_POSITION_KEY = "telemetrix-fleet-chat-position";
const CHAT_LAUNCHER_SIZE = 50;
const CHAT_VIEWPORT_GAP = 8;

type ChatPosition = {
  x: number;
  y: number;
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
};

type FleetChatAssistantProps = {
  activeAlertCount: number;
  currentRoleLabel: string;
};

const topics = [
  "What is the overall driver score?",
  "What is today's downtime?",
  "How many trucks are available?",
  "How many vans are available?",
  "How many vehicles are active?",
  "How many vehicles are parked?",
  "How is fleet health?",
  "Are there open alerts?",
];

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
  const theme = useTheme();
  const { vehicles, connected } = useGoldStream();
  const { data: fleetSummary, isError: fleetSummaryError } = useQuery<FleetFooterSummary>({
    queryKey: ["fleet-summary"],
    queryFn: () => axios.get(`${FLEET_API}/summary`).then((response) => response.data),
    retry: 1,
    refetchInterval: 10000,
  });
  const { data: fleetPositions, isError: fleetPositionsError } = useQuery<FleetFooterPosition[]>({
    queryKey: ["fleet-positions"],
    queryFn: () => axios.get(`${FLEET_API}/positions`).then((response) => response.data),
    retry: 1,
    refetchInterval: 10000,
  });
  const [open, setOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [chatPosition, setChatPosition] = useState<ChatPosition>(() => {
    if (typeof window === "undefined") return { x: 20, y: 80 };
    try {
      const savedPosition = window.localStorage.getItem(CHAT_POSITION_KEY);
      return savedPosition
        ? clampChatPosition(JSON.parse(savedPosition) as ChatPosition)
        : clampChatPosition({
            x: window.innerWidth - CHAT_LAUNCHER_SIZE - 20,
            y: window.innerHeight - CHAT_LAUNCHER_SIZE - 78,
          });
    } catch {
      return clampChatPosition({
        x: window.innerWidth - CHAT_LAUNCHER_SIZE - 20,
        y: window.innerHeight - CHAT_LAUNCHER_SIZE - 78,
      });
    }
  });
  const [typing, setTyping] = useState(false);
  const [questionInput, setQuestionInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      text: "Hi! I’m the Fleet Assistant. Choose a topic or type a fleet question. My answers use the latest backend data.",
    },
  ]);
  const nextId = useRef(2);
  const responseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLDivElement | null>(null);
  const chatPositionRef = useRef<ChatPosition>(chatPosition);
  const didDragChatRef = useRef(false);
  const embeddedScrollTopRef = useRef(0);
  const chatDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const chatMouseDragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const chatNativeDragRef = useRef<{
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

  useEffect(
    () => () => {
      if (responseTimer.current) clearTimeout(responseTimer.current);
    },
    []
  );

  useEffect(() => {
    const keepLauncherOnScreen = () => {
      if (!chatPositionRef.current) return;
      const nextPosition = clampChatPosition(chatPositionRef.current);
      chatPositionRef.current = nextPosition;
      setChatPosition(nextPosition);
      window.localStorage.setItem(CHAT_POSITION_KEY, JSON.stringify(nextPosition));
    };

    window.addEventListener("resize", keepLauncherOnScreen);
    return () => window.removeEventListener("resize", keepLauncherOnScreen);
  }, []);

  const beginNativeChatDrag = (event: ReactDragEvent<HTMLButtonElement>) => {
    const launcherBounds = launcherRef.current?.getBoundingClientRect();
    if (!launcherBounds) return;
    didDragChatRef.current = false;
    chatNativeDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: launcherBounds.left,
      originY: launcherBounds.top,
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "fleet-chat-launcher");
    event.dataTransfer.setDragImage(event.currentTarget, 24, 24);
  };

  const moveNativeChatDrag = (event: ReactDragEvent<HTMLButtonElement>) => {
    const drag = chatNativeDragRef.current;
    if (!drag || (event.clientX === 0 && event.clientY === 0)) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.hypot(deltaX, deltaY) >= 5) didDragChatRef.current = true;
    if (!didDragChatRef.current) return;

    const nextPosition = clampChatPosition({
      x: drag.originX + deltaX,
      y: drag.originY + deltaY,
    });
    chatPositionRef.current = nextPosition;
    setChatPosition(nextPosition);
  };

  const finishNativeChatDrag = (event: ReactDragEvent<HTMLButtonElement>) => {
    moveNativeChatDrag(event);
    chatNativeDragRef.current = null;
    if (didDragChatRef.current && chatPositionRef.current) {
      window.localStorage.setItem(CHAT_POSITION_KEY, JSON.stringify(chatPositionRef.current));
    }
  };

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
      return Array.from(document.querySelectorAll<HTMLElement>("main, main *")).some(
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
      window.localStorage.setItem(CHAT_POSITION_KEY, JSON.stringify(chatPositionRef.current));
    }
  };

  const beginChatMouseDrag = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const launcherBounds = launcherRef.current?.getBoundingClientRect();
    if (!launcherBounds) return;
    didDragChatRef.current = false;
    chatMouseDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: launcherBounds.left,
      originY: launcherBounds.top,
    };
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const drag = chatMouseDragRef.current;
      if (!drag) return;
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

    const handleMouseUp = () => {
      if (!chatMouseDragRef.current) return;
      chatMouseDragRef.current = null;
      if (didDragChatRef.current && chatPositionRef.current) {
        window.localStorage.setItem(CHAT_POSITION_KEY, JSON.stringify(chatPositionRef.current));
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: false });
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const toggleChat = () => {
    if (didDragChatRef.current) {
      didDragChatRef.current = false;
      return;
    }
    setOpen((value) => !value);
  };

  const dragLauncher = (_event: unknown, data: { x: number; y: number }) => {
    const nextPosition = clampChatPosition({ x: data.x, y: data.y });
    didDragChatRef.current = true;
    chatPositionRef.current = nextPosition;
    setChatPosition(nextPosition);
  };

  const finishLauncherDrag = () => {
    window.localStorage.setItem(CHAT_POSITION_KEY, JSON.stringify(chatPositionRef.current));
  };

  const scrollToPageTop = () => {
    const scrollOptions: ScrollToOptions = { top: 0, left: 0, behavior: "smooth" };
    window.scrollTo(scrollOptions);
    document.querySelectorAll<HTMLElement>("main, main *").forEach((element) => {
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

  const answerFor = (question: string) => {
    const normalized = question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const unavailable =
      "That value is not available from the fleet backend right now. I’ll calculate it automatically when live data is returned.";

    if (normalized.includes("driver") && normalized.includes("score")) {
      return footerMetrics.driverScore !== null
        ? `The overall driver score is ${footerMetrics.driverScore.toFixed(1)}/100. It is calculated from the backend fleet average, or from the mean of available vehicle driver scores when the fleet average is not supplied.`
        : unavailable;
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
      return footerMetrics.safetyScore !== null
        ? `The fleet safety score is ${footerMetrics.safetyScore.toFixed(1)}/100, calculated from the backend fleet value or the available vehicle safety scores.`
        : "A safety score is not currently provided by the fleet backend.";
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

  const ask = (question: string) => {
    const cleanQuestion = question.trim();
    if (typing || !cleanQuestion) return;
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: "user", text: cleanQuestion },
    ]);
    setQuestionInput("");
    setTyping(true);

    const delay = 2300 + Math.floor(Math.random() * 700);
    responseTimer.current = setTimeout(() => {
      setMessages((current) => [
        ...current,
        { id: nextId.current++, role: "assistant", text: answerFor(cleanQuestion) },
      ]);
      setTyping(false);
      responseTimer.current = null;
    }, delay);
  };

  const dark = theme.palette.mode === "dark";
  const accent = dark ? "#38bdf8" : "#005071";

  return (
    <>
      <Draggable
        nodeRef={launcherRef}
        position={chatPosition}
        onStart={() => {
          didDragChatRef.current = false;
        }}
        onDrag={dragLauncher}
        onStop={finishLauncherDrag}
        handle='[data-testid="fleet-chat-button"]'
        cancel='[data-testid="scroll-to-top-button"]'
      >
      <Box
        ref={launcherRef}
        component="aside"
        aria-label="Fleet assistant launcher"
        data-testid="fleet-status-bar"
        sx={{
          position: "fixed",
          left: 0,
          top: 0,
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
                top: 3,
                ...(chatPosition && chatPosition.x < 66 ? { left: 58 } : { right: 58 }),
                width: 42,
                height: 42,
                minHeight: 42,
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
              <KeyboardArrowUpRoundedIcon />
            </Fab>
          </Tooltip>
        )}
      </Box>
      </Draggable>

      {open && (
        <Paper
          role="dialog"
          aria-label="Fleet Assistant chat"
          elevation={18}
          sx={{
            position: "fixed",
            zIndex: (muiTheme) => muiTheme.zIndex.modal,
            right: { xs: 10, sm: 22 },
            bottom: { xs: 136, sm: 142 },
            width: { xs: "calc(100vw - 20px)", sm: 370 },
            height: { xs: "min(580px, calc(100vh - 96px))", sm: 560 },
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
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                bgcolor: "rgba(255,255,255,.16)",
                border: "1px solid rgba(255,255,255,.25)",
              }}
            >
              <SmartToyRoundedIcon fontSize="small" />
            </Box>
            <Box sx={{ flex: 1 }}>
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
                  <Typography sx={{ fontSize: 11.5, lineHeight: 1.48 }}>
                    {message.text}
                  </Typography>
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
            <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.65}>
              {topics.map((topic) => (
                <Chip
                  key={topic}
                  label={topic}
                  onClick={() => ask(topic)}
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
    </>
  );
}
