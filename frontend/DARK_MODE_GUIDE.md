# Dark Mode Color Guide

Agent reference for adding dark mode to any page that currently only has light-theme styling.  
Every rule here is derived from the live codebase. Follow this exactly — do not invent new colors.

---

## 0. Setup — How to Detect Dark Mode

```tsx
import { useTheme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";

// Inside the component (after all hooks):
const theme = useTheme();
const isDark = theme.palette.mode === "dark";
```

**Critical rules:**
- Always use `theme.palette.mode === "dark"` — never `useStore().darkMode` for color decisions
- `isDark` must be derived inside the component body, not passed as a prop
- `alpha()` is from `@mui/material/styles`, not `@mui/system`

---

## 1. Master Color Token Map

Every light-only value you encounter maps to one of these pairs.

### Background surfaces

| Role | Light | Dark |
|---|---|---|
| Page background gradient | `linear-gradient(145deg, #f8fafc 0%, #eef6ff 52%, #f7fbff 100%)` | `linear-gradient(145deg, #06111d 0%, #0b1724 52%, #0d1b2a 100%)` |
| Card background | `#ffffff` | `alpha("#0b1724", 0.9)` |
| Card background (placeholder/not-live) | `#eef0f4` | `#2c2e35` |
| Table header background | `#f8fafc` | `#1e293b` |
| Table alt row background | `#f8fafc` | `#111827` |
| Table even row background | `#ffffff` | `#0f172a` |
| Input / Select background | `#f8fafc` | `#1e293b` |
| Tab container background | `#EEF9FD` | `#0f172a` |
| Selected tab background | `#DCF3FA` | `#1e293b` |
| Page tab switcher track | `alpha("#dde6ef", 0.6)` | `alpha("#020c16", 0.7)` |
| Page tab selected pill | `#ffffff` | `#0d2137` |
| AG Grid header | `#1e3a5f` (both themes) | `#0d2137` |
| Leaflet map overlay | `#ffffff` | `#0f172a` |
| Brush (Recharts scrubber) track | `alpha("#e2eaf4", 0.9)` | `alpha("#0d2137", 0.85)` |
| Score gauge track | `#e5e7eb` | `#1e293b` |
| Health gauge track | `#E5E7EB` | `#374151` |
| LinearProgress track | `#e2e8f0` | `#1e293b` |
| Dialog / Popover section divider bg | `#ffffff` | `#0f172a` |
| Diagnostics/skipped info panel | `#f8fafc` | `alpha("#0b1724", 0.6)` |

### Text colors

| Role | Light | Dark |
|---|---|---|
| Primary body text | `#0f172a` / `#1f2937` | `#e2e8f0` |
| Secondary / muted text | `#64748b` | `#94a3b8` |
| Disabled / very muted | `#94a3b8` | `#64748b` |
| Table header text | `#94a3b8` | `#94a3b8` (same) |
| Axis / tick labels | `#64748b` | `#94a3b8` |
| Section title labels | `#64748b` | `#94a3b8` |
| Emphasis / highlighted value | `#0f172a` | `#e2e8f0` |
| Vehicle name in table | `#0891b2` | `#22d3ee` |
| Link / accent blue | `#3b82f6` / `#2563eb` | `#60a5fa` |
| Selected tab text | `#005071` | `#38bdf8` |
| Unselected tab text | `#4A6B77` | `#64748b` |
| Page tab unselected | `#64748b` | `alpha("#94a3b8", 0.8)` |
| Page tab selected | `#0f172a` | `#f1f5f9` |
| Tile / KPI value | `#0f172a` | `#e2e8f0` |
| Status/score badge values | use semantic color (unchanged) | same |

### Borders

| Role | Light | Dark |
|---|---|---|
| Card border | `alpha("#1f2937", 0.1)` | `alpha("#7dd3fc", 0.16)` |
| Table / section divider | `#e2e8f0` / `#1e293b` | `#1e293b` |
| Input border default | `#e2e8f0` / `#334155` | `#334155` |
| Input border hover | `#cbd5e1` / `#475569` | `#475569` |
| Input border focused | `#3b82f6` (both) | `#3b82f6` (both) |
| Page tab switcher border | `alpha("#94a3b8", 0.20)` | `alpha("#7dd3fc", 0.08)` |
| Page tab selected ring | `0 1px 3px alpha("#334155",0.16)` | `0 1px 4px alpha("#000",0.45), 0 0 0 1px alpha("#7dd3fc",0.06)` |
| Brush (Recharts) border | `alpha("#3b82f6", 0.5)` | `alpha("#7dd3fc", 0.5)` |
| AG Grid border | `alpha("#1f2937", 0.1)` | `alpha("#7dd3fc", 0.1)` |
| AG Grid row border | `alpha("#1f2937", 0.08)` | `alpha("#7dd3fc", 0.07)` |
| HTML table border | `alpha("#1f2937", 0.1)` | `alpha("#7dd3fc", 0.1)` |

