# Fleet Dashboard UI Design Guide

Reference pages: `WriterOps.tsx` (System Ops), `DashboardInference.tsx` (Inference Engine), `GoldHealth.tsx` (Vehicle Health).
These three pages are the current demo standard. All new pages and tabs must conform to this guide.

For dark mode color token mapping, see `DARK_MODE_GUIDE.md`.

---

## 0. Dark Mode Detection

All three reference pages pull dark mode from the Zustand store:

```ts
const { darkMode } = useStore();
```

All chart theme tokens come from the shared hook:

```ts
const ct = useChartTheme();
```

`ct` provides: `ct.gridColor`, `ct.axisColor`, `ct.tooltipBg`, `ct.tooltipBorder`, `ct.tooltipText`, `ct.tableBorder`, `ct.tableRowEven`.

---

## 1. Typography Scale

| Role | fontSize | fontWeight | Notes |
|---|---|---|---|
| Page / section title | `14px !important` | `700` | `letterSpacing: "-0.3px"`, `whiteSpace: "nowrap"` |
| Card / panel section header | `12px` | `700` | ALL-CAPS label above content |
| KPI value — standard | `14px` | `700` | Counts, scores, rates |
| KPI value — prominent (GoldHealth) | `18px` | `700` | Used when tile is large or primary metric |
| KPI label | `10px` | `500–600` | Below value |
| KPI subtitle / trend chip | `8px` | `600` | Color = kpi.color |
| Compact tile label | `8px` | `700` | `textTransform: "uppercase"`, `letterSpacing: "0.4px"` |
| Table header | `10px` | `700` | Always white on `#005071` bg |
| Table cell / form text | `10px` | `400` | MUI override at container level |
| Axis tick label | `11px` | `600` | Applied via `chartAxisStyle` object |
| Legend text | `8–10px` | `600` | `color: ct.axisColor` |
| Status chip label | `10px` | `700` | `fontWeight: "bold"` |
| Note / hint | `10px` | `400` | `color: "#333"` / `text.secondary` |
| JSON / pre viewer | `8px` | `400` | `whiteSpace: "pre-wrap"` |

**Font stack (CHART_FONT):**
```ts
const CHART_FONT = '"Inter", "Segoe UI", Roboto, Arial, sans-serif';
```

Global MUI font override pattern — apply at a container level to avoid repeating per-component:
```tsx
sx={{
  "& .MuiTypography-root": { fontSize: "10px" },
  "& .MuiInputLabel-root": { fontSize: "10px" },
  "& .MuiSelect-select": { fontSize: "10px" },
  "& .MuiMenuItem-root": { fontSize: "10px" },
  "& .MuiButton-root": { fontSize: "10px" },
  "& .MuiInputBase-input": { fontSize: "10px" },
}}
```

---

## 2. Brand Color System

### Primary Brand Colors (layout chrome, headers, tabs, action buttons)

| Token | Value | Usage |
|---|---|---|
| Brand primary | `#005071` | Page title, all section titles, AG Grid header bg, toggle selected bg (light), section dividers |
| Action button | `#0A6D94` | Inspector "Fetch" buttons (`bgcolor`) |
| Action button hover | `#095B7A` | Hover state for action buttons |

### Semantic Status Colors

```ts
const statusColors = {
  healthy:  "#2E7D32",   // green
  warning:  "#F57C00",   // amber
  critical: "#D32F2F",   // red
  info:     "#1976D2",   // blue
  purple:   "#7B1FA2",   // purple / profile B
};
```

### Health Score Color Thresholds

```ts
// Three-tier threshold — consistent across all pages
const healthColor = (h: number) =>
  h < 50 ? "#D32F2F" : h < 80 ? "#F57C00" : "#388E3C";

// Two-tier (simpler) used in some chart reference lines
const healthColor2 = (h: number) =>
  h >= 80 ? "#22c55e" : h >= 60 ? "#eab308" : "#ef4444";
```

### KPI Tile Color Tokens (representative set)

| Role | `color` | `bg` |
|---|---|---|
| Blue / primary | `#1976D2` | `#EEF6FF` |
| Purple | `#7B1FA2` | `#F4EEFF` |
| Green / healthy | `#2E7D32` | `#EEFCEF` |
| Amber / warning | `#F57C00` | `#FFF6E8` |
| Red / critical | `#D32F2F` | `#FFF1F1` |

Conditional threshold pattern (swap color/bg based on value):
```ts
const color  = someValue > threshold ? "#D32F2F" : "#2E7D32";
const bg     = someValue > threshold ? "#FFF1F1" : "#EEFCEF";
const border = color;
```

### Module Colors

```ts
const MODULE_COLORS: Record<string, string> = {
  engine:       "#ef4444",
  transmission: "#f97316",
  battery:      "#3b82f6",
  body:         "#a855f7",
  tyre:         "#22c55e",
};
```

---

## 3. Page Shell

Outer wrapper for every page — identical across all three reference pages:

