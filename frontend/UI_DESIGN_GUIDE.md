# Fleet Dashboard UI Design Guide

Reference standard: `src/pages/CockpitView.tsx`. All new pages and tabs must conform to this guide.

---

## 1. Typography Scale

| Role | fontSize | fontWeight | Notes |
|---|---|---|---|
| Page header / section title | `16px` | `700` | Top-level page identity |
| Card section header (SectionTitle) | `12px` | `800` | Inside every card, above content |
| KPI / card number values | `16px` | `800` | Counts, scores, percentages |
| General body text | `10px` | `400` | Default for all running text |
| Delta / trend / sub-label | `8px` | `700` | Trend arrows, secondary card labels |
| Table header | `11px` | `600` | `letterSpacing: ".04em"` |
| Table body — primary cell | `12px` | `700` | Vehicle IDs, names |
| Table body — secondary cell | `10–11px` | `400–500` | Drivers, route names, types |
| Status badge text | `10px` | `700` | `textTransform: "uppercase"`, `letterSpacing: ".04–.06em"` |
| Module badge (alert row) | `8px` | `600` | `textTransform: "uppercase"` |
| Alert DTC message | `9px` | `400` | `lineHeight: "11px"`, noWrap with title |
| Timestamp / relative time | `9px` | `400` | `whiteSpace: "nowrap"` |
| Chart axis labels | `10px` | `400` | `fontFamily: CHART_FONT` |
| Tab label | `10px` | `700` | `textTransform: "none"` |
| Empty state primary | `12px` | `500` | `color: "text.secondary"` |
| Empty state secondary | `10px` | `400` | `color: "text.disabled"` |
| Chip label | `10–11px` | `800` | MUI Chip inside tables |

**Font stack (CHART_FONT):**
```ts
const CHART_FONT = '"Inter", "Segoe UI", Roboto, Arial, sans-serif';
```

---

## 2. Color System

### Status Palette
```ts
const statusMeta = {
  active:   { color: "#22c55e", soft: "#dcfce7" },
  parked:   { color: "#3b82f6", soft: "#dbeafe" },
  warning:  { color: "#f59e0b", soft: "#fef3c7" },
  critical: { color: "#ef4444", soft: "#fee2e2" },
  service:  { color: "#8b5cf6", soft: "#ede9fe" },
};
```

### Health Score Thresholds
```ts
const healthColor = (h: number) =>
  h >= 80 ? "#22c55e" : h >= 60 ? "#eab308" : "#ef4444";
```

| Range | Label | Color |
|---|---|---|
| ≥ 90 | Excellent | `#16a34a` |
| 75–89 | Good | `#22c55e` |
| 60–74 | Average | `#f59e0b` |
| < 60 | Poor | `#ef4444` |

### Battery Thresholds
```ts
const getBatteryColor = (b: number) =>
  b >= 50 ? "#22c55e" : b >= 25 ? "#f59e0b" : "#ef4444";
```

### Driver Score Thresholds
```ts
const scoreColor = driverScore >= 80 ? "#22c55e" : driverScore >= 60 ? "#f59e0b" : "#ef4444";
```

### Alert Severity Colors
```ts
const sevColor =
  severity === "critical" ? "#ef4444" :
  severity === "active"   ? "#22c55e" : "#f59e0b";
```

### Vehicle Scatter Colors (ordered cycle)
```ts
const VEHICLE_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981",
  "#06b6d4", "#f97316", "#6366f1", "#14b8a6", "#a855f7",
];
```

### Road Type Colors
```ts
{ highway: "#2563eb", primary: "#9333ea", urban: "#f59e0b" }
```

---

## 3. Page Background

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

## 4. Card Component

Base card — use everywhere instead of raw `<Paper>`:

```tsx
const Card = ({ children, sx }) => {
  const isDark = useTheme().palette.mode === "dark";
  return (
    <Paper elevation={0} sx={{
      borderRadius: 2,
      overflow: "hidden",
      bgcolor: isDark ? alpha("#0b1724", 0.9) : "#ffffff",
      border: `1px solid ${isDark ? alpha("#7dd3fc", 0.16) : alpha("#1f2937", 0.1)}`,
      boxShadow: isDark
        ? `0 18px 42px ${alpha("#000", 0.22)}`
        : `0 12px 30px ${alpha("#334155", 0.08)}`,
      ...sx,
    }}>
      {children}
    </Paper>
  );
};
```

### Placeholder / Not-Live Card Variant
Used for cards whose data is not yet live (e.g. AI Summary):

```tsx
<Card sx={{
  p: 1, height: "100%",
  bgcolor: isDark ? "#2c2e35" : "#eef0f4",
  ...(isDark && { border: "1px solid #3a3c44", opacity: 0.85, filter: "grayscale(22%)" }),
}}>
```

---

## 5. SectionTitle Component

Use at the top of every card's content:

```tsx
const SectionTitle = ({ title, action }) => (
  <Box sx={{
    display: "flex", alignItems: "center",
    justifyContent: "space-between", gap: 1, mb: 1,
  }}>
    <Typography sx={{ fontSize: "12px", fontWeight: 800 }}>{title}</Typography>
    {action}
  </Box>
);
```

- `title` — card section name, 12px/800
- `action` — optional right-side slot: `<IconButton>`, `<Button variant="outlined">`, etc.

### Common Action Patterns
```tsx
// Refresh + navigate
<Stack direction="row" spacing={0.5} alignItems="center">
  <IconButton size="small" onClick={handleRefresh} disabled={loading} sx={{ p: 0.2 }}>
    <RestartAltOutlinedIcon sx={{ fontSize: 14 }} />
  </IconButton>
  <Button size="small" variant="outlined" sx={{ fontSize: "8px", py: "1px", px: "6px" }}
    onClick={() => navigate("/path")}>View All</Button>
</Stack>

// Expand to dialog
<IconButton size="small" onClick={() => setOpen(true)} sx={{ p: 0.5 }}>
  <AspectRatioOutlinedIcon sx={{ fontSize: 15 }} />
</IconButton>
```

---

## 6. KpiCard Component

Clickable fleet overview card. Supports selected state and trend indicator.

```tsx
// Usage
<KpiCard
  label="Active Vehicles"
  value={42}
  delta="13 vs yesterday"
  icon={<HealthAndSafetyOutlinedIcon />}
  color="#22c55e"
  iconLogo={true}           // shows trend icon
  trend="down"              // "up" | "down"
  selected={statusFilter === "active"}
  onClick={() => setStatusFilter("active")}
/>
```