### Shadows

| Role | Light | Dark |
|---|---|---|
| Card box shadow | `0 12px 30px alpha("#334155", 0.08)` | `0 18px 42px alpha("#000", 0.22)` |
| Tooltip box shadow | `0 4px 16px alpha("#334155", 0.12)` | `0 8px 24px alpha("#000", 0.4)` |

### Chart — grids, axes, backgrounds

| Role | Light | Dark |
|---|---|---|
| CartesianGrid stroke | `alpha("#1f2937", 0.06)` | `alpha("#7dd3fc", 0.08)` |
| Axis line stroke | `alpha("#1f2937", 0.1)` | `alpha("#7dd3fc", 0.1)` |
| ECharts grid line | `rgba(0,0,0,.06)` / `rgba(0,0,0,.07)` | `rgba(255,255,255,.06)` / `rgba(255,255,255,.08)` |
| ECharts axis line | `#c5c5c5` | `#2a3a4a` |
| ECharts axis labels | `#616161` | `#8a9bb0` |
| ECharts tooltip bg | `#ffffff` | `#1e293b` |
| ECharts tooltip border | `#e2e8f0` | `#334155` |
| ECharts tooltip text | `#1e293b` | `#e2e8f0` |
| Recharts tooltip bg | `#ffffff` | `alpha("#0b1724", 0.97)` |
| Recharts tooltip border | `alpha("#1f2937", 0.15)` | `alpha("#7dd3fc", 0.2)` |
| Recharts tooltip text | `#0f172a` | `#e2e8f0` |
| Recharts bar cursor | `alpha("#3b82f6", 0.06)` | `alpha("#7dd3fc", 0.08)` |
| Recharts line cursor | `stroke: alpha("#3b82f6", 0.2)` | `stroke: alpha("#7dd3fc", 0.3)` |

### Interactive / hover states

| Role | Light | Dark |
|---|---|---|
| Row hover (HTML table) | `alpha("#3b82f6", 0.05)` | `alpha("#7dd3fc", 0.09)` |
| Row hover (AG Grid) | `alpha("#3b82f6", 0.05)` | `alpha("#7dd3fc", 0.09)` |
| AG Grid row selected | `alpha("#3b82f6", 0.1)` | `alpha("#3b82f6", 0.22)` |
| Table header cell hover | `#f1f5f9` | `#263044` |
| Page tab hover (unselected) | `alpha("#94a3b8", 0.12)` | `alpha("#7dd3fc", 0.05)` |

---

## 2. Page Background

Always the first thing to apply. Wrap the entire page:

```tsx
<Box sx={{
  minHeight: "calc(100vh - 64px)",
  p: 0.5,
  color: "text.primary",
  background: isDark
    ? "linear-gradient(145deg, #06111d 0%, #0b1724 52%, #0d1b2a 100%)"
    : "linear-gradient(145deg, #f8fafc 0%, #eef6ff 52%, #f7fbff 100%)",
}}>
```

---

## 3. Card Component

Replace every `<Paper>` with this. Define once at module level (outside the page component):

```tsx
function Card({ children, sx = {} }: { children: React.ReactNode; sx?: object }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  return (
    <Box sx={{
      borderRadius: 2,
      bgcolor: isDark ? alpha("#0b1724", 0.9) : "#ffffff",
      border: `1px solid ${isDark ? alpha("#7dd3fc", 0.16) : alpha("#1f2937", 0.1)}`,
      boxShadow: isDark
        ? `0 18px 42px ${alpha("#000", 0.22)}`
        : `0 12px 30px ${alpha("#334155", 0.08)}`,
      overflow: "hidden",
      ...sx,
    }}>
      {children}
    </Box>
  );
}
```