```tsx
<Box
  sx={{
    height: "calc(100vh - 80px)",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    gap: 1,
    padding: "0 8px",
    bgcolor: "background.default",
  }}
>
```

`calc(100vh - 80px)` accounts for the 80 px fixed top shell bar. `minHeight: 0` prevents flex overflow.

---

## 4. Page Header Bar

First child of the page shell, appears in all three pages identically:

```tsx
<Box
  sx={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: `2px solid ${theme.palette.divider}`,
    pb: 1,
  }}
>
  <Typography
    variant="h5"
    sx={{
      fontWeight: 700,
      color: darkMode ? "text.primary" : "#005071",
      letterSpacing: "-0.3px",
      fontSize: "14px !important",
      whiteSpace: "nowrap",
    }}
  >
    PAGE TITLE IN SCREAMING CAPS
  </Typography>

  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
    {/* Tab switcher goes here — see Section 5 */}
  </Box>
</Box>
```

---

## 5. View Mode Tab Switcher (ToggleButtonGroup)

Primary page-level tab navigation. Appears in all three pages with an identical `sx` block. A sub-mode variant at `height: 25` is used for secondary navigation within a tab.

### Standard (height 34)

```tsx
<ToggleButtonGroup
  value={viewMode}
  exclusive
  onChange={(_e, val) => val && setViewMode(val)}
  size="small"
  sx={{
    height: 34,
    bgcolor: "transparent",
    "& .MuiToggleButtonGroup-grouped": {
      border: "1px solid #D0D7DE !important",
      borderRadius: "8px !important",
      marginRight: "8px !important",
      padding: "0 16px",
      minHeight: 34,
      textTransform: "none",
      fontSize: "10px",
      fontWeight: 700,
      color: darkMode ? "#ffffff" : "#64748B",
      transition: "all .2s ease",
      "&:last-of-type": { marginRight: 0 },
      "&:hover": {
        backgroundColor: darkMode ? "#F2F8FA" : "#005071cc",
        borderColor: darkMode ? "#005071" : "#ffffff",
        color: darkMode ? "#005071" : "#ffffff",
      },
      "&.Mui-selected": {
        backgroundColor: darkMode ? "#E6F4F9" : "#005071",
        color: darkMode ? "#005071" : "#ffffff",
        border: "1px solid #005071 !important",
        boxShadow: "0 2px 8px rgba(0,80,113,0.18)",
      },
      "&.Mui-selected:hover": {
        backgroundColor: darkMode ? "#E6F4F9" : "#005071",
      },
    },
  }}
>
  <ToggleButton value="operations">OPERATIONS METRICS</ToggleButton>
  <ToggleButton value="inspector">DATA INSPECTOR</ToggleButton>
</ToggleButtonGroup>
```

### Sub-mode variant (height 25)