**Internal structure:**
```tsx
<Card sx={{
  p: 1,
  minHeight: 80,
  transition: "all .25s ease",
  border: selected ? `2px solid ${color}` : "1px solid",
  borderColor: selected ? color : "divider",
  transform: selected ? "translateY(-2px)" : "none",
  boxShadow: selected ? `0 8px 24px ${alpha(color, 0.3)}` : 2,
  background: isDark
    ? `linear-gradient(135deg, ${alpha(color, 0.22)}, ${alpha("#0b1724", 0.95)})`
    : `linear-gradient(135deg, ${alpha(color, 0.11)}, #fff)`,
  "&:hover": {
    transform: "translateY(-3px)",
    boxShadow: `0 10px 28px ${alpha(color, 0.25)}`,
  },
}}>
  <Stack direction="row" spacing={1.2} alignItems="center">
    {/* Icon circle */}
    <Box sx={{
      width: 38, height: 38, borderRadius: "50%",
      display: "grid", placeItems: "center",
      bgcolor: alpha(color, isDark ? 0.26 : 0.14),
      color, flex: "0 0 auto",
    }}>
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      {/* Value: 18px in code — use 16px per style rule */}
      <Typography sx={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>{value}</Typography>
      <Typography sx={{ fontSize: 10, color: "text.secondary", mt: 0.5 }} noWrap>{label}</Typography>
      <Stack direction="row" spacing={0.4} alignItems="center" mt={0.7}>
        {iconLogo && (trend === "up"
          ? <TrendingUpOutlinedIcon sx={{ fontSize: 10, color: trendColor }} />
          : <TrendingDownOutlinedIcon sx={{ fontSize: 14, color: trendColor }} />
        )}
        <Typography sx={{ fontSize: 8, color: trendColor, fontWeight: 700 }}>{delta}</Typography>
      </Stack>
    </Box>
  </Stack>
</Card>
```

- `trendColor`: `trend === "up" ? "#ef4444" : "#22c55e"` (up = bad for alerts/errors, down = good)
- KPI row grid: `gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", lg: "repeat(8,1fr)" }, gap: 1`

---

## 7. Operational Metric Tile

Used in the 3×2 grid inside "Operational Metrics (Today)". Color-accented, left-ruled tile.

```tsx
<Box sx={{
  p: 0.6,
  borderRadius: 1.5,
  border: `1px solid ${alpha(color, isDark ? 0.22 : 0.18)}`,
  bgcolor: alpha(color, isDark ? 0.07 : 0.05),
  display: "flex", flexDirection: "column", gap: 0.25,
  position: "relative", overflow: "hidden",
  "&::before": {
    content: '""', position: "absolute",
    top: 0, left: 0, width: "3px", height: "100%",
    bgcolor: color,
  },
}}>
  <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
    <Typography sx={{ fontSize: "11px", fontWeight: 900, lineHeight: 1, pl: 0.5, whiteSpace: "nowrap",
      color: isDark ? "#f1f5f9" : "#0f172a" }}>
      {value}
    </Typography>
    <Box sx={{ width: 20, height: 20, borderRadius: "6px",
      bgcolor: alpha(color, isDark ? 0.2 : 0.12),
      display: "flex", alignItems: "center", justifyContent: "center",
      color, flexShrink: 0 }}>
      {icon}   {/* fontSize: 12 */}
    </Box>
  </Box>
  <Typography sx={{ fontSize: "8px", fontWeight: 600, color: "text.secondary",
    textTransform: "uppercase", letterSpacing: "0.5px", pl: 0.5, lineHeight: 1 }}>
    {label}
  </Typography>
  <Typography sx={{ fontSize: "9px", color, fontWeight: 700, pl: 0.5, lineHeight: 1 }}>
    {delta}
  </Typography>
</Box>
```

Grid container:
```tsx
<Box sx={{
  flex: 1, overflow: "hidden", display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gridTemplateRows: "repeat(2, 1fr)",
  gap: 0.5,
}}>
```

---

## 8. Alert Row

Used in `RecentAlerts` card. Severity-coded, left-bordered row.

```tsx
<Stack direction="row" alignItems="center" spacing={0.75} sx={{
  pl: 1, pr: 0.75, py: 0.2,
  borderRadius: 1,
  borderLeft: `3px solid ${sevColor}`,
  bgcolor: alpha(sevColor, 0.06),
  minWidth: 0,
}}>
  {/* Status dot */}
  <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: sevColor, flexShrink: 0 }} />

  <Box minWidth={0} flex={1}>
    <Stack direction="row" alignItems="center" spacing={0.5}>
      {/* Vehicle ID */}
      <Typography sx={{ fontSize: "10px", fontWeight: 700, lineHeight: 1.15 }} noWrap>
        {source_id.toUpperCase()}
      </Typography>
      {/* Module badge */}
      <Box sx={{ px: 0.5, py: "1px", borderRadius: 0.5,
        bgcolor: alpha(sevColor, 0.18), flexShrink: 0 }}>
        <Typography sx={{ fontSize: "8px", fontWeight: 600, color: sevColor,
          textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.2 }}>
          {module}
        </Typography>
      </Box>
    </Stack>
    {/* DTC message */}
    <Typography sx={{ fontSize: "9px", color: "text.secondary", lineHeight: "11px" }}
      noWrap title={dtcMessage}>
      {dtcMessage}
    </Typography>
  </Box>

  {/* Relative time */}
  <Typography sx={{ fontSize: "9px", color: "text.secondary",
    whiteSpace: "nowrap", flexShrink: 0 }}>
    {relativeTime}
  </Typography>
</Stack>
```

Overflow footer (when `alertTotal > displayed.length`):
```tsx
<Box onClick={() => navigate("/alerts")}
  sx={{ mt: 0.4, textAlign: "center", cursor: "pointer", flexShrink: 0 }}>
  <Typography sx={{ fontSize: "8px", color: "text.secondary", fontWeight: 600,
    "&:hover": { color: "text.primary" } }}>
    +{alertTotal - displayed.length} more unread alerts
  </Typography>
</Box>
```

---

## 9. Status Badges

### Pill Badge (used in tables, popovers)
```tsx
<Box sx={{
  display: "inline-flex", alignItems: "center", gap: 0.6,
  px: 1, py: 0.4, borderRadius: 5,
  bgcolor: alpha(statusColor, isDark ? 0.18 : 0.1),
  border: `1px solid ${alpha(statusColor, 0.25)}`,
}}>
  <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: statusColor, flexShrink: 0 }} />
  <Typography sx={{ fontSize: "10px", fontWeight: 700, color: statusColor }}>
    {label}
  </Typography>
</Box>
```

### MUI Chip (fleet list table)
```tsx
<Chip label={meta.label} size="small" sx={{
  width: 76, height: 22,
  color: meta.color,
  bgcolor: alpha(meta.color, 0.15),
  fontWeight: 800, fontSize: 11,
}} />
```

### Health Status Badge (table)
```tsx
<Box sx={{
  display: "inline-flex", alignItems: "center", gap: 0.6,
  px: 1, py: 0.4, borderRadius: 2,
  bgcolor: alpha(hs.color, isDark ? 0.15 : 0.1),
  border: `1px solid ${alpha(hs.color, 0.25)}`,
}}>
  <HealthIcon sx={{ fontSize: 12, color: hs.color, flexShrink: 0 }} />
  <Typography sx={{ fontSize: "10px", fontWeight: 700, color: hs.color }}>{hs.label}</Typography>
</Box>
```

---

## 10. Distribution Bar Row

Used in "Fleet Status Distribution" card:

```tsx
<Stack direction="row" spacing={1} alignItems="center" sx={{ minHeight: 20 }}>
  <Typography sx={{ width: 66, fontSize: 12 }}>{label}</Typography>
  <LinearProgress variant="determinate" value={(count / total) * 100} sx={{
    flex: 1, height: 9, borderRadius: 2,
    bgcolor: alpha(color, 0.12),
    ".MuiLinearProgress-bar": { bgcolor: color, borderRadius: 2 },
  }} />
  <Typography sx={{ width: 72, textAlign: "right", fontSize: 12 }}>
    {count}{" "}
    <Box component="span" sx={{ color, fontSize: 11 }}>
      ({Math.round((count / total) * 100)}%)
    </Box>
  </Typography>
</Stack>
```

Health / score progress bar (in popovers):
```tsx
<LinearProgress variant="determinate" value={score} sx={{
  height: 5, borderRadius: 3,
  bgcolor: isDark ? "#1e293b" : "#e2e8f0",
  "& .MuiLinearProgress-bar": { bgcolor: scoreColor, borderRadius: 3 },
}} />
```

---

## 11. Driver Avatar

Deterministic color from driver name, initials inside:

```tsx
function getAvatarColor(name: string): string {
  const colors = ["#3b82f6","#8b5cf6","#ec4899","#f59e0b","#10b981","#06b6d4","#f97316","#6366f1"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getDriverInitials(name: string): string {
  if (!name || name === "Unassigned") return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].charAt(0).toUpperCase()
    : (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Table size (30×30)
<Box sx={{ width: 30, height: 30, borderRadius: "50%", bgcolor: avatarBg,
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
  <Typography sx={{ fontSize: "10px", fontWeight: 700, color: "#fff", lineHeight: 1 }}>
    {initials}
  </Typography>
</Box>

// Small size (22×22), fontSize 8px for popovers
```

---

## 12. Legend Item

Clickable row inside map legend overlay:

```tsx
<Stack direction="row" justifyContent="space-between" alignItems="center" onClick={onClick}
  sx={{
    px: 0.75, py: 0.35, borderRadius: 1, cursor: "pointer", transition: "all .2s",
    bgcolor: selected ? "action.selected" : "transparent",
    "&:hover": { bgcolor: "action.hover" },
  }}>
  <Stack direction="row" spacing={0.75} alignItems="center">
    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
    <Typography fontSize={11}>{label}</Typography>
  </Stack>
  <Typography fontWeight={600} fontSize={11}>{value}</Typography>
</Stack>
```

---

## 13. Fleet Table

### Table Container / Header Bar
```tsx
<Paper elevation={0} sx={{
  border: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
  borderRadius: 2, overflow: "hidden",
  bgcolor: isDark ? "#0f172a" : "#ffffff",
}}>
  <Box sx={{
    display: "flex", justifyContent: "space-between", alignItems: "center",
    px: 2, py: 1.5,
    borderBottom: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
  }}>
    <Box>
      <Typography sx={{ fontSize: "14px", fontWeight: 700, lineHeight: 1.3 }}>Fleet Table</Typography>
      <Typography sx={{ fontSize: "11px", color: "text.secondary", mt: 0.25 }}>
        Real-time overview of all active and in-service vehicles
      </Typography>
    </Box>
    <Stack direction="row" spacing={1.5} alignItems="center">
      {/* Count pill */}
      <Box sx={{ px: 1.25, py: 0.4, borderRadius: 5,
        bgcolor: alpha("#3b82f6", isDark ? 0.15 : 0.08),
        border: `1px solid ${alpha("#3b82f6", 0.25)}` }}>
        <Typography sx={{ fontSize: "11px", fontWeight: 700, color: "#3b82f6" }}>
          {count} Vehicles
        </Typography>
      </Box>
      {/* Search */}
      <TextField size="small" placeholder="Search vehicle / driver / route…" sx={{
        width: 260,
        "& .MuiOutlinedInput-root": {
          height: 32, borderRadius: 2, fontSize: "12px",
          bgcolor: isDark ? "#1e293b" : "#f8fafc",
          "& fieldset": { borderColor: isDark ? "#334155" : "#e2e8f0" },
          "&:hover fieldset": { borderColor: isDark ? "#475569" : "#cbd5e1" },
          "&.Mui-focused fieldset": { borderColor: "#3b82f6" },
        },
        "& .MuiOutlinedInput-input": { py: 0, px: 0, fontSize: "12px" },
        "& input::placeholder": { fontSize: "12px", opacity: 1 },
      }} />
    </Stack>
  </Box>
```

### Table Header Cell
```tsx
<TableCell sx={{
  bgcolor: isDark ? "#1e293b" : "#f8fafc",
  color: isDark ? "#94a3b8" : "#64748b",
  fontWeight: 600, fontSize: "11px", letterSpacing: ".04em",
  borderBottom: `2px solid ${isDark ? "#334155" : "#e2e8f0"}`,
  py: 1.25, px: 1.5, whiteSpace: "nowrap",
  cursor: col.sortable ? "pointer" : "default",
  "&:hover": col.sortable ? { bgcolor: isDark ? "#263044" : "#f1f5f9" } : {},
}}>
  <Stack direction="row" alignItems="center" spacing={0.4}>
    <span>{col.label}</span>
    {col.sortable && (
      <Box component="span" sx={{ fontSize: "10px",
        opacity: orderBy === col.id ? 1 : 0.45,
        color: orderBy === col.id ? (isDark ? "#60a5fa" : "#3b82f6") : "inherit" }}>
        {orderBy === col.id ? (order === "asc" ? "↑" : "↓") : <UnfoldMoreIcon sx={{ fontSize: 12 }} />}
      </Box>
    )}
  </Stack>
</TableCell>
```

### Table Body Row
```tsx
// Alternating row backgrounds:
const rowBg = isDark
  ? rowIdx % 2 === 0 ? "#0f172a" : "#111827"
  : rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc";

<TableRow hover sx={{
  bgcolor: rowBg,
  borderBottom: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
  "&:hover": { bgcolor: `${alpha("#3b82f6", isDark ? 0.1 : 0.05)} !important` },
  transition: "background-color 0.15s",
}}>
  <TableCell sx={{ py: 1, px: 1.5, height: 58, whiteSpace: "nowrap" }}>
    ...cell content...
  </TableCell>
```

### Table Cell Patterns

**Vehicle name cell:**
```tsx
<Box>
  <Typography sx={{ fontSize: "12px", fontWeight: 700,
    color: isDark ? "#22d3ee" : "#0891b2", lineHeight: 1.25 }}>
    {name.toUpperCase()}
  </Typography>
  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.3 }}>
    <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: statusColor }} />
    <Typography sx={{ fontSize: "9px", color: "text.secondary" }}>{statusLabel}</Typography>
  </Stack>
</Box>
```

**Driver score cell:**
```tsx
<Box sx={{ width: 90 }}>
  <Box sx={{ width: "100%", height: "5px", borderRadius: "999px",
    overflow: "hidden", bgcolor: isDark ? "#1e293b" : "#e2e8f0" }}>
    <Box sx={{ width: `${driverScore}%`, height: "100%",
      borderRadius: "999px", bgcolor: scoreColor }} />
  </Box>
  <Typography sx={{ fontSize: "10px", fontWeight: 700, color: scoreColor, mt: 0.4 }}>
    {driverScore}
  </Typography>
</Box>
```

**Type cell (icon + label):**
```tsx
<Stack direction="row" spacing={0.75} alignItems="center">
  <Box sx={{ width: 28, height: 26, borderRadius: 1.5,
    display: "grid", placeItems: "center",
    bgcolor: alpha("#64748b", isDark ? 0.2 : 0.1),
    border: `1px solid ${alpha("#64748b", 0.2)}`,
    color: isDark ? "#94a3b8" : "#475569" }}>
    {getVehicleTypeIcon(type)}  {/* fontSize: 14 */}
  </Box>
  <Typography sx={{ fontSize: "11px", fontWeight: 500, textTransform: "capitalize" }} noWrap>
    {type}
  </Typography>
</Stack>
```

### Pagination Footer
```tsx
<Box sx={{
  display: "grid", gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center", px: 2, py: 1.25,
  borderTop: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
  bgcolor: isDark ? "#0f172a" : "#ffffff",
}}>
  {/* Left: row count */}
  <Typography sx={{ fontSize: "12px", color: "text.secondary", fontWeight: 500 }}>
    Showing <Box component="span" sx={{ fontWeight: 700, color: isDark ? "#e2e8f0" : "#1e293b" }}>
      {shownCount}
    </Box> of <Box component="span" sx={{ fontWeight: 700, color: isDark ? "#e2e8f0" : "#1e293b" }}>
      {totalCount}
    </Box> active vehicles
  </Typography>

  {/* Center: MUI Pagination */}
  <Pagination shape="rounded" siblingCount={1} boundaryCount={1} sx={{
    "& .MuiPaginationItem-root": {
      fontSize: "12px",
      color: isDark ? "#94a3b8" : "#64748b",
      backgroundColor: isDark ? "#1e293b" : "transparent",
      border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
      "&:hover": { backgroundColor: isDark ? "#334155" : undefined },
      "&.Mui-selected": { backgroundColor: "#3b82f6", color: "#fff", borderColor: "#3b82f6",
        "&:hover": { backgroundColor: "#2563eb" } },
      "&.MuiPaginationItem-ellipsis": { backgroundColor: "transparent", border: "none" },
    },
  }} />

  {/* Right: rows per page */}
  <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
    <Typography sx={{ fontSize: "11px", color: "text.secondary", whiteSpace: "nowrap" }}>
      Rows per page
    </Typography>
    <Select size="small" sx={{
      fontSize: "11px", height: 28,
      "& .MuiSelect-select": { py: 0, px: 1, fontSize: "11px" },
      "& .MuiOutlinedInput-notchedOutline": { borderColor: isDark ? "#334155" : "#e2e8f0" },
      bgcolor: isDark ? "#1e293b" : "#f8fafc",
      color: isDark ? "#e2e8f0" : "#1e293b",
    }}>
      {[5, 10, 25, 50].map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
    </Select>
  </Stack>
</Box>
```

---

## 14. ECharts Configuration

### Standard Tooltip
```ts
tooltip: {
  trigger: "axis",  // or "item" for pie/scatter
  backgroundColor: isDark ? "#1e293b" : "#ffffff",
  borderColor: isDark ? "#334155" : "#e2e8f0",
  borderWidth: 1,
  borderRadius: 8,
  padding: [8, 12],
  textStyle: {
    fontSize: 10,
    color: isDark ? "#e2e8f0" : "#1e293b",
    fontFamily: CHART_FONT,
  },
}
```

### Standard Grid
```ts
// Default (full-width charts)
grid: { top: 24, left: 22, right: 20, bottom: 72, containLabel: true }

// Timeline / health charts
grid: { top: 18, left: 34, right: 16, bottom: 28 }

// Behavior tab charts
grid: { top: 20, right: 10, bottom: 30, left: 40 }
```

### Common Axes
```ts
// X-axis (category)
xAxis: {
  type: "category",
  axisLabel: {
    fontSize: 10, fontFamily: CHART_FONT,
    color: isDark ? "#8a9bb0" : "#616161", margin: 14,
  },
  axisTick: { show: false },
  axisLine: { lineStyle: { color: isDark ? "#2a3a4a" : "#c5c5c5", width: 1 } },
  splitLine: {
    show: true,
    lineStyle: { color: isDark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)" },
  },
}

// Y-axis (value, 0–100 health)
yAxis: {
  type: "value", min: 0, max: 100, interval: 20,
  axisLabel: {
    fontSize: 10, fontFamily: CHART_FONT,
    color: isDark ? "#8a9bb0" : "#616161",
    formatter: "{value}%", margin: 10,
  },
  axisTick: { show: false },
  axisLine: { show: false },
  splitLine: {
    lineStyle: {
      color: isDark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.07)",
      type: "dashed",
    },
  },
}
```

### Line / Area Series
```ts
{
  type: "line",
  smooth: true,
  symbol: "none",
  lineStyle: { color: "#3b82f6", width: 2 },
  itemStyle: { color: "#3b82f6" },
  areaStyle: {
    color: {
      type: "linear", x: 0, y: 0, x2: 0, y2: 1,
      colorStops: [
        { offset: 0, color: "rgba(59,130,246,0.18)" },
        { offset: 1, color: "rgba(59,130,246,0.02)" },
      ],
    },
  },
}
```

### Mark Lines (health thresholds)
```ts
markLine: {
  silent: true,
  symbol: ["none", "none"],
  lineStyle: { width: 1.5, type: "dashed", opacity: 0.7 },
  label: { fontSize: 10, fontFamily: CHART_FONT, fontWeight: 600 },
  data: [
    {
      yAxis: 60,
      label: { formatter: "CRITICAL", color: "#ef4444", position: "insideStartTop" },
      lineStyle: { color: "#ef4444" },
    },
    {
      yAxis: 80,
      label: { formatter: "WARNING", color: "#f59e0b", position: "insideStartTop" },
      lineStyle: { color: "#f59e0b" },
    },
  ],
}
```

### Mark Areas (health zones)
```ts
markArea: {
  silent: true,
  data: [
    [{ yAxis: 0, itemStyle: { color: isDark ? "rgba(239,68,68,.03)" : "rgba(239,68,68,.025)" } }, { yAxis: 60 }],
    [{ yAxis: 60, itemStyle: { color: isDark ? "rgba(245,158,11,.025)" : "rgba(245,158,11,.02)" } }, { yAxis: 80 }],
  ],
}
```

### Data Zoom
```ts
dataZoom: [
  { type: "inside", filterMode: "none" },
  {
    type: "slider",
    bottom: 10, height: 22, filterMode: "none",
    showDetail: false, moveHandleSize: 8, handleSize: "90%",
    borderColor: "transparent",
    fillerColor: alpha("#3b82f6", 0.12),
    backgroundColor: "transparent",
    textStyle: { fontSize: 10, fontFamily: CHART_FONT },
  },
]
```

### Scatter Series
```ts
{
  type: "scatter",
  symbolSize: 4,
  itemStyle: { opacity: 0.85, borderWidth: 0 },
}
```

### Score Gauge (driver / fleet score, standalone widget)
```ts
{
  type: "gauge",
  startAngle: 220, endAngle: -40,
  min: 0, max: 100,
  pointer: { show: false },
  progress: { show: true, overlap: false, roundCap: true, width: 10, itemStyle: { color } },
  axisLine: { lineStyle: { width: 10, color: [[1, isDark ? "#1e293b" : "#e5e7eb"]] } },
  axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
  title: { show: true, offsetCenter: [0, "65%"], fontSize: 10, color: isDark ? "#64748b" : "#999" },
  detail: { valueAnimation: true, fontSize: 22, fontWeight: 700, offsetCenter: [0, "15%"], color },
  data: [{ value: Math.round(score), name: label }],
}
// widget size: width: 140, height: 120
```

### Health Gauge (inside vehicle popover)
```ts
{
  type: "gauge",
  startAngle: 210, endAngle: -30,
  radius: "82%", center: ["50%", "68%"],
  progress: { show: true, width: 10, roundCap: true, itemStyle: { color } },
  axisLine: { roundCap: true, lineStyle: { width: 10, color: [[1, isDark ? "#374151" : "#E5E7EB"]] } },
  detail: {
    fontSize: 14, fontWeight: 700, offsetCenter: [0, "8%"],
    color: isDark ? "#fff" : "#1f2937", formatter: "{value}%",
  },
  axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
  anchor: { show: false }, title: { show: false }, pointer: { show: false },
}
// container: height: 110
```

### Donut Pie Chart
```ts
{
  type: "pie",
  radius: ["55%", "80%"], center: ["50%", "50%"],
  avoidLabelOverlap: false,
  itemStyle: {
    borderRadius: 0,
    borderColor: isDark ? "#1a2535" : "#fff",
    borderWidth: 2,
  },
  label: { show: false }, labelLine: { show: false },
  emphasis: { scale: true, label: { show: false } },
}
```

### Radar Chart
```ts
radar: { indicator: [...], radius: 50, name: { textStyle: { fontSize: 8 } } }
series: [{
  type: "radar",
  data: [{
    areaStyle: { color: alpha("#ef4444", 0.2) },
    lineStyle: { color: "#ef4444" },
    itemStyle: { color: "#ef4444" },
  }],
}]
```

### Boxplot Chart
```ts
{ type: "boxplot", itemStyle: { color: "#3b82f6", borderColor: "#2563eb" } }
```

---

## 15. SVG Mini-Charts

These are inline SVG components rendered in table cells — no ECharts dependency.

### SpeedGauge (semi-arc, table cell)
```tsx
function SpeedGauge({ speed, isDark }) {
  const r = 15, cx = 19, cy = 19;
  const halfLen = Math.PI * r;
  const pct = Math.min(speed / 120, 1);
  const color = speed > 90 ? "#ef4444" : speed > 60 ? "#f59e0b" : "#22c55e";
  const trackColor = isDark ? "#1e293b" : "#e2e8f0";
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={38} height={22} style={{ overflow: "visible" }}>
        <path d={arcPath} fill="none" stroke={trackColor} strokeWidth={3} strokeLinecap="round" />
        <path d={arcPath} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round"
          strokeDasharray={`${pct * halfLen} ${halfLen}`} />
      </svg>
      <Typography sx={{ fontSize: "10px", fontWeight: 800, color, lineHeight: 1.1, mt: "-1px" }}>
        {speed}
      </Typography>
      <Typography sx={{ fontSize: "7px", color: "text.secondary", lineHeight: 1 }}>km/h</Typography>
    </Box>
  );
}
```

### HealthRing (circle, table cell)
```tsx
function HealthRing({ score, isDark }) {
  const r = 13, cx = 18, cy = 18;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(score / 100, 1);
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <Box sx={{ position: "relative", width: 36, height: 36,
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={36} height={36} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={isDark ? "#1e293b" : "#e2e8f0"} strokeWidth={3} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={`${pct * circ} ${(1 - pct) * circ}`} strokeLinecap="round" />
      </svg>
      <Typography sx={{ fontSize: "9px", fontWeight: 800, zIndex: 1, color, lineHeight: 1 }}>
        {score}%
      </Typography>
    </Box>
  );
}
```

---

## 16. Leaflet Map

### Map Container Setup
```tsx
<MapContainer
  center={[22.9937, 78.9629]}  // India centroid
  zoom={4} minZoom={2} maxZoom={19}
  maxBounds={[[-90, -180], [90, 180]]}
  maxBoundsViscosity={1.0}
  worldCopyJump={false}
  zoomControl={true}
  attributionControl={false}
  preferCanvas={true}
  style={{ width: "100%", height: "100%" }}
>
  <TileLayer
    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
    keepBuffer={6}
    updateWhenZooming={false}
    updateWhenIdle={true}
  />
```

### Dark Mode Tile Filter
Apply to the map's Paper wrapper:
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

### Route Polylines
```tsx
// Completed route
<Polyline positions={completedRoute}
  pathOptions={{ color: "#22c55e", weight: 4, opacity: 0.9 }} />

// Remaining route (dashed)
<Polyline positions={remainingRoute}
  pathOptions={{ color: "#6b7280", weight: 2, opacity: 0.5, dashArray: "8 6" }} />
```

### Vehicle DivIcon
```ts
// Outer circle colors by status:
active:     outerColor = "#16A34A"
parked:     outerColor = "#2563EB"
in_service: outerColor = "#7C3AED"
default:    outerColor = "#6B7280"

// Inner dot color by health:
health >= 80 → "#10B981"
health >= 50 → "#F59E0B"
health < 50  → "#EF4444"

// Size:
active: outerSize = 20px, innerSize = 8px
others: outerSize = 18px, innerSize = 7px
total:  outerSize + 14px

// Active vehicles get:
// 1. CSS pulse ring animation (@keyframes vc-ping)
// 2. SVG heading arrow above the circle (rotated to vehicle heading)

// Box shadow on outer circle:
"0 0 0 1.5px rgba(255,255,255,0.9), 0 2px 7px rgba(0,0,0,0.45)"
```

### Event Marker DivIcon
```ts
// Event types + colors + labels:
braking:   color="#ef4444"  label="B"
accel:     color="#22c55e"  label="A"
cornering: color="#f59e0b"  label="C"

// iconSize: [20, 28], iconAnchor: [10, 28]
// Structure: circle (20×20) + downward triangle pointer
html: `
<div style="display:flex;flex-direction:column;align-items:center;width:20px">
  <div style="width:20px;height:20px;border-radius:50%;background:${c};border:2px solid rgba(255,255,255,0.9);
    display:flex;align-items:center;justify-content:center;">
    <span style="color:white;font-size:10px;font-weight:800;
      font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;line-height:1;">${label}</span>
  </div>
  <div style="width:0;height:0;border-left:5px solid transparent;
    border-right:5px solid transparent;border-top:8px solid ${c};margin-top:-1px;"></div>
</div>
`
// NO box-shadow on event markers (shadow removed — it looked bad)
```

### Map Legend Overlay
```tsx
<Paper elevation={0} sx={{
  position: "absolute", bottom: 16, left: 16, zIndex: 1000,
  px: 1, py: 0.75, borderRadius: 1.5,
  bgcolor: isDark ? "#0f172a" : "#ffffff",
  backgroundImage: "none",
  border: `1px solid ${isDark ? "#1e293b" : theme.palette.divider}`,
  minWidth: 148, isolation: "isolate", filter: "none",
}}>
```

### Zoom-Adaptive Event Deduplication
```ts
const precision =
  zoom >= 12 ? 200 :
  zoom >= 10 ? 80  :
  zoom >= 9  ? 30  :
  zoom >= 8  ? 15  : 7;
// Key: `${(lat * precision).toFixed(0)}_${(lng * precision).toFixed(0)}`
```

---

## 17. Loading & Empty States

### Card-Level Loading (centered spinner)
```tsx
<Stack alignItems="center" justifyContent="center" flex={1}>
  <CircularProgress size={18} />
</Stack>
```

### Card-Level Empty State
```tsx
<Stack alignItems="center" justifyContent="center" flex={1}>
  <Typography sx={{ fontSize: "12px", color: "text.secondary", fontWeight: 500 }}>
    No data yet
  </Typography>
  <Typography sx={{ fontSize: "10px", color: "text.disabled" }}>
    Descriptive subtitle explaining why
  </Typography>
</Stack>
```

### Chart-Level Empty State
```tsx
<Box sx={{ height: "100%", display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", gap: 0.5 }}>
  <Typography sx={{ fontSize: "12px", color: "text.secondary", fontWeight: 500 }}>
    No pipeline data yet
  </Typography>
  <Typography sx={{ fontSize: "10px", color: "text.disabled" }}>
    Data will appear once the pipeline is active
  </Typography>
</Box>
```

---

## 18. Form Controls

### Search TextField
```tsx
<TextField size="small" placeholder="Search vehicle / driver / route…" sx={{
  width: 260,
  "& .MuiOutlinedInput-root": {
    height: 28, borderRadius: 2, fontSize: "12px",
    bgcolor: isDark ? "#1e293b" : "#f8fafc",
    "& fieldset": { borderColor: isDark ? "#334155" : "#e2e8f0" },
    "&:hover fieldset": { borderColor: isDark ? "#475569" : "#cbd5e1" },
    "&.Mui-focused fieldset": { borderColor: "#3b82f6" },
  },
  "& .MuiOutlinedInput-input": { py: 0, px: 0, fontSize: "12px" },
  "& input::placeholder": { fontSize: "12px", opacity: 1 },
}} InputProps={{ startAdornment: <SearchOutlinedIcon sx={{ fontSize: 16, mr: 0.8, color: "text.secondary" }} /> }} />
```

### Select (compact)
```tsx
<Select size="small" value={value} onChange={...} sx={{
  height: 28, fontSize: "10px", fontWeight: 700,
  borderRadius: 1, minWidth: 120,
  "& .MuiSelect-select": { py: "4px" },
  "& .MuiOutlinedInput-notchedOutline": { borderColor: isDark ? "#334155" : "#e2e8f0" },
  bgcolor: isDark ? "#1e293b" : "#f8fafc",
  color: isDark ? "#e2e8f0" : "#1e293b",
}}>
  <MenuItem value="x" sx={{ fontSize: "10px" }}>Option</MenuItem>
</Select>
```

### ToggleButtonGroup — Generic (inline filter, small)
```tsx
<ToggleButtonGroup value={value} exclusive onChange={...} size="small">
  <ToggleButton value="a" sx={{ fontWeight: 700, px: 1.25, fontSize: "9px", height: 28, py: 0 }}>
    LABEL
  </ToggleButton>
</ToggleButtonGroup>
```

### ToggleButtonGroup — Page Tab Switcher (header-level navigation)

Used in the page header to switch between major views (e.g., Operations Metrics / Data Inspector / Live Stream Monitor). Styled as a refined segmented control — minimal container, elevated selected state, no colored highlight fog.

```tsx
<ToggleButtonGroup
  value={viewMode}
  exclusive
  onChange={(_e, val) => val && setViewMode(val)}
  size="small"
  sx={{
    bgcolor: isDark ? alpha("#020c16", 0.7) : alpha("#dde6ef", 0.6),
    borderRadius: "10px",
    border: `1px solid ${isDark ? alpha("#7dd3fc", 0.08) : alpha("#94a3b8", 0.2)}`,
    p: "3px",
    "& .MuiToggleButtonGroup-grouped": {
      border: "none !important",
      borderRadius: "7px !important",
    },
    "& .MuiToggleButton-root": {
      py: "5px",
      px: "14px",
      fontSize: "10px",
      fontWeight: 600,
      lineHeight: 1,
      textTransform: "none",
      letterSpacing: "0.015em",
      whiteSpace: "nowrap",
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
  }}
>
  <ToggleButton value="operations">Operations Metrics</ToggleButton>
  <ToggleButton value="inspector">Data Inspector</ToggleButton>
  <ToggleButton value="live">Live Stream Monitor</ToggleButton>
</ToggleButtonGroup>
```

**Design decisions:**

| Token | Dark | Light | Reason |
|---|---|---|---|
| Container bg | `alpha("#020c16", 0.7)` | `alpha("#dde6ef", 0.6)` | Near-black / muted slate — reads as a distinct control track |
| Container border | `alpha("#7dd3fc", 0.08)` | `alpha("#94a3b8", 0.20)` | Present but near-invisible |
| Container radius | `10px` | `10px` | Tight pill, not bubbly |
| Selected bg | `#0d2137` | `#ffffff` | Deep navy / pure white — elevated, not colored |
| Selected shadow | black drop + sky-blue 1px ring at 6% | two-layer drop shadow | Lifted feel without color bleed |
| Selected text | `#f1f5f9` / `fontWeight 700` | `#0f172a` / `fontWeight 700` | Full contrast, bolder than unselected |
| Unselected text | `alpha("#94a3b8", 0.8)` | `#64748b` | Slate — clearly secondary, no background |
| Hover | `alpha("#7dd3fc", 0.05)` | `alpha("#94a3b8", 0.12)` | Subtle acknowledgment only |
| Tab padding | `py: "5px", px: "14px"` | same | Comfortable click target |
| Transition | `0.15s` | same | Snappy, not sluggish |

**Rules:**
- Never use a colored fill (e.g., `alpha("#7dd3fc", 0.14)`) as the selected state — it reads as a highlighted fog, not an active tab
- `whiteSpace: "nowrap"` prevents tab labels from wrapping at narrow widths
- Guard `onChange` with `val && setViewMode(val)` to prevent deselecting all tabs on re-click

### Notification IconButton
```tsx
<IconButton size="small" sx={{
  width: 28, height: 28,
  border: "1px solid", borderColor: "divider", borderRadius: 2,
}}>
  <NotificationsNoneOutlinedIcon sx={{ fontSize: 20 }} />
</IconButton>
```

---

## 19. Tabs (inside popovers/panels)

```tsx
<Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{
  minHeight: 25, height: 25,
  bgcolor: isDark ? "#0f172a" : "#EEF9FD",
  borderBottom: `1px solid ${isDark ? "#1e293b" : "#CDECF5"}`,
  "& .MuiTabs-flexContainer": { height: 30 },
  "& .MuiTab-root": {
    flex: 1, minHeight: 25, height: 25, minWidth: 0,
    py: 0, px: 1, fontSize: "10px", fontWeight: 700,
    color: isDark ? "#64748b" : "#4A6B77",
    bgcolor: isDark ? "#111827" : "#EAF7FB",
    transition: "all .2s ease", textTransform: "none",
  },
  "& .MuiTab-root:not(:last-child)": {
    borderRight: `1px solid ${isDark ? "#1e293b" : "#D6EEF6"}`,
  },
  "& .Mui-selected": {
    bgcolor: isDark ? "#1e293b" : "#DCF3FA",
    color: isDark ? "#38bdf8" : "#005071",
  },
  "& .MuiTabs-indicator": {
    height: 3,
    backgroundColor: isDark ? "#0ea5e9" : "#8FCFE3",
  },
}}>
  <Tab label="TRIP" />
  <Tab label="BEHAVIOR" />
</Tabs>
```

---

## 20. Vehicle Detail Popover

Floating draggable panel on map marker click.

### Popover slotProps.paper
```tsx
slotProps={{
  paper: {
    sx: {
      width: selectedIsActive ? "36%" : 310,
      maxWidth: selectedIsActive ? "36%" : 310,
      minHeight: selectedIsActive ? 380 : "auto",
      maxHeight: "95vh",
      overflow: "auto",
      borderRadius: 3,
      boxShadow: 12,
      bgcolor: "background.paper",
      // Global typography override inside popover:
      "& .MuiTypography-root": { fontSize: "10px" },
      "& .MuiTab-root": { fontSize: "10px !important" },
      "& .MuiChip-label": { fontSize: "10px" },
    },
  },
}}
```

### Active Vehicle Header (blue info panel)
```tsx
<Box sx={{
  minWidth: 170, maxWidth: 170,
  bgcolor: "#005071", color: "#fff",
  px: 1, py: 0.8, borderRadius: 2,
  display: "flex", flexDirection: "column", justifyContent: "center", gap: 0.15,
}}>
  <Typography sx={{ fontSize: "14px !important", fontWeight: 800, mb: 0.4, whiteSpace: "nowrap" }}>
    {name.toUpperCase()}
  </Typography>
  {/* Key/value pairs: width 75 label, flex 1 value, both fontSize 10px */}
</Box>
```

### Module Health Mini-Tiles (active vehicle, 3×2 grid)
```tsx
// Outer grid: gridTemplateColumns: "repeat(3,minmax(70px,1fr))", gridAutoRows: "44px", gap: 0.6
<Paper elevation={0} sx={{
  borderRadius: 2,
  border: `1px solid ${alpha(healthColor(val), 0.25)}`,
  display: "flex", flexDirection: "column",
  justifyContent: "center", alignItems: "center",
}}>
  <Typography sx={{ color: healthColor(val), lineHeight: 1, fontSize: "14px !important", fontWeight: 700 }}>
    {val.toFixed(0)}
  </Typography>
  <Typography sx={{ fontSize: "8px !important", mt: 1 }}>
    {mod.toUpperCase()}
  </Typography>
</Paper>
```

### Section Dividers (popover sections)
```ts
borderBottom: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`
// Each section: px: 1.5, py: 1.25
```

---

## 21. Expand Dialog

Standard pattern for full-screen chart expansion:

```tsx
<Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xl">
  <Box sx={{
    px: 2, py: 1.5,
    display: "flex", justifyContent: "space-between", alignItems: "center",
    borderBottom: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
  }}>
    <Typography sx={{ fontSize: "14px", fontWeight: 700 }}>Chart Title</Typography>
    <IconButton onClick={() => setOpen(false)} size="small">
      <CloseIcon fontSize="small" />
    </IconButton>
  </Box>
  <DialogContent sx={{ height: "85vh" }}>
    <ReactECharts style={{ width: "100%", height: "100%" }} option={chartOption} />
  </DialogContent>
</Dialog>
```

---

## 22. Layout Grid Patterns

### Top KPI Row (8 cards)
```tsx
<Box sx={{
  display: "grid",
  gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", lg: "repeat(8,1fr)" },
  gap: 1,
}}>
```

### Main Section (map + right panel + sidebar)
```tsx
<Box sx={{
  display: "grid",
  gridTemplateColumns: { xs: "1fr", xl: "1.9fr 1fr 0.8fr" },
  gap: 1, alignItems: "stretch",
}}>
```

### Right Panel (2×2 grid: health, AI, alerts, metrics)
```tsx
<Box sx={{
  display: "grid", gap: 1, width: "100%", height: "345px",
  gridTemplateColumns: "repeat(2, minmax(0,1fr))",
  gridTemplateRows: "165px 1fr",
}}>
```

### Chart Row (2 equal columns)
```tsx
<Grid container spacing={1}>
  <Grid item xs={12} md={6}>...</Grid>
  <Grid item xs={12} md={6}>...</Grid>
</Grid>
```

### Operational Metrics Grid (3×2 tiles)
```tsx
<Box sx={{
  flex: 1, overflow: "hidden", display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gridTemplateRows: "repeat(2, 1fr)",
  gap: 0.5,
}}>
```

---

## 23. Spacing Conventions

| Token | MUI value | px | Used for |
|---|---|---|---|
| Page padding | `p: 0.5` | 4px | Outer page wrapper |
| Card padding | `p: 1` | 8px | Card content (standard) |
| Card padding wide | `p: 1.4` | 11px | Content-heavy cards |
| Gap between sections | `gap: 1` / `spacing={1}` | 8px | Grid and Stack between major sections |
| Gap between dense items | `gap: 0.5` | 4px | Alert rows, metric tiles |
| Gap extra dense | `gap: 0.25` | 2px | Sub-elements inside tiles |
| Table cell | `py: 1, px: 1.5` | 8px / 12px | Standard table cell |
| Table header | `py: 1.25, px: 1.5` | 10px / 12px | Header cells |
| Popover section | `px: 1.5, py: 1.25` | 12px / 10px | Panel section padding |
| Dialog header | `px: 2, py: 1.5` | 16px / 12px | Expand dialog |

---

## 24. Icon Size Conventions

| Context | `fontSize` |
|---|---|
| KpiCard icon (inside 38px circle) | default (24px) |
| SectionTitle action (refresh/expand) | `14–15px` |
| Table type icon | `14px` |
| Table location/route icon | `13px` |
| Status warning icon in bars | `10px` |
| Search input adornment | `16px` |
| Close button | `16px` (CloseIcon `fontSize="small"`) |
| ToggleButton icon | — |
| Chart embedded icon | `9–12px` |

### Vehicle Type Icon Mapping
```ts
truck / lorry  → LocalShippingOutlinedIcon
van / shuttle  → AirportShuttleOutlinedIcon
bus            → DirectionsBusFilledOutlinedIcon
bike / scooter → TwoWheelerOutlinedIcon
default        → DirectionsCarFilledOutlinedIcon
```

---

## 25. API Constants

```ts
const FLEET_API    = "http://127.0.0.1:8009/api/fleet";
const PIPELINE_API = "http://127.0.0.1:8005";
```

### Key Endpoints
| Endpoint | Used for |
|---|---|
| `GET /api/fleet/summary` | Fleet KPI counts, avg health |
| `GET /api/fleet/positions` | All vehicle positions, status, speed |
| `GET /api/fleet/vehicle/:id` | Single vehicle detail |
| `GET /api/fleet/vehicle/:id/trip` | Active trip route + events |
| `GET /api/fleet/vehicle/:id/behavior` | Driver score, traction, risk |
| `GET /api/automotive/fleet-summary` | Pipeline health scores per vehicle |
| `GET /api/automotive/vehicle-health-history/:id` | Health timeline |
| `GET /api/automotive/fleet-health-scatter` | Multi-vehicle scatter batch |
| `GET /api/alerts/metrics` | `active_alerts_count`, `open_alerts[]` |
| `GET /api/dtc/analyze` | DTC triggers for a vehicle+module+peak_ts |

---

## 26. Zustand Store (shared state)

```ts
// Cache key format
const key = `${source_id}|${module}|${peak_ts}`;

// Writing DTC result (from any page)
const { setDtcResult } = useStore();
setDtcResult(source_id, module, peak_ts, res.data.triggers ?? []);

// Writing alert candidates (from any page that loads alerts)
const { setAlertCandidates } = useStore();
setAlertCandidates(open_alerts as AlertCandidate[], total);

// Reading the alert pool in CockpitView
const { alertPool } = useStore();
const displayed = useMemo(() => pickFour(alertPool), [alertPool]);
```

DTC cache TTL: **5 minutes** (`DTC_CACHE_TTL_MS = 5 * 60 * 1000`)

---

## 28. AG Grid (ag-grid-react) Theming

### Critical: CSS Variables Go on the Box, Not the Card

All AG Grid theme overrides — **both CSS custom properties and selector overrides** — must be placed on `<Box className={agTheme}>`, not on the parent `<Card>`. Placing them on the Card works for simple selectors but CSS custom properties (`--ag-*`) only take effect when set on the theme container element itself.

```tsx
const agTheme = isDark ? "ag-theme-balham-dark" : "ag-theme-balham";

// ✅ Correct — CSS vars and selectors on the theme container
<Box className={agTheme} sx={agGridContainerSx}>
  <AgGridReact ... />
</Box>

// ❌ Wrong — CSS vars on Card do NOT reach the ag-theme container
<Card sx={{ ...agGridHeaderSx }}>
  <Box className={agTheme}>
    <AgGridReact ... />
  </Box>
</Card>
```

### agGridContainerSx — Complete Dark/Light Theme Object

Define this inside the component (requires `isDark`). Spread it into every `<Box className={agTheme}>`.

```tsx
const agGridContainerSx: object = {
  // Row and background colors via CSS custom properties
  "--ag-background-color": "transparent",  // lets card background show through
  "--ag-odd-row-background-color": isDark ? alpha("#7dd3fc", 0.04) : "#f8fafc",
  "--ag-row-hover-color": isDark ? alpha("#7dd3fc", 0.09) : alpha("#3b82f6", 0.05),
  "--ag-selected-row-background-color": isDark ? alpha("#3b82f6", 0.22) : alpha("#3b82f6", 0.1),
  "--ag-foreground-color": isDark ? "#e2e8f0" : "#0f172a",
  "--ag-data-color": isDark ? "#e2e8f0" : "#1f2937",
  "--ag-secondary-foreground-color": isDark ? "#94a3b8" : "#64748b",
  "--ag-border-color": isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1),
  "--ag-row-border-color": isDark ? alpha("#7dd3fc", 0.07) : alpha("#1f2937", 0.07),
  "--ag-input-focus-border-color": isDark ? alpha("#7dd3fc", 0.5) : alpha("#3b82f6", 0.5),
  // Header
  "& .ag-header": {
    backgroundColor: `${isDark ? "#0d2137" : "#1e3a5f"} !important`,
  },
  "& .ag-header-cell": {
    backgroundColor: `${isDark ? "#0d2137" : "#1e3a5f"} !important`,
    color: "#fff !important",
    fontSize: "11px !important",
    fontWeight: "700 !important",
    letterSpacing: "0.04em !important",
  },
  "& .ag-header-cell-label": { color: "#fff !important" },
  "& .ag-icon": { color: "#fff !important" },
  "& .ag-header-icon": { color: "#fff !important" },
  "& .ag-sort-ascending-icon": { color: "#fff !important" },
  "& .ag-sort-descending-icon": { color: "#fff !important" },
  "& .ag-sort-none-icon": { color: "#fff !important" },
  // Cell / row
  "& .ag-cell": { fontSize: "10px !important" },
  "& .ag-row": {
    fontSize: "10px !important",
    borderColor: `${isDark ? alpha("#7dd3fc", 0.07) : alpha("#1f2937", 0.08)} !important`,
  },
  "& .ag-root-wrapper": { borderRadius: "6px", border: "none !important" },
  "& .ag-root-wrapper-body": { borderRadius: "6px" },
};
```

### Dark Mode Row Visual Standard

`ag-theme-balham-dark` defaults to a hardcoded dark grey background (`#1E2021`) that clashes with the card's dark navy (`alpha("#0b1724", 0.9)`). Always override with the palette-tinted variables above. The correct dark-mode row appearance is:

| Row state | Color | Note |
|---|---|---|
| Even row | Transparent | Card background (#0b1724 90%) shows through |
| Odd row | `alpha("#7dd3fc", 0.04)` | Very subtle sky-blue tint — barely visible, no grey |
| Hover | `alpha("#7dd3fc", 0.09)` | Sky-blue tint, same hue as the border palette |
| Selected | `alpha("#3b82f6", 0.22)` | Distinct blue selection |
| Text | `#e2e8f0` | Slate-200, same as body text |
| Row border | `alpha("#7dd3fc", 0.07)` | Near-invisible sky-blue rule |

In **light mode**:

| Row state | Color |
|---|---|
| Even row | Transparent (white card) |
| Odd row | `#f8fafc` |
| Hover | `alpha("#3b82f6", 0.05)` |
| Text | `#1f2937` |

**Do not** use any grey (`#888`, `#333`, `rgba(0,0,0,…)`) for AG Grid row backgrounds — greys break the palette coherence against the navy card. Use sky-blue tints in dark mode, slate tints in light.

### domLayout for Fixed-Row Tables

When a table shows a known small number of rows (e.g., 5 pipeline modules), use `domLayout="autoHeight"` so the grid expands to show all rows without a scrollbar. Do **not** set `flex: 1, minHeight: 0` on the Box wrapper — the grid sizes itself.

```tsx
// ✅ All rows visible, no scroll
<Box className={agTheme} sx={agGridContainerSx}>
  <AgGridReact domLayout="autoHeight" rowData={data} ... />
</Box>

// ❌ Clips rows, forces a scrollbar
<Box className={agTheme} sx={{ flex: 1, minHeight: 0, ...agGridContainerSx }}>
  <AgGridReact rowData={data} ... />
</Box>
```

Use `flex: 1, minHeight: 0` (without `domLayout="autoHeight"`) only for tables with unbounded rows that should fill remaining card space (e.g., inspector/data tables).

### Cell Color Coding Pattern

```tsx
// Numeric column: red background on high value, green otherwise
cellStyle: (params: any): any => {
  if (params.value > 100) return {
    color: theme.palette.error.main,
    fontWeight: "bold",
    backgroundColor: isDark ? "rgba(239,68,68,0.18)" : "#fee2e2",
  };
  return { color: theme.palette.success.main };
},

// Status column: inline pill badge renderer
cellRenderer: (params: any) => {
  const color = params.value === "RUNNING" ? "#22c55e"
    : params.value === "STALLED" ? "#f59e0b" : "#ef4444";
  const bg = alpha(color, isDark ? 0.18 : 0.1);
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5,
      px: 0.8, py: "2px", borderRadius: 1,
      bgcolor: bg, border: `1px solid ${alpha(color, 0.25)}` }}>
      <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: color }} />
      <Typography sx={{ fontSize: "10px", fontWeight: 700, color, textTransform: "uppercase" }}>
        {params.value}
      </Typography>
    </Box>
  );
},
```

---

## 29. Recharts Configuration

### Standard Tooltip Style

```tsx
const tooltipStyle = {
  borderRadius: 4,
  fontSize: "11px",
  padding: "6px 10px",
  backgroundColor: isDark ? "#0f1e2e" : "#ffffff",
  border: `1px solid ${isDark ? alpha("#7dd3fc", 0.2) : alpha("#1f2937", 0.12)}`,
  color: isDark ? "#e2e8f0" : "#1f2937",
  boxShadow: isDark
    ? `0 8px 24px ${alpha("#000", 0.4)}`
    : `0 4px 16px ${alpha("#334155", 0.12)}`,
};
```

### Standard Axis Style

```tsx
const chartAxisStyle = {
  fontSize: "10px",
  fill: ct.axisColor,   // from useChartTheme()
  fontFamily: CHART_FONT,
};
```

### Cursor Override — Required on Every BarChart/LineChart

Recharts defaults to a solid grey rectangle on hover. Always override with a tinted fill:

```tsx
// ✅ Correct — subtle tinted overlay
<RechartsTooltip
  cursor={{ fill: isDark ? alpha("#7dd3fc", 0.08) : alpha("#3b82f6", 0.06) }}
  contentStyle={tooltipStyle}
/>

// ❌ Wrong — grey box appears on hover (Recharts default)
<RechartsTooltip contentStyle={tooltipStyle} />
```

This applies to **every** chart in every tab — Operations, Live Stream Monitor, etc.

### Standard BarChart

```tsx
<BarChart data={data} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={ct.gridColor} />
  <XAxis dataKey="name" tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
  <YAxis tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
  <RechartsTooltip
    cursor={{ fill: isDark ? alpha("#7dd3fc", 0.08) : alpha("#3b82f6", 0.06) }}
    contentStyle={tooltipStyle}
  />
  <Bar dataKey="value" fill={isDark ? "#3b82f6" : "#2563eb"} radius={[3, 3, 0, 0]} barSize={28} />
</BarChart>
```

### Standard LineChart

```tsx
<LineChart data={data} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={ct.gridColor} />
  <XAxis dataKey="name" tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
  <YAxis tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
  <RechartsTooltip contentStyle={tooltipStyle} />
  <Line type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={2}
    dot={{ r: 3, fill: "#ef4444", stroke: isDark ? "#0b1724" : "#ffffff", strokeWidth: 2 }}
    activeDot={{ r: 5 }} />
</LineChart>
```

---

## 30. Card Height Alignment

When two cards in the same MUI Grid row must share a bottom edge, use this pattern:

### Auto-Sizing Card (driven by content — e.g., autoHeight AG Grid)

Do **not** set `height: "100%"` on this card. Let it size naturally to its content. This card defines the row height.

```tsx
<Grid item xs={12} md={9}>
  <Card sx={{ p: 1, display: "flex", flexDirection: "column" }}>
    {/* content that determines the card's natural height */}
    <Box className={agTheme} sx={agGridContainerSx}>
      <AgGridReact domLayout="autoHeight" ... />
    </Box>
  </Card>
</Grid>
```

### Stretch Card (fills to match the auto-sizing card)

Set `height: "100%"` AND `display: "flex", flexDirection: "column"` on this card. Its inner content grid must use `flex: 1` + `gridTemplateRows` to fill the space.

```tsx
<Grid item xs={12} md={3}>
  <Card sx={{ p: 1.25, height: "100%", display: "flex", flexDirection: "column" }}>
    <SectionTitle title="..." />
    {/* flex: 1 + gridTemplateRows makes tiles grow to fill available height */}
    <Box sx={{
      flex: 1,
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gridTemplateRows: "1fr 1fr",
      gap: 1,
    }}>
      <MetricTile ... />
      <MetricTile ... />
      <MetricTile ... />
      <MetricTile ... />
    </Box>
  </Card>
</Grid>
```

**How it works:** MUI Grid uses `align-items: stretch` by default — all items in a flex row grow to the tallest item's height. The auto-sizing card defines the row height; the stretch card's `height: "100%"` fills its Grid item to match. Without `display: flex, flexDirection: column` + `flex: 1` on inner content, the card appears filled but has dead blank space below the tiles.

---

## 27. Common Patterns Checklist

When building a new page or tab, verify:

- [ ] Page wrapper uses the gradient background with `p: 0.5`
- [ ] All cards use the `Card` component (not raw `<Paper>`)
- [ ] Every card section starts with `<SectionTitle>`
- [ ] Body text is `10px`, card headers `12px`, page title `16px`
- [ ] Number/value display in cards is `16px / fontWeight 800`
- [ ] Delta / sub-labels are `8px / fontWeight 700`
- [ ] Status colors use the canonical `statusMeta` palette
- [ ] Health coloring uses `healthColor(h)` threshold helper
- [ ] Loading state is a centered `<CircularProgress size={18} />`
- [ ] Empty state has a primary (12px) and secondary (10px) line
- [ ] ECharts tooltips use the standard dark/light config
- [ ] ECharts axes use `commonXAxis` / `commonYAxis` config
- [ ] Health thresholds shown as markLines at y=60 and y=80
- [ ] Table headers on `#1e293b` / `#f8fafc` with `fontSize 11px`
- [ ] Table rows alternate between `#0f172a`/`#111827` (dark) or `#fff`/`#f8fafc` (light)
- [ ] DTC results written to store via `setDtcResult` after analysis
- [ ] Alert candidates written to store via `setAlertCandidates`
- [ ] No `console.log` left in production paths
- [ ] No hardcoded API URLs (use `FLEET_API` / `PIPELINE_API` constants)
- [ ] AG Grid: `agGridContainerSx` spread on `<Box className={agTheme}>`, never on the Card
- [ ] AG Grid: CSS custom properties (`--ag-background-color: transparent`, etc.) included in `agGridContainerSx`
- [ ] AG Grid: fixed-row tables (≤ ~10 rows) use `domLayout="autoHeight"` — no scroll, no `flex: 1, minHeight: 0` on wrapper
- [ ] Recharts: every `<RechartsTooltip>` has `cursor={{ fill: isDark ? alpha("#7dd3fc", 0.08) : alpha("#3b82f6", 0.06) }}` — no grey hover box
- [ ] Card height alignment: auto-sizing card has no `height: "100%"`, stretch card has `height: "100%"` + `display: flex, flexDirection: column`
- [ ] KPI tile grid inside stretch card has `flex: 1` + `gridTemplateRows: "1fr 1fr"` so tiles fill available height without dead space
- [ ] Page-level tab switcher uses the "Page Tab Switcher" ToggleButtonGroup pattern — dark navy / white selected state, NOT a colored-fill selected state