**Placeholder/not-live card variant** (data not yet streaming):
```tsx
<Card sx={{
  p: 1, height: "100%",
  bgcolor: isDark ? "#2c2e35" : "#eef0f4",
  ...(isDark && { border: "1px solid #3a3c44", opacity: 0.85, filter: "grayscale(22%)" }),
}}>
```

---

## 4. SectionTitle Component

Define at module level, used at the top of every card:

```tsx
function SectionTitle({ children, sx = {} }: { children: React.ReactNode; sx?: object }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  return (
    <Typography sx={{
      fontSize: "11px", fontWeight: 700,
      color: isDark ? "#94a3b8" : "#64748b",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      mb: 1,
      ...sx,
    }}>
      {children}
    </Typography>
  );
}
```

---

## 5. MetricTile / KPI Tile

Used for KPI grids inside cards. Defined at module level:

```tsx
function MetricTile({ label, value, accent, sub }: {
  label: string; value: string | number; accent: string; sub?: string
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  return (
    <Box sx={{
      p: 1.5, height: "100%", flex: 1, borderRadius: 1.5,
      bgcolor: isDark ? alpha("#0b1724", 0.9) : "#ffffff",
      border: `1px solid ${isDark ? alpha("#7dd3fc", 0.16) : alpha("#1f2937", 0.1)}`,
      boxShadow: isDark ? `0 18px 42px ${alpha("#000", 0.22)}` : `0 12px 30px ${alpha("#334155", 0.08)}`,
      position: "relative", overflow: "hidden",
      "&::before": {
        content: '""', position: "absolute",
        top: 0, left: 0, right: 0, height: "3px",
        bgcolor: accent, borderRadius: "4px 4px 0 0",
      },
      display: "flex", flexDirection: "column", justifyContent: "space-between",
    }}>
      <Typography sx={{ fontSize: "10px", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: "16px", fontWeight: 800, color: isDark ? "#e2e8f0" : "#0f172a", lineHeight: 1.1, mt: 0.5 }}>
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ fontSize: "10px", color: isDark ? "#64748b" : "#94a3b8", mt: 0.25 }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}
```

For equal-height KPI rows, wrap each tile in `<Box sx={{ flex: 1, display: "flex" }}>` inside a `<Stack direction="row" alignItems="stretch">`.

---

## 6. HTML Tables

Declare these variables inside the component (they depend on `isDark`):

```tsx
const _tblBorder  = isDark ? alpha("#7dd3fc", 0.1)  : alpha("#1f2937", 0.1);
const _tblHdrBg   = isDark ? "#0d2137"               : "#1e3a5f";
const _tblEvenBg  = isDark ? "transparent"           : "#ffffff";
const _tblOddBg   = isDark ? alpha("#7dd3fc", 0.04)  : "#f8fafc";
const _tblText    = isDark ? "#e2e8f0"               : "#1f2937";
const _tblMuted   = isDark ? "#94a3b8"               : "#64748b";

// Reusable style objects:
const tblHeaders: React.CSSProperties = {
  textAlign: "left" as const, padding: "4px 12px",
  color: "#ffffff", fontWeight: 700, whiteSpace: "nowrap",
  position: "sticky", top: 0,
  background: _tblHdrBg,
  boxShadow: `0 1px 0 ${_tblBorder}`,
};
const tblRowEvens: React.CSSProperties = {
  borderBottom: `1px solid ${_tblBorder}`, background: _tblEvenBg,
};
const tblRowOdds: React.CSSProperties = {
  borderBottom: `1px solid ${_tblBorder}`, background: _tblOddBg,
};
const tblCell = {
  padding: "7px 12px",
  borderBottom: `1px solid ${_tblBorder}`,
  verticalAlign: "middle" as const,
  color: _tblText,
  fontSize: "11px",
};
```

**Row hover handlers:**
```tsx
onMouseEnter={(e) => {
  e.currentTarget.style.background = isDark ? alpha("#7dd3fc", 0.09) : alpha("#3b82f6", 0.05);
}}
onMouseLeave={(e) => {
  e.currentTarget.style.background = i % 2 === 0 ? _tblEvenBg : _tblOddBg;
}}
```

**Table wrapper** — always use `borderCollapse: "collapse" as const` (the `as const` prevents TypeScript errors):
```tsx
<table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: "11px", color: _tblText }}>
```

---