Same `sx` block, change `height: 34` → `height: 25` and `minHeight: 34` → `minHeight: 25`. Used for secondary tab switching within an already-selected primary tab (e.g., GoldHealth's A/B mode selector).

**Design rules:**
- Selected = `#005071` bg + white text in light mode; `#E6F4F9` bg + `#005071` text in dark mode.
- Guard `onChange` with `val && setViewMode(val)` to prevent deselecting all tabs.
- `textTransform: "none"` — do not let MUI uppercasing fight your own caps.

---

## 6. Main Layout Grid

Appears in all three pages (identical structure):

```tsx
<Grid container spacing={1} alignItems="stretch">
  {/* Left column — 4/12: filter bar, context charts, secondary panels */}
  <Grid item xs={12} sm={4}>
    ...
  </Grid>

  {/* Right column — 8/12: KPI tile row + main data surface */}
  <Grid item xs={12} sm={8} sx={{ display: "flex" }}>
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, gap: 1 }}>
      {/* KPI row */}
      {/* Main table or chart paper */}
    </Box>
  </Grid>
</Grid>
```

---

## 7. KPI Tile Row

Four tiles per row, all three pages:

```tsx
<Box sx={{ display: "flex", gap: 1, width: "100%" }}>
  {kpiArray.map((kpi, i) => (
    <Paper key={i} ...>{/* tile — see Sections 8a/8b/8c */}</Paper>
  ))}
</Box>
```

---

## 8. KPI Tile Variants

Three distinct variants appear across the reference pages.

### 8a. Standard Tile — left-border + icon circle (WriterOps)

```tsx
<Paper
  elevation={3}
  sx={{
    flex: 1,
    p: 2,
    borderRadius: 3,
    borderLeft: `5px solid ${kpi.border}`,
    background: getCardGradient(kpi.bg),
    boxShadow: darkMode
      ? "0 4px 20px rgba(0,0,0,.35)"
      : "0 2px 10px rgba(0,0,0,.08)",
    transition: "all .25s ease",
  }}
>
  <Box sx={{ display: "flex", alignItems: "center" }}>
    {/* Icon circle — 38×38 */}
    <Box sx={{
      width: 38, height: 38, borderRadius: "50%",
      bgcolor: kpi.bg, color: kpi.color,
      display: "flex", alignItems: "center", justifyContent: "center",
      mr: 2, "& svg": { fontSize: 30 },
    }}>
      {kpi.icon}
    </Box>
    <Box sx={{ flex: 1, overflow: "hidden" }}>
      <Typography sx={{ fontSize: "14px", fontWeight: 700, color: darkMode ? "#ffffff" : "#1f2937", lineHeight: 1 }}>
        {kpi.value}
      </Typography>
      <Typography sx={{ mt: 0.7, fontSize: "10px", fontWeight: 500, color: "#475569" }}>
        {kpi.label}
      </Typography>
      <Typography sx={{ mt: 1, fontSize: "8px", fontWeight: 600, color: kpi.color }}>
        {kpi.subtitle}
      </Typography>
    </Box>
  </Box>
</Paper>
```

### 8b. Enhanced Tile — pseudo `::before` accent rule + tinted border (DashboardInference, GoldHealth)

```tsx
<Paper
  elevation={3}
  sx={{
    flex: 1,
    p: 2,
    borderRadius: 3,
    overflow: "hidden",
    position: "relative",
    minHeight: 90,                          // GoldHealth only
    background: getCardGradient(kpi.bg, kpi.color, darkMode),
    border: `1px solid ${alpha(kpi.color, 0.18)}`,
    boxShadow: darkMode
      ? `0 8px 24px ${alpha("#000", 0.45)}`
      : `0 10px 25px ${alpha(kpi.color, 0.12)}`,
    transition: ".25s",
    "&:hover": {                            // GoldHealth only
      transform: "translateY(-2px)",
      boxShadow: `0 14px 30px ${alpha(kpi.color, 0.18)}`,
    },
    "&:before": {
      content: '""',
      position: "absolute",
      top: 0, left: 0,
      width: 5, height: "100%",
      background: kpi.color,
    },
  }}
>
  <Box sx={{ display: "flex", alignItems: "center" }}>
    {/* Icon circle — 38×38 (DashboardInference) or 40×40 gradient (GoldHealth) */}
    <Box sx={{
      width: 40, height: 40, mr: 1.5, borderRadius: "50%",
      background: `linear-gradient(135deg, ${alpha(kpi.color, 0.15)}, ${alpha(kpi.color, 0.3)})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: kpi.color, "& svg": { fontSize: 22 },
    }}>
      {kpi.icon}
    </Box>
    <Box sx={{ flex: 1 }}>
      <Typography sx={{ fontSize: "18px", fontWeight: 700, color: kpi.color, lineHeight: 1 }}>
        {kpi.value}
      </Typography>
      <Typography sx={{ mt: 0.5, fontSize: "10px", fontWeight: 500, color: darkMode ? "#CBD5E1" : "#475569" }}>
        {kpi.label}
      </Typography>
    </Box>
  </Box>
</Paper>
```

### 8c. Compact Mini Tile — 42 px height (WriterOps live stream only)

Used when four tiles must fit in a very narrow strip:

```tsx
<Paper
  elevation={0}
  sx={{
    flex: 1, minWidth: 0, height: 42,
    p: 0.5, borderRadius: 2,
    background: getCardGradient(kpi.bg),
    borderLeft: `5px solid ${kpi.border}`,
    display: "flex", alignItems: "center",
    transition: ".2s",
  }}
>
  <Box sx={{ display: "flex", alignItems: "center" }}>
    {/* Icon — 22×22 */}
    <Box sx={{
      width: 22, height: 22, borderRadius: "50%",
      bgcolor: darkMode ? alpha(kpi.color, 0.18) : kpi.bg,
      color: kpi.color, display: "flex", alignItems: "center",
      justifyContent: "center", flexShrink: 0,
      "& svg": { fontSize: 14 },
    }}>
      {kpi.icon}
    </Box>
    <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, minWidth: 0, marginLeft: "5px" }}>
      <Typography noWrap sx={{ fontSize: "8px", fontWeight: 700, color: darkMode ? "#94A3B8" : "#64748B", textTransform: "uppercase", letterSpacing: "0.4px", lineHeight: 1.2 }}>
        {kpi.label}
      </Typography>
      <Typography noWrap sx={{ mt: 0.4, fontSize: "14px", fontWeight: 700, color: darkMode ? "#F8FAFC" : "#1F2937", lineHeight: 1.2 }}>
        {kpi.value}
      </Typography>
    </Box>
  </Box>
</Paper>
```

---

## 9. getCardGradient Helper

Three variants appear across the pages. **Use Variant B or C** for new pages — Variant A is legacy.

### Variant A — WriterOps (180 deg, color-keyed switch)

```tsx
const getCardGradient = (bg: string) => {
  if (!darkMode) return `linear-gradient(180deg, #FFFFFF 0%, ${bg} 100%)`;
  switch (bg) {
    case "#EEF6FF": return "linear-gradient(180deg, #1B2735 0%, #22384D 100%)";
    case "#F4F1FF": return "linear-gradient(180deg, #241F36 0%, #30274B 100%)";
    case "#EEFCEF": return "linear-gradient(180deg, #1B3022 0%, #24412D 100%)";
    case "#FFF6E8": return "linear-gradient(180deg, #352A1A 0%, #483820 100%)";
    default:        return "linear-gradient(180deg, #1F2937, #273548)";
  }
};
```

### Variant B — DashboardInference (145 deg, alpha-based)

```tsx
const getCardGradient = (bg: string, color: string, darkMode: boolean) => {
  if (darkMode)
    return `linear-gradient(145deg, ${alpha(color, 0.22)} 0%, ${alpha("#111827", 0.95)} 55%, ${alpha("#0F172A", 0.98)} 100%)`;
  return `linear-gradient(145deg, ${bg} 0%, #ffffff 58%, ${alpha(color, 0.08)} 100%)`;
};
```

### Variant C — GoldHealth (135 deg, alpha-based)

```tsx
const getCardGradient = (bg: string, color: string, darkMode: boolean) => {
  if (darkMode)
    return `linear-gradient(135deg, ${alpha(color, 0.18)} 0%, ${alpha("#1E293B", 0.95)} 45%, ${alpha("#0F172A", 1)} 100%)`;
  return `linear-gradient(135deg, ${bg} 0%, #FFFFFF 65%, ${alpha(color, 0.1)} 100%)`;
};
```

---

## 10. Section / Panel Title

Appears identically in all three pages. All-caps label, 12 px / 700, brand primary color:

```tsx
<Typography
  variant="caption"
  sx={{
    fontSize: "12px",
    lineHeight: 2,
    fontWeight: 700,
    color: darkMode ? "text.primary" : "#005071",
    mb: 1,
  }}
>
  SECTION TITLE IN SCREAMING CAPS
</Typography>
```

Variant with icon + bottom border divider (DashboardInference sub-sections):

```tsx
<Box sx={{ display: "flex", alignItems: "center", gap: 1, borderBottom: `1px solid ${theme.palette.divider}`, mb: 1 }}>
  <SomeIcon sx={{ color: "#1976D2", fontSize: 18 }} />
  <Typography variant="subtitle2" sx={{ fontSize: "12px", lineHeight: 2, fontWeight: 700, color: darkMode ? "text.primary" : "#005071" }}>
    SUBSECTION LABEL:
  </Typography>
</Box>
```

---

## 11. Chart Paper Container

Two standard variants for wrapping chart panels in the left column.

### Variant A — Flat (WriterOps, fixed height 204, `borderRadius: 0`)

```tsx
<Paper sx={{ height: 204, flex: 1, p: 1, borderRadius: 0, display: "flex", flexDirection: "column", mb: 1 }}>
  <Typography variant="caption" sx={{ fontSize: "12px", lineHeight: 2, fontWeight: 700, color: darkMode ? "text.primary" : "#005071", mb: 1 }}>
    CHART TITLE
  </Typography>
  <ResponsiveContainer width="100%" height="100%">
    {/* chart */}
  </ResponsiveContainer>
</Paper>
```

### Variant B — Rounded (DashboardInference, fixed height 232, `borderRadius: 2`)

```tsx
<Paper sx={{ flex: 1, height: 232, display: "flex", flexDirection: "column", p: 1, borderRadius: 2, mb: 1 }}>
  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
    <Typography variant="subtitle2" sx={{ fontSize: "12px", lineHeight: 2, fontWeight: 700, color: darkMode ? "text.primary" : "#005071" }}>
      CHART TITLE
    </Typography>
  </Box>
  <Box sx={{ flex: 1, minHeight: 200 }}>
    <ResponsiveContainer width="100%" height="100%">
      {/* chart */}
    </ResponsiveContainer>
  </Box>
</Paper>
```

---

## 12. Chart Theme Variables (shared across all charts)

Declare inside the component. All Recharts charts consume these tokens:

```tsx
const ct = useChartTheme();   // import from hooks

const chartAxisStyle = {
  fontSize: "11px",
  fill: ct.axisColor,
  fontWeight: 600,
};

const tooltipStyle = {
  borderRadius: 0,
  fontSize: "12px",
  padding: "5px",
  backgroundColor: ct.tooltipBg,
  border: `1px solid ${ct.tooltipBorder}`,
  color: ct.tooltipText,
};
```

---

## 13. Recharts BarChart

Standard pattern shared by WriterOps and DashboardInference:

```tsx
<ResponsiveContainer width="100%" height="100%">
  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={ct.gridColor} />
    <XAxis dataKey="name" tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
    <YAxis tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
    <Tooltip cursor={{ fill: ct.tableRowEven }} contentStyle={tooltipStyle} />
    <Bar dataKey="value" fill="#1976d2" barSize={30} isAnimationActive={false} />
  </BarChart>