## 7. MUI TableCell (fleet-style tables)

```tsx
// Header cell
<TableCell sx={{
  bgcolor: isDark ? "#1e293b" : "#f8fafc",
  color: isDark ? "#94a3b8" : "#64748b",
  fontWeight: 600, fontSize: "11px", letterSpacing: ".04em",
  borderBottom: `2px solid ${isDark ? "#334155" : "#e2e8f0"}`,
}}>

// Body row alternating background
const rowBg = isDark
  ? rowIdx % 2 === 0 ? "#0f172a" : "#111827"
  : rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc";

// Row hover
"&:hover": { bgcolor: `${alpha("#3b82f6", isDark ? 0.1 : 0.05)} !important` }

// Section divider border
borderBottom: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`
```

---

## 8. AG Grid

Define `agGridContainerSx` inside the component (needs `isDark`). Spread onto `<Box className={agTheme}>` — **never** on the Card wrapper.

```tsx
const agTheme = isDark ? "ag-theme-balham-dark" : "ag-theme-balham";

const agGridContainerSx: object = {
  "--ag-background-color": "transparent",
  "--ag-odd-row-background-color": isDark ? alpha("#7dd3fc", 0.04) : "#f8fafc",
  "--ag-row-hover-color": isDark ? alpha("#7dd3fc", 0.09) : alpha("#3b82f6", 0.05),
  "--ag-selected-row-background-color": isDark ? alpha("#3b82f6", 0.22) : alpha("#3b82f6", 0.1),
  "--ag-foreground-color": isDark ? "#e2e8f0" : "#0f172a",
  "--ag-data-color": isDark ? "#e2e8f0" : "#1f2937",
  "--ag-secondary-foreground-color": isDark ? "#94a3b8" : "#64748b",
  "--ag-border-color": isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1),
  "--ag-row-border-color": isDark ? alpha("#7dd3fc", 0.07) : alpha("#1f2937", 0.07),
  "--ag-input-focus-border-color": isDark ? alpha("#7dd3fc", 0.5) : alpha("#3b82f6", 0.5),
  "& .ag-header": { backgroundColor: `${isDark ? "#0d2137" : "#1e3a5f"} !important` },
  "& .ag-header-cell": {
    backgroundColor: `${isDark ? "#0d2137" : "#1e3a5f"} !important`,
    color: "#fff !important", fontSize: "11px !important",
    fontWeight: "700 !important", letterSpacing: "0.04em !important",
  },
  "& .ag-header-cell-label": { color: "#fff !important" },
  "& .ag-icon": { color: "#fff !important" },
  "& .ag-header-icon": { color: "#fff !important" },
  "& .ag-sort-ascending-icon": { color: "#fff !important" },
  "& .ag-sort-descending-icon": { color: "#fff !important" },
  "& .ag-sort-none-icon": { color: "#fff !important" },
  "& .ag-cell": { fontSize: "10px !important" },
  "& .ag-row": {
    fontSize: "10px !important",
    borderColor: `${isDark ? alpha("#7dd3fc", 0.07) : alpha("#1f2937", 0.08)} !important`,
  },
  "& .ag-root-wrapper": { borderRadius: "6px", border: "none !important" },
  "& .ag-root-wrapper-body": { borderRadius: "6px" },
};

// Usage:
<Box className={agTheme} sx={agGridContainerSx}>
  <AgGridReact ... />