</ResponsiveContainer>
```

Multi-bar with legend:
```tsx
<Legend verticalAlign="top" align="center" height={22} wrapperStyle={{ fontSize: "10px", paddingBottom: 4 }} />
<Bar dataKey="total" name="Total" fill={ct.gridColor} barSize={30} isAnimationActive={false} />
<Bar dataKey="compute" name="Compute" fill="#1976d2" barSize={30} isAnimationActive={false} />
```

Stacked bar:
```tsx
<Bar dataKey="rows_processed" fill="#2e7d32" stackId="a" />
<Bar dataKey="rejected_rows"  fill="#c62828" stackId="a" />
```

---

## 14. Recharts LineChart

Standard pattern (WriterOps, GoldHealth):

```tsx
<ResponsiveContainer width="100%" height="100%">
  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={ct.gridColor} />
    <XAxis dataKey="name" tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
    <YAxis tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
    <Tooltip contentStyle={tooltipStyle} />
    <Line
      type="monotone" dataKey="value"
      stroke="#D32F2F" strokeWidth={2}
      dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }}
    />
  </LineChart>
</ResponsiveContainer>
```

Multi-line hierarchy (GoldHealth experiment lab):

```tsx
{/* Primary health line — thick solid */}
<Line type="monotone" dataKey="experimental_health" stroke="#1976d2" strokeWidth={4} dot={false} activeDot={{ r: 8 }} />

{/* Per-module contributor lines — thin dashed */}
<Line type="monotone" dataKey={`${mod}_raw`} stroke={MODULE_COLORS[mod]} strokeWidth={1} strokeDasharray="5 5" dot={false} />

{/* Reference line (actual gold) — medium dashed neutral */}
<Line type="monotone" dataKey="actual_gold" stroke={ct.axisColor} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
```

Custom legend formatter:
```tsx
<Legend
  wrapperStyle={{ fontSize: "10px" }}
  formatter={(value) => (
    <span style={{ fontSize: "8px", fontWeight: 600, color: ct.axisColor }}>{value}</span>
  )}
/>
```

---

## 15. Recharts Bar/Line Fill Color Reference

| Role | Color |
|---|---|
| Primary metric / main bar | `#1976d2` |
| Error / latency bar | `#d32f2f` |
| Vehicle / secondary bar | `#fbc02d` |
| Processed / healthy rows | `#2e7d32` |
| Rejected rows | `#c62828` |
| Comparison / total bar | `ct.gridColor` |
| Profile B / purple line | `#7b1fa2` |
| Reference (actual) line | `ct.axisColor` |
| Per-module lines | `MODULE_COLORS[mod]` |

---

## 16. AG Grid Theming

### Theme class

```tsx
const agTheme = darkMode ? "ag-theme-balham-dark" : "ag-theme-balham";
```

### Header override (applies to every AG Grid in every page)

Applied to the Paper or Box that wraps `<Box className={agTheme}>`:

```tsx
"& .ag-header":            { backgroundColor: "#005071 !important" },
"& .ag-header-cell":       { backgroundColor: "#005071 !important", color: "#fff !important", fontSize: "10px !important", fontWeight: 700 },
"& .ag-header-cell-label": { color: "#fff !important" },
"& .ag-icon":              { color: "#fff !important" },
"& .ag-sort-ascending-icon":  { color: "#fff !important" },
"& .ag-sort-descending-icon": { color: "#fff !important" },
"& .ag-sort-none-icon":       { color: "#fff !important" },
"& .ag-header-icon":          { color: "#fff !important" },
"& .ag-cell": { fontSize: "10px" },
"& .ag-row":  { fontSize: "10px" },
```

Row alternating (optional, live view tables):
```tsx
"& .ag-row:nth-of-type(even)": { background: "#fafafa" },
```

### Default column definition

```tsx
defaultColDef={{
  sortable: true,
  filter: true,
  resizable: true,
  cellStyle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    fontSize: 10,
  },
}}
```

### Overlay templates

```tsx
overlayLoadingTemplate={
  isLoading ? '<span class="ag-overlay-loading-center">Fetching Telemetry...</span>' : undefined
}
overlayNoRowsTemplate={
  isError ? '<span class="ag-overlay-loading-center">ERROR: Backend Unreachable</span>' : undefined
}
```

Other message strings in use: `"Scanning Parquet..."`, `"Scanning Silver Parquet..."`, `"Fetching ML Telemetry..."`, `"No Stream Data Available"`.

### Conditional cell styles

```tsx
// Numeric threshold — error if over limit
cellStyle: (params: any): any => {
  if (params.value > 100)
    return { color: theme.palette.error.main, fontWeight: "bold", backgroundColor: darkMode ? "rgba(211,47,47,0.20)" : "#ffebee" };
  return { color: theme.palette.success.main };
},

// Health score — three-tier color coding
cellStyle: (params: any) => ({
  fontWeight: "bold",
  color: params.value < 50 ? "#d32f2f" : params.value < 80 ? "#f57c00" : "#388e3c",
}),

// Status chip renderer — RUNNING / STALLED / NORMAL / WARNING / CRITICAL
cellRenderer: (params: any) => {
  let color: "success" | "error" | "warning" | "info" = "info";
  if (params.value === "RUNNING" || params.value === "NORMAL")  color = "success";
  if (params.value === "STALLED" || params.value === "WARNING") color = "warning";
  if (params.value === "CRITICAL") color = "error";
  return (
    <Chip label={params.value || "UNKNOWN"} color={color} size="small"
      sx={{ borderRadius: "2px", height: "20px", fontSize: "10px", fontWeight: "bold" }} />
  );
},
```