</Box>
```

---

## 9. ECharts Configuration

### Tooltip
```ts
tooltip: {
  trigger: "axis",
  backgroundColor: isDark ? "#1e293b" : "#ffffff",
  borderColor:     isDark ? "#334155" : "#e2e8f0",
  borderWidth: 1, borderRadius: 8, padding: [8, 12],
  textStyle: { fontSize: 10, color: isDark ? "#e2e8f0" : "#1e293b", fontFamily: CHART_FONT },
}
```

### X-axis (category)
```ts
xAxis: {
  type: "category",
  axisLabel: { fontSize: 10, fontFamily: CHART_FONT, color: isDark ? "#8a9bb0" : "#616161", margin: 14 },
  axisTick: { show: false },
  axisLine: { lineStyle: { color: isDark ? "#2a3a4a" : "#c5c5c5", width: 1 } },
  splitLine: { show: true, lineStyle: { color: isDark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)" } },
}
```

### Y-axis (value, 0–100)
```ts
yAxis: {
  type: "value", min: 0, max: 100, interval: 20,
  axisLabel: { fontSize: 10, fontFamily: CHART_FONT, color: isDark ? "#8a9bb0" : "#616161", formatter: "{value}%", margin: 10 },
  axisTick: { show: false },
  axisLine: { show: false },
  splitLine: { lineStyle: { color: isDark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.07)", type: "dashed" } },
}
```

### Mark areas (health zones)
```ts
markArea: {
  silent: true,
  data: [
    [{ yAxis: 0,  itemStyle: { color: isDark ? "rgba(239,68,68,.03)"  : "rgba(239,68,68,.025)"  } }, { yAxis: 60 }],
    [{ yAxis: 60, itemStyle: { color: isDark ? "rgba(245,158,11,.025)": "rgba(245,158,11,.02)"  } }, { yAxis: 80 }],
  ],
}
```

### DataZoom slider
```ts
{
  type: "slider", bottom: 10, height: 22,
  borderColor: "transparent",
  fillerColor: alpha("#3b82f6", 0.12),
  backgroundColor: "transparent",
  textStyle: { fontSize: 10, fontFamily: CHART_FONT },
}
```

### Gauge (score, 0–100)
```ts
axisLine: { lineStyle: { width: 10, color: [[1, isDark ? "#1e293b" : "#e5e7eb"]] } }
title: { color: isDark ? "#64748b" : "#999" }
```

### Pie / Donut
```ts
itemStyle: { borderColor: isDark ? "#1a2535" : "#fff", borderWidth: 2 }
```

---

## 10. Recharts Configuration

### Define these inside the component

```tsx
const CHART_FONT = '"Inter", "Segoe UI", Roboto, Arial, sans-serif';

const axisStyle = {
  fontSize: "10px",
  fill: isDark ? "#94a3b8" : "#64748b",
  fontFamily: CHART_FONT,
};

const tooltipStyle = {
  borderRadius: 8, fontSize: "11px", padding: "10px 14px",
  backgroundColor: isDark ? alpha("#0b1724", 0.97) : "#ffffff",
  border: `1px solid ${isDark ? alpha("#7dd3fc", 0.2) : alpha("#1f2937", 0.15)}`,
  color: isDark ? "#e2e8f0" : "#0f172a",
  boxShadow: isDark ? `0 8px 24px ${alpha("#000", 0.4)}` : `0 4px 16px ${alpha("#334155", 0.12)}`,
};

const gridStroke  = isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.06);
const axisStroke  = isDark ? alpha("#7dd3fc", 0.1)  : alpha("#1f2937", 0.1);
```

### CartesianGrid
```tsx
<CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
```

### XAxis / YAxis
```tsx
<XAxis tick={axisStyle} axisLine={{ stroke: axisStroke }} tickLine={false} />
<YAxis tick={axisStyle} axisLine={{ stroke: axisStroke }} tickLine={false} />
```

### Tooltip — cursor override is REQUIRED (prevents grey box)
```tsx
// BarChart:
<Tooltip
  cursor={{ fill: isDark ? alpha("#7dd3fc", 0.08) : alpha("#3b82f6", 0.06) }}
  contentStyle={tooltipStyle}
/>

// LineChart:
<Tooltip
  cursor={{ stroke: isDark ? alpha("#7dd3fc", 0.3) : alpha("#3b82f6", 0.2), strokeWidth: 1 }}
  contentStyle={tooltipStyle}
/>
```

### Brush / scrubber
```tsx
<Brush
  dataKey="ts"
  height={22}
  stroke={isDark ? alpha("#7dd3fc", 0.5) : alpha("#3b82f6", 0.5)}
  fill={isDark ? alpha("#0d2137", 0.85) : alpha("#e2eaf4", 0.9)}
  travellerWidth={10}
  style={{ fontSize: "9px", fill: isDark ? "#94a3b8" : "#64748b" }}
/>
```

### Dot on Line
```tsx
dot={{ r: 3, fill: "#ef4444", stroke: isDark ? "#0b1724" : "#ffffff", strokeWidth: 2 }}
```

---

## 11. Form Controls

### Search TextField
```tsx
<TextField sx={{
  "& .MuiOutlinedInput-root": {
    bgcolor: isDark ? "#1e293b" : "#f8fafc",
    "& fieldset": { borderColor: isDark ? "#334155" : "#e2e8f0" },
    "&:hover fieldset": { borderColor: isDark ? "#475569" : "#cbd5e1" },
    "&.Mui-focused fieldset": { borderColor: "#3b82f6" },
  },
}} />
```

### Select (compact)
```tsx
<Select sx={{
  "& .MuiOutlinedInput-notchedOutline": { borderColor: isDark ? "#334155" : "#e2e8f0" },
  bgcolor: isDark ? "#1e293b" : "#f8fafc",
  color: isDark ? "#e2e8f0" : "#1e293b",
  borderRadius: 1,
}}>
```

### Pagination
```tsx
<Pagination sx={{
  "& .MuiPaginationItem-root": {
    color: isDark ? "#94a3b8" : "#64748b",
    backgroundColor: isDark ? "#1e293b" : "transparent",
    border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
    "&:hover": { backgroundColor: isDark ? "#334155" : undefined },
    "&.Mui-selected": { backgroundColor: "#3b82f6", color: "#fff", borderColor: "#3b82f6" },
    "&.MuiPaginationItem-ellipsis": { backgroundColor: "transparent", border: "none" },
  },
}} />
```

---

## 12. Page Tab Switcher (ToggleButtonGroup)

Used as the main page-level navigation between major views:

```tsx
<ToggleButtonGroup sx={{
  bgcolor: isDark ? alpha("#020c16", 0.7) : alpha("#dde6ef", 0.6),
  borderRadius: "10px",
  border: `1px solid ${isDark ? alpha("#7dd3fc", 0.08) : alpha("#94a3b8", 0.2)}`,
  p: "3px",
  "& .MuiToggleButtonGroup-grouped": { border: "none !important", borderRadius: "7px !important" },
  "& .MuiToggleButton-root": {
    py: "5px", px: "14px", fontSize: "10px", fontWeight: 600,
    textTransform: "none", whiteSpace: "nowrap",
    color: isDark ? alpha("#94a3b8", 0.8) : "#64748b",
    transition: "background-color 0.15s, color 0.15s, box-shadow 0.15s",
    "&.Mui-selected": {
      color: isDark ? "#f1f5f9" : "#0f172a",
      fontWeight: 700,
      bgcolor: isDark ? "#0d2137" : "#ffffff",
      boxShadow: isDark
        ? `0 1px 4px ${alpha("#000", 0.45)}, 0 0 0 1px ${alpha("#7dd3fc", 0.06)}`
        : `0 1px 3px ${alpha("#334155", 0.16)}, 0 1px 2px ${alpha("#334155", 0.1)}`,
    },
    "&:hover:not(.Mui-selected)": {
      bgcolor: isDark ? alpha("#7dd3fc", 0.05) : alpha("#94a3b8", 0.12),
      color: isDark ? "#cbd5e1" : "#374151",
    },
  },
}}>
```

**Never** use a colored fill (e.g., `alpha("#7dd3fc", 0.14)`) as the selected state. Selected = elevated navy/white, not colored fog.

---

## 13. Popover / Panel Tabs (inside cards)

```tsx
<Tabs sx={{
  bgcolor: isDark ? "#0f172a" : "#EEF9FD",
  borderBottom: `1px solid ${isDark ? "#1e293b" : "#CDECF5"}`,
  "& .MuiTab-root": {
    color: isDark ? "#64748b" : "#4A6B77",
    bgcolor: isDark ? "#111827" : "#EAF7FB",
    fontSize: "10px", fontWeight: 700, textTransform: "none",
  },
  "& .MuiTab-root:not(:last-child)": {
    borderRight: `1px solid ${isDark ? "#1e293b" : "#D6EEF6"}`,
  },
  "& .Mui-selected": {
    bgcolor: isDark ? "#1e293b" : "#DCF3FA",
    color: isDark ? "#38bdf8" : "#005071",
  },
  "& .MuiTabs-indicator": {
    backgroundColor: isDark ? "#0ea5e9" : "#8FCFE3",
  },
}}>
```

---

## 14. Status Badges

### Pill badge
```tsx
<Box sx={{
  px: 1, py: 0.4, borderRadius: 5,
  bgcolor: alpha(statusColor, isDark ? 0.18 : 0.1),
  border: `1px solid ${alpha(statusColor, 0.25)}`,
}}>
  <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: statusColor }} />
  <Typography sx={{ fontSize: "10px", fontWeight: 700, color: statusColor }}>{label}</Typography>