---

## 17. Inspector View Shell

Full-page inspector layout used in WriterOps and DashboardInference:

```tsx
<Paper sx={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column", borderRadius: 0, p: 1 }}>
  {/* Filter bar */}
  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
    {/* selects + action button — see Section 18 */}
  </Box>
  <Divider sx={{ mb: 1 }} />
  {/* Grid */}
  <Box className={agTheme} sx={{ flexGrow: 1, minHeight: 0, width: "100%" }}>
    <AgGridReact rowData={filteredData} columnDefs={colDefs} defaultColDef={{ resizable: true, sortable: true, filter: true }} />
  </Box>
</Paper>
```

---

## 18. Inspector Filter Bar

Horizontal bar with module select, vehicle select, action button, and note. Appears in WriterOps and DashboardInference inspector views:

```tsx
<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>

  {/* Module Select */}
  <FormControl size="small" sx={{ minWidth: 220, bgcolor: "#fff" }}>
    <InputLabel sx={{ fontSize: "10px" }}>Target Module</InputLabel>
    <Select value={selectedModule} label="Target Module"
      sx={{ borderRadius: 0, height: 28, fontSize: "10px", "& .MuiSelect-select": { fontSize: "10px", py: 0.5 } }}
      MenuProps={{ PaperProps: { sx: { "& .MuiMenuItem-root": { fontSize: "10px", minHeight: 28 } } } }}
    >
      <MenuItem value="battery">BATTERY</MenuItem>
    </Select>
  </FormControl>

  {/* Vehicle Select */}
  <FormControl size="small" sx={{ minWidth: 180, bgcolor: "#fff" }}>
    <InputLabel sx={{ fontSize: "10px" }}>Filter Vehicle</InputLabel>
    <Select value={filterSim} label="Filter Vehicle"
      sx={{ borderRadius: 0, height: 28, fontSize: "10px", "& .MuiSelect-select": { fontSize: "10px", py: 0.5 } }}
      MenuProps={{ PaperProps: { sx: { "& .MuiMenuItem-root": { fontSize: "10px", minHeight: 28 } } } }}
    >
      <MenuItem value="ALL">ALL VEHICLES</MenuItem>
    </Select>
  </FormControl>

  {/* Action Button */}
  <Button variant="contained" onClick={refetch} disabled={isLoading}
    startIcon={<RefreshIcon sx={{ fontSize: "12px" }} />}
    sx={{
      height: 28, borderRadius: 0, fontSize: "10px", fontWeight: 700,
      boxShadow: "none", whiteSpace: "nowrap", textTransform: "uppercase",
      bgcolor: "#0A6D94",
      "&:hover": { bgcolor: "#095B7A", boxShadow: "none" },
    }}
  >
    FETCH LATEST 100 ROWS
  </Button>

  <Typography sx={{ ml: 1, color: "#333", fontSize: "10px" }}>
    *Inspector reads raw parquet files directly from disk. Auto-refresh disabled.
  </Typography>
</Box>
```

---

## 19. Filter Context Bar (operations view sidebar)

Compact filter above charts in the left column. Appears in WriterOps and GoldHealth:

```tsx
<Paper sx={{ flex: 1, display: "flex", flexDirection: "column", p: 1, borderRadius: 2, mb: 1 }}>
  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
    <Typography sx={{ fontSize: "12px", lineHeight: 2, fontWeight: 700, color: darkMode ? "text.primary" : "#005071" }}>
      FILTER CONTEXT:
    </Typography>
    <FormControl size="small" sx={{ minWidth: 200, bgcolor: "#fff" }}>
      <Select value={filterValue} onChange={(e) => setFilter(e.target.value)}
        sx={{ borderRadius: 0, height: 25, fontSize: "10px", "& .MuiSelect-select": { fontSize: "10px", py: 0.5 } }}
        MenuProps={{ PaperProps: { sx: { "& .MuiMenuItem-root": { fontSize: "10px", minHeight: 20 } } } }}
      >
        <MenuItem value="ALL">ALL MODULES</MenuItem>
      </Select>
    </FormControl>
  </Box>
</Paper>
```

---

## 20. System Health Chip Grid (service up/down status)

4-column responsive grid of binary status pills. WriterOps live view:

```tsx
<Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.75, width: "100%" }}>
  {Object.entries(serviceHealth).map(([name, isUp]: [string, any]) => (
    <Chip key={name} label={name.toUpperCase()} size="small"
      color={isUp ? "success" : "error"}
      sx={{
        width: "100%", height: 24, fontSize: "10px", fontWeight: 600, borderRadius: 1,
        "& .MuiChip-label": { px: 0.5, width: "100%", textAlign: "center", fontSize: "10px", fontWeight: 600 },
      }}
    />
  ))}
</Box>
```