</Box>
```

### Chip (MUI)
```tsx
<Chip sx={{
  borderRadius: "4px",     // NOT 0 — always use "4px" minimum
  bgcolor: alpha(color, isDark ? 0.18 : 0.1),
  color: color,
  fontWeight: 700, fontSize: "10px",
}} />
```

### Inline status span (in HTML tables)
```tsx
<span style={{
  padding: "2px 8px", borderRadius: "4px",
  fontSize: "10px", fontWeight: 700,
  background: statusColor,
  color: "#fff",
}}>
  {status}
</span>
```

---

## 15. Progress Bars

### MUI LinearProgress
```tsx
<LinearProgress variant="determinate" value={score} sx={{
  height: 5, borderRadius: 3,
  bgcolor: isDark ? "#1e293b" : "#e2e8f0",
  "& .MuiLinearProgress-bar": { bgcolor: scoreColor, borderRadius: 3 },
}} />
```

### Custom bar (anomaly drivers, feature importance)
```tsx
<Box sx={{ flex: 1, height: 6, bgcolor: isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.08), borderRadius: 1, overflow: "hidden" }}>
  <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: accentColor, borderRadius: 1 }} />
</Box>
```

---

## 16. Semantic / Status Colors (theme-independent)

These do **not** change between light and dark — they are always the same hex value:

| Semantic role | Color |
|---|---|
| Health ≥ 80 / Active / Good | `#22c55e` |
| Health 60–79 / Warning | `#eab308` |
| Health < 60 / Critical / Error | `#ef4444` |
| Blue / Info / Selected | `#3b82f6` |
| Purple / Service | `#8b5cf6` |
| Parked | `#3b82f6` |

**Health threshold helper** — use everywhere for coloring by score:
```ts
const healthColor = (h: number) => h >= 80 ? "#22c55e" : h >= 60 ? "#eab308" : "#ef4444";
```

**Old palette — do not use these anywhere:**

| Old (wrong) | Replacement |
|---|---|
| `#d32f2f` | `#ef4444` |
| `#ed6c02` | `#eab308` |
| `#2e7d32` | `#22c55e` |
| `#388e3c` | `#22c55e` |
| `#1976d2` | `#3b82f6` |
| `#f57c00` | `#eab308` |

---

## 17. Leaflet Map (dark mode tile filter)

Apply to the Box wrapper around `<MapContainer>`:

```tsx
...(isDark && {
  "& .leaflet-tile-pane": {
    filter: "invert(1) hue-rotate(180deg) contrast(0.82) brightness(1.45) saturate(1.15)",
  },
  "& .leaflet-control-zoom": { border: "1px solid #1e293b !important" },
  "& .leaflet-control-zoom a": {
    background: "#0f172a !important", color: "#94a3b8 !important",
    borderBottom: "1px solid #1e293b !important",
  },
  "& .leaflet-control-zoom a:hover": {
    background: "#1e293b !important", color: "#e2e8f0 !important",
  },
  "& .leaflet-control-attribution": {
    background: "rgba(15,23,42,0.85) !important", color: "#64748b !important",
  },
})
```

---

## 18. Anti-Patterns — Never Do These

| ❌ Wrong | ✅ Correct |
|---|---|
| `darkMode` from Zustand store for color decisions | `theme.palette.mode === "dark"` via `useTheme()` |
| `<Paper sx={{ bgcolor: "background.paper" }}>` | Custom `Card` component |
| `borderRadius: 0` on chips or badges | `borderRadius: "4px"` minimum |
| `textAlign: "center"` (TypeScript error) | `textAlign: "center" as const` |
| `borderCollapse: "collapse"` (TypeScript error) | `borderCollapse: "collapse" as const` |
| Grey colors for AG Grid row backgrounds (`#333`, `rgba(0,0,0,.1)`) | Sky-blue tints (`alpha("#7dd3fc", 0.04)`) in dark |
| AG Grid CSS variables on parent `<Card>` | Must be on `<Box className={agTheme}>` |
| Recharts `<Tooltip>` without `cursor` prop | Always add `cursor={{ fill/stroke }}` |
| `alpha("#7dd3fc", 0.14)` as page-tab selected state | Deep navy `#0d2137` (dark) / white `#ffffff` (light) |
| `ct.axisColor`, `ct.gridColor`, `ct.tableBg`, etc. | Replace with isDark ternary per token map |
| Swallowing TypeScript errors with `as any` on style objects | Use `as const` on string literals |
| `color: "text.secondary"` in inline SVG/HTML styles | `color: isDark ? "#94a3b8" : "#64748b"` |
| `bgcolor: "#fff"` on `FormControl` or any form wrapper | `bgcolor: isDark ? "#1e293b" : "#fff"` — applies to the wrapper element, not just the inner `Select` |