---

## 21. Feature / Anomaly Driver List Card

Polished driver list in GoldHealth sidebar. Each item: icon + label + progress bar + score badge.

```tsx
<Box sx={{
  display: "flex", alignItems: "center", gap: 1.2,
  p: 1, mb: 0.8, borderRadius: 1.5,
  border: `1px solid ${alpha(ct.gridColor, 0.25)}`,
  background: darkMode ? alpha("#fff", 0.02) : "#fff",
  transition: ".2s",
  "&:hover": { boxShadow: "0 3px 8px rgba(0,0,0,.08)", transform: "translateY(-1px)" },
}}>
  {/* Icon box — 30×30, borderRadius 1.5 */}
  <Box sx={{ width: 30, height: 30, borderRadius: 1.5,
    bgcolor: alpha(theme.palette.error.main, 0.08), color: theme.palette.error.main,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    "& svg": { fontSize: 16 } }}>
    {getFeatureIcon(f.feature)}
  </Box>

  {/* Label + mini progress bar */}
  <Box flex={1}>
    <Typography sx={{ fontSize: "10px", fontWeight: 700, mb: 0.5, lineHeight: 1.2, wordBreak: "break-word" }}>
      {f.feature}
    </Typography>
    <Box sx={{ height: 6, bgcolor: ct.gridColor, borderRadius: 10, overflow: "hidden" }}>
      <Box sx={{
        width: `${Math.min(100, Number(f.impact) * 30)}%`,
        height: "100%", borderRadius: 10,
        background: `linear-gradient(90deg, ${theme.palette.error.light}, ${theme.palette.error.main})`,
      }} />
    </Box>
  </Box>

  {/* Score badge */}
  <Box sx={{ minWidth: 42, height: 30, borderRadius: 1.5,
    bgcolor: alpha(theme.palette.error.main, 0.08),
    display: "flex", alignItems: "center", justifyContent: "center", px: 0.5 }}>
    <Typography sx={{ color: theme.palette.error.main, fontWeight: 700, fontSize: "10px", lineHeight: 1 }}>
      {Number(f.impact).toFixed(2)}
    </Typography>
  </Box>
</Box>
```

---

## 22. Weight / Slider Panel (GoldHealth)

Checkbox-gated module enable/disable with color-coded MUI Slider and Chip value readout:

```tsx
<Box key={mod} sx={{ opacity: isActive ? 1 : 0.5, px: 0.5 }}>
  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <FormControlLabel
      sx={{ m: 0 }}
      control={
        <Checkbox size="small" checked={isActive} onChange={() => onToggleModule(mod)}
          sx={{ color: MODULE_COLORS[mod], p: 0.5 }} />
      }
      label={
        <Typography sx={{ fontWeight: 700, textTransform: "uppercase", fontSize: "10px" }}>
          {mod}
        </Typography>
      }
    />
    <Chip size="small" label={isActive ? (weights[mod] || 0).toFixed(2) : "OFF"}
      sx={{ borderRadius: 0, height: 18, fontSize: "10px", fontWeight: 700 }} />
  </Box>
  <Slider size="small" value={weights[mod] || 0} onChange={(_, val) => onWeightChange(mod, val as number)}
    min={0} max={1} step={0.01} disabled={!isActive}
    sx={{
      color: MODULE_COLORS[mod], ml: 3, width: "calc(100% - 24px)", mt: -0.5,
      "& .MuiSlider-markLabel": { fontSize: "10px" },
      "& .MuiSlider-valueLabel": { fontSize: "10px" },
    }}
  />
</Box>
```

---

## 23. A/B Profile Panel (GoldHealth)

Two comparison panels identified by a 3 px top border in profile color:

```tsx
{/* Profile A — blue */}
<Paper sx={{ p: 0, borderRadius: 0, display: "flex", flexDirection: "column", borderTop: "3px solid #1976d2" }}>

{/* Profile B — purple */}
<Paper sx={{ p: 0, borderRadius: 0, display: "flex", flexDirection: "column", borderTop: "3px solid #7b1fa2" }}>
```

---

## 24. Imbalance Warning Alert

Used in GoldHealth WeightPanel when weight sum ≠ 1.0:

```tsx
<Alert severity="warning" icon={false}
  sx={{ borderRadius: 0, alignItems: "center", height: "30px", "& .MuiAlert-message": { p: 0 } }}
  action={
    <Button size="small" color="inherit" onClick={onAutoBalance}
      startIcon={<AutoFixHighIcon sx={{ fontSize: "6px" }} />}
      sx={{ fontSize: "10px" }}>
      RECALIBRATE
    </Button>
  }
>
  <Typography sx={{ fontSize: "10px", fontWeight: 700 }}>
    Sum: {weightSum.toFixed(3)} (Target: 1.0)
  </Typography>
</Alert>
```

---

## 25. JSON Payload Viewer (WriterOps live view)

```tsx
<Box sx={{
  bgcolor: "background.default",
  border: `1px solid ${theme.palette.divider}`,
  p: 1, height: 33, overflow: "auto",
}}>
  <pre style={{ margin: 0, fontSize: "8px", whiteSpace: "pre-wrap" }}>
    {JSON.stringify(payload, null, 2)}
  </pre>
</Box>
```

---

## 26. Loading and Empty States

### Grid-level loading
```tsx
overlayLoadingTemplate='<span class="ag-overlay-loading-center">Fetching Telemetry...</span>'
```

### Inline empty state
```tsx
<Typography variant="caption" color="text.secondary">
  Awaiting anomaly data...
</Typography>
```

### Card-level loading
```tsx
<Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
  <CircularProgress size={20} />
</Box>
```

---

## 27. Icon Circle Size Reference

| Size | Usage | Icon fontSize |
|---|---|---|
| 40×40, gradient bg, `borderRadius: "50%"` | GoldHealth KPI tile | `22` |
| 38×38, flat color bg, `borderRadius: "50%"` | WriterOps / DashboardInference KPI tile | `30` |
| 30×30, `borderRadius: 1.5` | Feature / driver list item | `16` |
| 22×22, alpha bg, `borderRadius: "50%"` | Compact mini tile | `14` |

---

## 28. Border Radius Inventory

| Value | Usage |
|---|---|
| `0` | Inspector panels, flat chart containers, inspector filter buttons, WeightPanel elements, profile panels, status Chips in table cells |
| `1` | Status chips in health grids, minor containers |
| `1.5` | Feature list cards, icon/score boxes in driver lists |
| `2` | Chart papers (rounded variant), compact mini tiles, filter context paper |
| `3` | All primary KPI metric tiles |
| `8px` | ToggleButton group items |
| `"50%"` | All circular icon containers |

---

## 29. Spacing Conventions

| Token | Value | Usage |
|---|---|---|
| Page horizontal padding | `"0 8px"` | `padding` on page root Box |
| Page section gap | `gap: 1` (8 px) | Between siblings inside page shell |
| Grid spacing | `spacing={1}` | All MUI Grid containers |
| KPI tile gap | `gap: 1` | Between tiles in row |
| Chip grid gap | `gap: 0.75` | Health pill grid |
| Very tight gap | `gap: 0.5` | Dense groupings |
| KPI tile padding | `p: 2` | All KPI tile variants |
| Chart panel padding | `p: 1` | Standard chart Paper |
| Left column margin-bottom | `mb: 1` | Between stacked panels |
| Header bottom padding | `pb: 1` | Page header bar |

---

## 30. Common Patterns Checklist

When building a new page or tab, verify:

- [ ] Page root uses `height: "calc(100vh - 80px)"`, `minHeight: 0`, `display: flex, flexDirection: column, gap: 1`, `padding: "0 8px"`, `bgcolor: "background.default"`
- [ ] `darkMode` sourced from `useStore()`, chart tokens from `useChartTheme()`
- [ ] Page header: `fontSize: "14px !important"`, `fontWeight: 700`, `color: darkMode ? "text.primary" : "#005071"`, `letterSpacing: "-0.3px"`, bottom border `2px solid divider`
- [ ] Tab switcher uses the `#005071` selected-state pattern (Section 5) — never a colored highlight fog
- [ ] Layout is a `<Grid container spacing={1} alignItems="stretch">` 4/8 split
- [ ] KPI row is `<Box sx={{ display: "flex", gap: 1 }}>` with 4 tiles
- [ ] KPI tiles use Variant B or C (pseudo `::before` accent rule) — Variant A only if matching WriterOps
- [ ] Section titles: `12px`, `fontWeight: 700`, `color: darkMode ? "text.primary" : "#005071"`, ALL-CAPS
- [ ] All chart containers use `ct = useChartTheme()` tokens — no hardcoded grid/axis/tooltip colors
- [ ] All bar charts: `vertical={false}` on CartesianGrid, `tickLine={false}` on axes, `isAnimationActive={false}` on bars, `cursor={{ fill: ct.tableRowEven }}` on Tooltip
- [ ] AG Grid header: `backgroundColor: "#005071 !important"` — every grid, no exceptions
- [ ] AG Grid chip cells: `borderRadius: "2px"`, `height: "20px"`, `fontWeight: "bold"`
- [ ] Inspector views: `borderRadius: 0` on the Paper shell; `borderRadius: 0` on Selects, action button, and filter row elements
- [ ] Action buttons: `bgcolor: "#0A6D94"`, `&:hover: { bgcolor: "#095B7A" }`, `borderRadius: 0`, `boxShadow: "none"`, `textTransform: "uppercase"`
- [ ] Status Chip in AG Grid: `borderRadius: "2px"`, height `20px`, MUI semantic `color` prop, `fontWeight: "bold"`
- [ ] `body text / cell text / form text` at `10px` — use global MUI override on container where applicable
- [ ] No `console.log` in production paths
- [ ] No hardcoded API URLs — use constants