---

## 19. Migration Checklist

Work through a light-only page in this order:

**Phase 1 — Setup**
- [ ] Import `useTheme`, `alpha` from `@mui/material/styles`
- [ ] Add `const theme = useTheme(); const isDark = theme.palette.mode === "dark";` inside the component
- [ ] Add `const CHART_FONT = '"Inter", "Segoe UI", Roboto, Arial, sans-serif';` at module level

**Phase 2 — Structure**
- [ ] Define `Card`, `SectionTitle`, `MetricTile` helper components at module level
- [ ] Replace every `<Paper sx={{ ... }}>` with `<Card sx={{ ... }}>`
- [ ] Replace every `<Paper elevation={X}>` with `<Card>`
- [ ] Apply gradient page background

**Phase 3 — Text and surfaces**
- [ ] Replace hardcoded `color: "#64748b"` → `color: isDark ? "#94a3b8" : "#64748b"`
- [ ] Replace hardcoded `color: "#1f2937"` → `color: isDark ? "#e2e8f0" : "#1f2937"`
- [ ] Replace `bgcolor: "#fff"` or `bgcolor: "white"` on cards → Card component
- [ ] Replace `bgcolor: "#fff"` on `FormControl` / form wrappers → `isDark ? "#1e293b" : "#fff"`
- [ ] Replace `bgcolor: "#f8fafc"` on table headers → `isDark ? "#1e293b" : "#f8fafc"`

**Phase 4 — Tables**
- [ ] Declare `_tblBorder`, `_tblHdrBg`, `_tblEvenBg`, `_tblOddBg`, `_tblText`, `_tblMuted`
- [ ] Replace table header `background` with `_tblHdrBg`
- [ ] Replace row alternating `background` with `_tblEvenBg` / `_tblOddBg`
- [ ] Replace `onMouseEnter/Leave` handlers with `_tblEvenBg`/`_tblOddBg` and hover color
- [ ] Fix `textAlign`, `borderCollapse` with `as const`

**Phase 5 — Charts**
- [ ] Add `axisStyle`, `tooltipStyle`, `gridStroke`, `axisStroke` inside the component
- [ ] Replace `ct.axisColor` → `isDark ? "#94a3b8" : "#64748b"`
- [ ] Replace `ct.gridColor` → `gridStroke`
- [ ] Replace `ct.tooltipBg`, `ct.tooltipBorder`, `ct.tooltipText` → `tooltipStyle` object
- [ ] Add `cursor` prop to every `<Tooltip>` in Recharts
- [ ] Add `fill` and `stroke` props to every `<Brush>` in Recharts
- [ ] Replace ECharts `backgroundColor`, `borderColor`, `textStyle.color` in tooltip with isDark values

**Phase 6 — AG Grid**
- [ ] Declare `agTheme` and `agGridContainerSx` inside the component
- [ ] Move any `--ag-*` CSS vars from Card to `<Box className={agTheme}>`

**Phase 7 — Controls and badges**
- [ ] Add `isDark` ternaries to all TextField / Select `bgcolor` and `borderColor`
- [ ] Change `borderRadius: 0` → `borderRadius: "4px"` on all Chips and span badges
- [ ] Update LinearProgress `bgcolor` (track color)

**Phase 8 — Old colors**
- [ ] Replace `#d32f2f` → `#ef4444`, `#ed6c02` → `#eab308`, `#2e7d32` / `#388e3c` → `#22c55e`
- [ ] Replace `#1976d2` → `#3b82f6`

**Phase 9 — Verify**
- [ ] Run `npx tsc --noEmit` — confirm zero new errors in the edited file
- [ ] Toggle dark/light mode in the browser — check every surface, every chart, every table
- [ ] Confirm no surface renders pure white in dark mode or pure black in light mode
