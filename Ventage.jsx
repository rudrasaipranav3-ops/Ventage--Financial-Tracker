import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  LayoutDashboard, TrendingUp, Users, Package, LineChart as LineChartIcon,
  FileText, Sparkles, Settings as SettingsIcon, ChevronLeft, ChevronRight, Upload, Download,
  Bell, Search, ArrowUpRight, ArrowDownRight, Menu, X, Send, MessageCircle,
  DollarSign, Wallet, Percent, Target, Repeat, UserMinus, Zap, ShieldCheck,
  AlertTriangle, CheckCircle2, Globe, ChevronDown, Loader2, RefreshCw, Lock,
  BarChart3, Activity, TrendingDown,
} from "lucide-react";
import Papa from "papaparse";

/* ============================================================================
   MOCK DATA ENGINE
   A deterministic pseudo-random generator drives every number on this
   dashboard so the UI is fully interactive without a live backend.
   "Regenerate demo dataset" (Settings tab) just changes the seed.
============================================================================ */

function makeRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function rng() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildMonths(count) {
  const anchor = new Date(2026, 6, 1); // July 2026
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    out.push({
      m: d.getMonth(),
      y: d.getFullYear(),
      label: MONTH_SHORT[d.getMonth()] + " '" + String(d.getFullYear()).slice(2),
    });
  }
  return out;
}

const REGIONS = ["North America", "Europe", "APAC", "LATAM"];
const REGION_SHARE = [0.44, 0.27, 0.19, 0.10];
const REGION_COLOR = { "North America": "#00E5FF", "Europe": "#3F8CFF", "APAC": "#6EE7FF", "LATAM": "#9D6BFF" };

const PRODUCT_NAMES = [
  "Core Platform License",
  "Analytics Add-on",
  "Enterprise Bundle",
  "API Access Tier",
  "Premium Support",
  "Mobile Suite",
];

const SEGMENT_NAMES = ["VIP", "Returning", "New", "At Risk", "Churned"];
const SEGMENT_COLOR = { VIP: "#00FFFF", Returning: "#3F8CFF", New: "#6EE7FF", "At Risk": "#FFB020", Churned: "#FF5C7A" };

function generateDataset(seed) {
  const rng = makeRng(seed);
  const months = buildMonths(24);
  let baseRevenue = 980000;
  let customers = 3800;

  const rows = months.map((mo, i) => {
    const seasonal = 1 + 0.06 * Math.sin((i / 12) * Math.PI * 2 + 1);
    const growth = 1.021 + (rng() - 0.5) * 0.01;
    baseRevenue = baseRevenue * growth;
    const revenue = Math.round(baseRevenue * seasonal * (0.97 + rng() * 0.06));
    const expenseRatio = 0.58 + (rng() - 0.5) * 0.05;
    const expenses = Math.round(revenue * expenseRatio);
    const profit = revenue - expenses;
    const newCustomers = Math.round(140 + rng() * 90);
    const churned = Math.round(40 + rng() * 40);
    const prevCustomers = customers;
    customers = customers + newCustomers - churned;
    const regions = {};
    REGIONS.forEach((r, ri) => {
      const wobble = 1 + (rng() - 0.5) * 0.12;
      regions[r] = Math.round(revenue * REGION_SHARE[ri] * wobble);
    });
    return {
      ...mo,
      revenue, expenses, profit, newCustomers, churned,
      customers, regions,
      churnRate: +((churned / Math.max(prevCustomers, 1)) * 100).toFixed(2),
    };
  });

  const lastRevenue = rows[rows.length - 1].revenue;
  const products = PRODUCT_NAMES.map((name, i) => {
    const share = [0.30, 0.22, 0.18, 0.13, 0.10, 0.07][i];
    const revenue = Math.round(lastRevenue * share * (0.9 + rng() * 0.2));
    const growth = +((rng() - 0.35) * 22).toFixed(1);
    return { name, revenue, growth, id: "p" + i };
  });

  const segTotal = rows[rows.length - 1].customers;
  const segShares = [0.14, 0.31, 0.22, 0.19, 0.14];
  const segments = SEGMENT_NAMES.map((name, i) => ({
    name,
    value: Math.round(segTotal * segShares[i]),
    color: SEGMENT_COLOR[name],
  }));

  return { months: rows, products, segments };
}

function applyRegionFilter(row, region) {
  if (region === "All") return row;
  const regionRevenue = row.regions[region] || 0;
  const ratio = row.revenue === 0 ? 0 : regionRevenue / row.revenue;
  const expenses = Math.round(row.expenses * ratio);
  return { ...row, revenue: regionRevenue, expenses, profit: regionRevenue - expenses };
}

function computeForecast(rows, horizon) {
  const n = rows.length;
  const xs = rows.map((_, i) => i);
  const ys = rows.map((r) => r.revenue);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const lastActual = rows[n - 1].revenue;
  const anchorDelta = lastActual - (slope * (n - 1) + intercept);
  const out = [];
  for (let h = 1; h <= horizon; h++) {
    const x = n - 1 + h;
    const base = slope * x + intercept + anchorDelta;
    const seasonal = 1 + 0.05 * Math.sin((x / 12) * Math.PI * 2 + 1);
    const point = Math.max(0, Math.round(base * seasonal));
    const spread = point * (0.03 + h * 0.018);
    const d = new Date(rows[n - 1].y, rows[n - 1].m + h, 1);
    out.push({
      label: MONTH_SHORT[d.getMonth()] + " '" + String(d.getFullYear()).slice(2),
      forecast: point,
      band: [Math.max(0, Math.round(point - spread)), Math.round(point + spread)],
      low: Math.max(0, Math.round(point - spread)),
      high: Math.round(point + spread),
    });
  }
  return { points: out, slope, monthlyGrowthPct: (slope / (yMean || 1)) * 100 };
}

/* ============================================================================
   FORMATTING HELPERS
============================================================================ */

const CURRENCIES = {
  USD: { symbol: "$", rate: 1 },
  EUR: { symbol: "\u20AC", rate: 0.92 },
  GBP: { symbol: "\u00A3", rate: 0.79 },
};

function fmtCompact(value, currency) {
  const c = CURRENCIES[currency] || CURRENCIES.USD;
  const v = value * c.rate;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1000000) return sign + c.symbol + (abs / 1000000).toFixed(2) + "M";
  if (abs >= 1000) return sign + c.symbol + (abs / 1000).toFixed(1) + "K";
  return sign + c.symbol + abs.toFixed(0);
}

function fmtFull(value, currency) {
  const c = CURRENCIES[currency] || CURRENCIES.USD;
  const v = Math.round(value * c.rate);
  return c.symbol + v.toLocaleString("en-US");
}

function fmtPct(value, digits) {
  const d = digits === undefined ? 1 : digits;
  const sign = value > 0 ? "+" : "";
  return sign + value.toFixed(d) + "%";
}

function sum(arr, key) {
  return arr.reduce((a, r) => a + r[key], 0);
}

/* ============================================================================
   HOOKS
============================================================================ */

function useCountUp(target, duration) {
  const dur = duration || 1100;
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    startRef.current = null;
    cancelAnimationFrame(rafRef.current);
    function step(ts) {
      if (startRef.current === null) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / dur, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, dur]);

  return value;
}

function useMousePosition(ref) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function handle(e) {
      const rect = el.getBoundingClientRect();
      setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    el.addEventListener("mousemove", handle);
    return () => el.removeEventListener("mousemove", handle);
  }, [ref]);
  return pos;
}

/* ============================================================================
   AI LAYER — live calls to Claude via the Anthropic Messages API.
   No key is passed here; the host environment handles auth.
============================================================================ */

async function callClaude(userContent, systemPrompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1400,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!response.ok) throw new Error("AI service returned " + response.status);
  const data = await response.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return text;
}

function buildDataSummary(filteredRows, dataset, currency, region, forecast) {
  return {
    currency,
    regionFilter: region,
    periodMonths: filteredRows.length,
    totalRevenue: sum(filteredRows, "revenue"),
    totalExpenses: sum(filteredRows, "expenses"),
    totalProfit: sum(filteredRows, "profit"),
    avgChurnRatePct: +(sum(filteredRows, "churnRate") / filteredRows.length).toFixed(2),
    monthlyRevenue: filteredRows.map((r) => ({ month: r.label, revenue: r.revenue, expenses: r.expenses, profit: r.profit })),
    regionalShare: REGIONS.map((r) => ({ region: r, revenue: dataset.months[dataset.months.length - 1].regions[r] })),
    topProducts: dataset.products.map((p) => ({ name: p.name, revenue: p.revenue, growthPct: p.growth })),
    customerSegments: dataset.segments.map((s) => ({ name: s.name, count: s.value })),
    forecastNextMonths: forecast.points.map((p) => ({ month: p.label, projectedRevenue: p.forecast, low: p.low, high: p.high })),
    projectedMonthlyGrowthPct: +forecast.monthlyGrowthPct.toFixed(2),
  };
}

/* ============================================================================
   SMALL UI ATOMS
============================================================================ */

function Delta({ value, suffix }) {
  const positive = value >= 0;
  return (
    <span className={"delta-badge " + (positive ? "delta-up" : "delta-down")}>
      {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {fmtPct(value)}{suffix || ""}
    </span>
  );
}

function Sparkline({ data, dataKey, color }) {
  return (
    <div style={{ width: "100%", height: 40 }}>
      <ResponsiveContainer>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={"spark-" + dataKey} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.55} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={"url(#spark-" + dataKey + ")"} isAnimationActive={true} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartTooltip({ active, payload, label, currency }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="glass tooltip-box">
      <div className="tooltip-label mono">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="tooltip-row">
          <span className="tooltip-dot" style={{ background: p.color || p.fill }} />
          <span className="muted-2">{p.name}</span>
          <span className="mono tooltip-value">{fmtFull(p.value, currency)}</span>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ eyebrow, title, action }) {
  return (
    <div className="section-header">
      <div>
        {eyebrow ? <div className="eyebrow mono">{eyebrow}</div> : null}
        <h2 className="display section-title">{title}</h2>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

function GlassCard({ children, className, style, delay }) {
  const cls = "glass card-pad animate-fade-up" + (className ? " " + className : "");
  return (
    <div className={cls} style={{ animationDelay: (delay || 0) + "ms", ...style }}>
      {children}
    </div>
  );
}

/* ============================================================================
   KPI CARDS
============================================================================ */

function KPICard({ icon: Icon, label, value, deltaPct, format, currency, color, sparkData, sparkKey, delay }) {
  const animated = useCountUp(value, 1200);
  const displayValue = format === "currency" ? fmtCompact(animated, currency) : format === "percent" ? animated.toFixed(1) + "%" : format === "number" ? Math.round(animated).toLocaleString("en-US") : Math.round(animated);
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  function onMove(e) {
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -6, y: px * 6 });
  }
  function onLeave() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="glass card-pad kpi-card animate-fade-up"
      style={{
        animationDelay: (delay || 0) + "ms",
        transform: "perspective(700px) rotateX(" + tilt.x + "deg) rotateY(" + tilt.y + "deg)",
      }}
    >
      <div className="kpi-top">
        <div className="icon-ring" style={{ "--ring-color": color }}>
          <Icon size={17} strokeWidth={2} color={color} />
        </div>
        {deltaPct !== null && deltaPct !== undefined ? <Delta value={deltaPct} /> : null}
      </div>
      <div className="kpi-label muted-2">{label}</div>
      <div className="kpi-value mono display">{displayValue}</div>
      {sparkData ? <Sparkline data={sparkData} dataKey={sparkKey} color={color} /> : null}
    </div>
  );
}

/* ============================================================================
   CHARTS
============================================================================ */

function RevenueOverviewChart({ rows, currency }) {
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="label" stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => fmtCompact(v, currency)} width={56} />
          <Tooltip content={<ChartTooltip currency={currency} />} />
          <Legend wrapperStyle={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }} />
          <Bar dataKey="expenses" name="Expenses" fill="rgba(63,140,255,0.35)" radius={[4, 4, 0, 0]} barSize={16} />
          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--primary)" strokeWidth={2.5} fill="url(#revFill)" />
          <Line type="monotone" dataKey="profit" name="Profit" stroke="#00FFA3" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function RegionalBarChart({ rows, region, currency }) {
  const last = rows[rows.length - 1];
  const data = REGIONS.map((r) => ({ region: r, value: last.regions[r], active: region === "All" || region === r }));
  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
          <XAxis type="number" stroke="rgba(255,255,255,0.35)" fontSize={11} tickFormatter={(v) => fmtCompact(v, currency)} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="region" stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} width={92} />
          <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Bar dataKey="value" name="Revenue" radius={[0, 6, 6, 0]} barSize={18}>
            {data.map((d, i) => (
              <Cell key={i} fill={REGION_COLOR[d.region]} opacity={d.active ? 1 : 0.25} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProductsBarChart({ products, currency }) {
  const sorted = [...products].sort((a, b) => b.revenue - a.revenue);
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={sorted} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="name" stroke="rgba(255,255,255,0.35)" fontSize={10} tickLine={false} axisLine={false} angle={-28} textAnchor="end" interval={0} height={60} />
          <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickFormatter={(v) => fmtCompact(v, currency)} tickLine={false} axisLine={false} width={56} />
          <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]} barSize={30}>
            {sorted.map((_, i) => (
              <Cell key={i} fill={i === 0 ? "var(--primary)" : "var(--secondary)"} opacity={1 - i * 0.09} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SegmentDonut({ segments }) {
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={segments} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3} strokeWidth={0}>
            {segments.map((s, i) => (
              <Cell key={i} fill={s.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip currency="USD" />} />
          <Legend
            layout="vertical"
            verticalAlign="middle"
            align="right"
            iconType="circle"
            wrapperStyle={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function PerformanceRadarChart({ current, previous }) {
  function norm(v, max) {
    return Math.max(4, Math.min(100, Math.round((v / max) * 100)));
  }
  const maxRevenue = Math.max(current.revenue, previous.revenue) * 1.15;
  const maxProfit = Math.max(current.profit, previous.profit) * 1.15;
  const data = [
    { metric: "Revenue", current: norm(current.revenue, maxRevenue), previous: norm(previous.revenue, maxRevenue) },
    { metric: "Profit", current: norm(current.profit, maxProfit), previous: norm(previous.profit, maxProfit) },
    { metric: "Retention", current: norm(100 - current.churn, 100), previous: norm(100 - previous.churn, 100) },
    { metric: "Efficiency", current: norm(current.profit / Math.max(current.expenses, 1), 1.4), previous: norm(previous.profit / Math.max(previous.expenses, 1), 1.4) },
    { metric: "Growth", current: norm(Math.max(current.revenue - previous.revenue, 0) + maxRevenue * 0.15, maxRevenue * 0.3), previous: 55 },
  ];
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="rgba(255,255,255,0.1)" />
          <PolarAngleAxis dataKey="metric" stroke="rgba(255,255,255,0.55)" fontSize={11} />
          <PolarRadiusAxis stroke="rgba(255,255,255,0.08)" tick={false} axisLine={false} />
          <Radar name="Previous period" dataKey="previous" stroke="rgba(255,255,255,0.35)" fill="rgba(255,255,255,0.08)" strokeWidth={1.5} />
          <Radar name="Current period" dataKey="current" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.28} strokeWidth={2} />
          <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ForecastChart({ historyRows, forecast, currency }) {
  const history = historyRows.map((r) => ({ label: r.label, actual: r.revenue }));
  const future = forecast.points.map((p) => ({ label: p.label, forecast: p.forecast, band: [p.low, p.high] }));
  const bridge = history.length ? [{ label: history[history.length - 1].label, actual: history[history.length - 1].actual, forecast: history[history.length - 1].actual, band: [history[history.length - 1].actual, history[history.length - 1].actual] }] : [];
  const data = [...history, ...bridge, ...future];

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="fcActual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="label" stroke="rgba(255,255,255,0.35)" fontSize={10} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(data.length / 10))} />
          <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickFormatter={(v) => fmtCompact(v, currency)} tickLine={false} axisLine={false} width={56} />
          <Tooltip content={<ChartTooltip currency={currency} />} />
          <Area type="monotone" dataKey="band" name="Confidence range" stroke="none" fill="var(--secondary)" fillOpacity={0.14} />
          <Area type="monotone" dataKey="actual" name="Actual revenue" stroke="var(--primary)" strokeWidth={2.5} fill="url(#fcActual)" connectNulls />
          <Line type="monotone" dataKey="forecast" name="Forecast" stroke="var(--accent)" strokeWidth={2.5} strokeDasharray="6 5" dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================================================================
   AI INSIGHTS — live report generation + natural-language Q&A
============================================================================ */

const REPORT_SYSTEM_PROMPT =
  "You are the AI analyst embedded in Vantage, a financial performance dashboard. " +
  "You will receive a JSON summary of a company's financial dataset. Respond with ONLY valid JSON " +
  "(no markdown fences, no preamble) matching exactly this shape: " +
  '{"healthScore": number 0-100, "summary": "2-3 sentence executive summary", ' +
  '"insights": ["3-4 short specific insights citing real numbers from the data"], ' +
  '"risks": ["2-3 short specific business risks"], ' +
  '"opportunities": ["2-3 short growth opportunities"], ' +
  '"actionItems": ["3-4 short concrete next actions"], ' +
  '"swot": {"strengths": ["2 items"], "weaknesses": ["2 items"], "opportunities": ["2 items"], "threats": ["2 items"]}}. ' +
  "Ground every claim in the numbers provided. Be specific and concise, no filler.";

const CHAT_SYSTEM_PROMPT =
  "You are the AI analyst embedded in Vantage, a financial performance dashboard. " +
  "Answer the user's question about their data using ONLY the JSON dataset summary provided. " +
  "Be concise (2-4 sentences), cite specific numbers, and never invent data not present in the summary. " +
  "If the question needs data you don't have, say so plainly. Plain text only, no markdown.";

function HealthGauge({ score }) {
  const animated = useCountUp(score || 0, 1200);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, animated));
  const offset = circumference * (1 - pct / 100);
  const color = pct >= 70 ? "#00FFA3" : pct >= 40 ? "#FFB020" : "#FF5C7A";
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
      <circle
        cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        transform="rotate(-90 60 60)" style={{ transition: "stroke-dashoffset 0.3s ease" }}
      />
      <text x="60" y="56" textAnchor="middle" fontSize="26" fontWeight="700" fill="#fff" fontFamily="IBM Plex Mono, monospace">
        {Math.round(pct)}
      </text>
      <text x="60" y="74" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.5)" letterSpacing="1">
        HEALTH SCORE
      </text>
    </svg>
  );
}

function AIInsightsPanel({ filteredRows, dataset, currency, region, forecast }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const summary = buildDataSummary(filteredRows, dataset, currency, region, forecast);
      const raw = await callClaude(JSON.stringify(summary), REPORT_SYSTEM_PROMPT);
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setReport(parsed);
    } catch (e) {
      setError("Could not generate the AI report right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassCard className="ai-report-card">
      <div className="ai-report-head">
        <div>
          <div className="eyebrow mono">AI ANALYST</div>
          <h3 className="display section-title-sm">Executive Intelligence Report</h3>
          <p className="muted-2 small-text">Generated live by Claude from your current filtered dataset.</p>
        </div>
        <button className="btn-primary" onClick={generate} disabled={loading}>
          {loading ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
          {loading ? "Analyzing\u2026" : report ? "Regenerate" : "Generate Report"}
        </button>
      </div>

      {error ? <div className="ai-error"><AlertTriangle size={14} /> {error}</div> : null}

      {loading && !report ? (
        <div className="report-skeleton">
          <div className="shimmer skel skel-circle" />
          <div className="skel-lines">
            <div className="shimmer skel skel-line" style={{ width: "80%" }} />
            <div className="shimmer skel skel-line" style={{ width: "60%" }} />
            <div className="shimmer skel skel-line" style={{ width: "70%" }} />
          </div>
        </div>
      ) : null}

      {report ? (
        <div className="report-body">
          <div className="report-top">
            <HealthGauge score={report.healthScore} />
            <p className="report-summary">{report.summary}</p>
          </div>

          <div className="report-grid">
            <div className="report-list-block">
              <div className="report-list-title"><Sparkles size={13} color="var(--primary)" /> Key Insights</div>
              <ul className="report-list">
                {(report.insights || []).map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
            <div className="report-list-block">
              <div className="report-list-title"><AlertTriangle size={13} color="#FFB020" /> Risks</div>
              <ul className="report-list">
                {(report.risks || []).map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
            <div className="report-list-block">
              <div className="report-list-title"><Target size={13} color="#00FFA3" /> Opportunities</div>
              <ul className="report-list">
                {(report.opportunities || []).map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
            <div className="report-list-block">
              <div className="report-list-title"><CheckCircle2 size={13} color="var(--accent)" /> Action Items</div>
              <ul className="report-list">
                {(report.actionItems || []).map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          </div>

          {report.swot ? (
            <div className="swot-grid">
              {[
                { key: "strengths", label: "Strengths", color: "#00FFA3" },
                { key: "weaknesses", label: "Weaknesses", color: "#FFB020" },
                { key: "opportunities", label: "Opportunities", color: "var(--primary)" },
                { key: "threats", label: "Threats", color: "#FF5C7A" },
              ].map((q) => (
                <div key={q.key} className="swot-cell" style={{ borderTopColor: q.color }}>
                  <div className="swot-label" style={{ color: q.color }}>{q.label}</div>
                  <ul className="report-list">
                    {(report.swot[q.key] || []).map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && !report && !error ? (
        <div className="ai-empty muted-2">Click "Generate Report" to have Claude analyze the current period and produce an executive summary, risk assessment, and action plan.</div>
      ) : null}
    </GlassCard>
  );
}

const QUICK_PROMPTS = [
  "Why did revenue change this period?",
  "Predict next quarter's revenue",
  "Which region is performing best?",
  "What's driving churn?",
];

function AIChatWidget({ filteredRows, dataset, currency, region, forecast }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hi, I'm your AI analyst. Ask me anything about the current dashboard data \u2014 revenue drivers, forecasts, regional performance, or churn." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  async function send(text) {
    const question = (text || input).trim();
    if (!question || loading) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setLoading(true);
    try {
      const summary = buildDataSummary(filteredRows, dataset, currency, region, forecast);
      const content = "DATASET SUMMARY:\n" + JSON.stringify(summary) + "\n\nQUESTION: " + question;
      const answer = await callClaude(content, CHAT_SYSTEM_PROMPT);
      setMessages((m) => [...m, { role: "assistant", text: answer || "I wasn't able to form an answer from the current data." }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "I couldn't reach the AI service just now. Please try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className={"chat-fab" + (open ? " chat-fab-open" : "")} onClick={() => setOpen((o) => !o)} aria-label="Open AI chat assistant">
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>
      {open ? (
        <div className="chat-panel glass">
          <div className="chat-header">
            <div className="chat-header-title">
              <Sparkles size={15} color="var(--primary)" />
              <span className="display">Ask Vantage AI</span>
            </div>
            <button className="icon-btn" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <div className="chat-body" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={"chat-msg " + (m.role === "user" ? "chat-msg-user" : "chat-msg-ai")}>
                {m.text}
              </div>
            ))}
            {loading ? <div className="chat-msg chat-msg-ai chat-typing"><Loader2 size={13} className="spin" /> thinking\u2026</div> : null}
          </div>
          <div className="chat-quick">
            {QUICK_PROMPTS.map((q) => (
              <button key={q} className="chip" onClick={() => send(q)} disabled={loading}>{q}</button>
            ))}
          </div>
          <div className="chat-input-row">
            <input
              className="chat-input"
              placeholder="Ask about your data\u2026"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            />
            <button className="btn-primary chat-send" onClick={() => send()} disabled={loading || !input.trim()}>
              <Send size={15} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ============================================================================
   REPORTS / UPLOAD PANEL
============================================================================ */

function UploadPanel({ dataset, filteredRows, currency, role }) {
  const [rows, setRows] = useState(null);
  const [fields, setFields] = useState([]);
  const [fileName, setFileName] = useState(null);
  const [excludeIncomplete, setExcludeIncomplete] = useState(true);
  const [parseError, setParseError] = useState(null);
  const canExport = role !== "Viewer";

  function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setParseError(null);
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        setFields(results.meta.fields || []);
        setRows(results.data || []);
      },
      error: () => setParseError("Couldn't parse that file. Please upload a valid CSV."),
    });
  }

  const cleanRows = useMemo(() => {
    if (!rows) return [];
    if (!excludeIncomplete) return rows;
    return rows.filter((r) => fields.every((f) => r[f] !== null && r[f] !== undefined && r[f] !== ""));
  }, [rows, excludeIncomplete, fields]);

  const numericFields = useMemo(() => {
    if (!rows || !rows.length) return [];
    return fields.filter((f) => typeof rows[0][f] === "number");
  }, [rows, fields]);

  const columnStats = useMemo(() => {
    return numericFields.map((f) => {
      const vals = cleanRows.map((r) => r[f]).filter((v) => typeof v === "number");
      if (!vals.length) return { field: f, min: 0, max: 0, avg: 0, total: 0 };
      const total = vals.reduce((a, b) => a + b, 0);
      return { field: f, min: Math.min(...vals), max: Math.max(...vals), avg: total / vals.length, total };
    });
  }, [cleanRows, numericFields]);

  function exportCSV() {
    const header = "Month,Revenue,Expenses,Profit,Churn Rate %,Customers\n";
    const body = filteredRows.map((r) => [r.label, r.revenue, r.expenses, r.profit, r.churnRate, r.customers].join(",")).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vantage-financial-export.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack-lg">
      <GlassCard>
        <SectionHeader eyebrow="DATA IMPORT" title="Upload a dataset" />
        <p className="muted-2 small-text" style={{ marginBottom: 14 }}>
          Drop in a CSV export from your accounting or CRM tool. Columns are detected automatically, rows missing
          required fields can be excluded, and numeric columns are summarized instantly &mdash; all in your browser.
        </p>
        <label className="upload-drop">
          <Upload size={22} color="var(--primary)" />
          <span className="upload-drop-text">{fileName ? fileName : "Click to choose a CSV file"}</span>
          <input type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
        </label>
        {parseError ? <div className="ai-error"><AlertTriangle size={14} /> {parseError}</div> : null}

        {rows ? (
          <div className="upload-results">
            <div className="upload-meta-row">
              <span className="muted-2 small-text">{fields.length} columns detected &middot; {rows.length} rows read &middot; {cleanRows.length} clean rows</span>
              <label className="toggle-row">
                <input type="checkbox" checked={excludeIncomplete} onChange={(e) => setExcludeIncomplete(e.target.checked)} />
                <span className="small-text muted-2">Exclude incomplete rows</span>
              </label>
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>{fields.map((f) => <th key={f}>{f}</th>)}</tr>
                </thead>
                <tbody>
                  {cleanRows.slice(0, 8).map((r, i) => (
                    <tr key={i}>{fields.map((f) => <td key={f}>{String(r[f])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>

            {columnStats.length ? (
              <div className="stats-grid">
                {columnStats.map((s) => (
                  <div key={s.field} className="stat-chip">
                    <div className="stat-chip-label">{s.field}</div>
                    <div className="stat-chip-value mono">avg {s.avg.toFixed(1)}</div>
                    <div className="stat-chip-sub muted-3">min {s.min.toFixed(1)} &middot; max {s.max.toFixed(1)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </GlassCard>

      <GlassCard>
        <SectionHeader eyebrow="EXPORT" title="Export current view" />
        <div className="export-row">
          <button className="btn-secondary" onClick={exportCSV} disabled={!canExport}>
            <Download size={15} /> Export CSV
          </button>
          <button className="btn-secondary" disabled title="Requires the PDFKit backend service">
            <Lock size={13} /> Export PDF
          </button>
          <button className="btn-secondary" disabled title="Requires the ExcelJS backend service">
            <Lock size={13} /> Export Excel
          </button>
        </div>
        {!canExport ? <div className="muted-3 small-text" style={{ marginTop: 10 }}>Exporting is disabled for the Viewer role. Switch roles in Settings.</div> : null}
        <div className="muted-3 small-text" style={{ marginTop: 10 }}>
          CSV export runs entirely in your browser. PDF and Excel exports are wired to the Node backend (PDFKit / ExcelJS) in the full-stack build.
        </div>
      </GlassCard>
    </div>
  );
}

/* ============================================================================
   SETTINGS PANEL
============================================================================ */

const THEME_PRESETS = [
  { name: "Cyan", primary: "#00E5FF", accent: "#6EE7FF" },
  { name: "Violet", primary: "#9D6BFF", accent: "#C4A6FF" },
  { name: "Emerald", primary: "#00FFA3", accent: "#7CFFCB" },
  { name: "Amber", primary: "#FFB020", accent: "#FFD37A" },
];

const ROLES = ["Admin", "Manager", "Analyst", "Viewer"];

function SettingsPanel({ role, setRole, themeColor, setThemeColor, onRegenerate }) {
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifWeekly, setNotifWeekly] = useState(false);

  return (
    <div className="stack-lg">
      <GlassCard>
        <SectionHeader eyebrow="ACCOUNT" title="Profile" />
        <div className="profile-row">
          <div className="avatar-circle mono">AM</div>
          <div>
            <div className="profile-name">Alex Morgan</div>
            <div className="muted-2 small-text">alex.morgan@vantage-demo.io</div>
          </div>
        </div>
        <div className="field-row">
          <label className="field-label muted-2 small-text">Role</label>
          <select className="select-input" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="muted-3 small-text">Role changes update permissions live &mdash; try switching to Viewer and revisiting the Reports tab.</div>
      </GlassCard>

      <GlassCard>
        <SectionHeader eyebrow="APPEARANCE" title="Accent theme" />
        <div className="theme-swatches">
          {THEME_PRESETS.map((t) => (
            <button
              key={t.name}
              className={"theme-swatch" + (themeColor.name === t.name ? " theme-swatch-active" : "")}
              style={{ "--swatch-color": t.primary }}
              onClick={() => setThemeColor(t)}
            >
              <span className="theme-swatch-dot" style={{ background: t.primary }} />
              {t.name}
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <SectionHeader eyebrow="NOTIFICATIONS" title="Preferences" />
        <div className="toggle-list">
          <label className="toggle-row toggle-row-full">
            <span>Email alerts on anomalies</span>
            <input type="checkbox" checked={notifEmail} onChange={(e) => setNotifEmail(e.target.checked)} />
          </label>
          <label className="toggle-row toggle-row-full">
            <span>Weekly executive digest</span>
            <input type="checkbox" checked={notifWeekly} onChange={(e) => setNotifWeekly(e.target.checked)} />
          </label>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionHeader eyebrow="DEMO DATA" title="Dataset controls" />
        <p className="muted-2 small-text" style={{ marginBottom: 12 }}>Regenerate the underlying mock dataset with a new random seed to see the dashboard respond.</p>
        <button className="btn-secondary" onClick={onRegenerate}>
          <RefreshCw size={14} /> Regenerate demo dataset
        </button>
      </GlassCard>
    </div>
  );
}

/* ============================================================================
   SIDEBAR + TOPBAR
============================================================================ */

const NAV_ITEMS = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "revenue", label: "Revenue", icon: TrendingUp },
  { id: "customers", label: "Customers", icon: Users },
  { id: "products", label: "Products", icon: Package },
  { id: "forecasting", label: "Forecasting", icon: LineChartIcon },
  { id: "ai", label: "AI Insights", icon: Sparkles },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

function Sidebar({ tab, setTab, collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  return (
    <>
      {mobileOpen ? <div className="sidebar-scrim" onClick={() => setMobileOpen(false)} /> : null}
      <aside className={"sidebar glass" + (collapsed ? " sidebar-collapsed" : "") + (mobileOpen ? " sidebar-mobile-open" : "")}>
        <div className="sidebar-brand">
          <div className="brand-mark"><Zap size={16} color="#04101c" /></div>
          {!collapsed ? <span className="display brand-word">VANTAGE</span> : null}
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                className={"nav-item" + (active ? " nav-item-active" : "")}
                onClick={() => { setTab(item.id); setMobileOpen(false); }}
                title={item.label}
              >
                <Icon size={17} />
                {!collapsed ? <span>{item.label}</span> : null}
                {active ? <span className="nav-active-dot" /> : null}
              </button>
            );
          })}
        </nav>
        <button className="sidebar-collapse-btn" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Collapse</span></>}
        </button>
      </aside>
    </>
  );
}

function Topbar({ tab, dateRange, setDateRange, region, setRegion, currency, setCurrency, role, onMenuClick }) {
  const activeLabel = (NAV_ITEMS.find((n) => n.id === tab) || {}).label || "Dashboard";
  return (
    <header className="topbar glass">
      <div className="topbar-left">
        <button className="icon-btn mobile-only" onClick={onMenuClick}><Menu size={18} /></button>
        <div>
          <div className="eyebrow mono">VANTAGE / {activeLabel.toUpperCase()}</div>
          <h1 className="display topbar-title">{activeLabel}</h1>
        </div>
      </div>
      <div className="topbar-filters">
        <div className="filter-chip">
          <Globe size={13} />
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="All">All Regions</option>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="filter-chip">
          <span className="mono filter-currency-icon">{CURRENCIES[currency].symbol}</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {Object.keys(CURRENCIES).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="filter-chip">
          <ChevronDown size={13} />
          <select value={dateRange} onChange={(e) => setDateRange(Number(e.target.value))}>
            <option value={3}>Last 3 Months</option>
            <option value={6}>Last 6 Months</option>
            <option value={12}>Last 12 Months</option>
          </select>
        </div>
      </div>
      <div className="topbar-right">
        <button className="icon-btn"><Search size={17} /></button>
        <button className="icon-btn icon-btn-dot"><Bell size={17} /></button>
        <div className="role-pill mono">{role}</div>
        <div className="avatar-circle avatar-circle-sm mono">AM</div>
      </div>
    </header>
  );
}

/* ============================================================================
   LANDING PAGE
============================================================================ */

const SUBTITLE_WORDS = ["Business Intelligence", "Forecasting", "Predictive Analytics", "Executive Insights"];
const TRUSTED_BY = ["NORTHPEAK", "VERTEX ANALYTICS", "LUMEN CAPITAL", "ORBIT FINANCIAL", "ATLAS HOLDINGS", "CASCADE GROUP", "MERIDIAN LABS", "PINNACLE VENTURES"];

function LandingPage({ onLaunch }) {
  const heroRef = useRef(null);
  const mouse = useMousePosition(heroRef);
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setWordIndex((i) => (i + 1) % SUBTITLE_WORDS.length), 2200);
    return () => clearInterval(id);
  }, []);

  const particles = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 24; i++) {
      arr.push({
        id: i,
        left: (i * 37) % 100,
        top: (i * 53) % 100,
        size: 2 + (i % 4),
        delay: (i % 8) * 0.6,
        dur: 5 + (i % 5),
      });
    }
    return arr;
  }, []);

  return (
    <div className="landing" ref={heroRef}>
      <div className="landing-glow" style={{ transform: "translate(" + mouse.x * 0.02 + "px," + mouse.y * 0.02 + "px)" }} />
      <div className="landing-particles">
        {particles.map((p) => (
          <span
            key={p.id}
            className="particle"
            style={{ left: p.left + "%", top: p.top + "%", width: p.size, height: p.size, animationDelay: p.delay + "s", animationDuration: p.dur + "s" }}
          />
        ))}
      </div>

      <nav className="landing-nav">
        <div className="sidebar-brand">
          <div className="brand-mark"><Zap size={16} color="#04101c" /></div>
          <span className="display brand-word">VANTAGE</span>
        </div>
        <button className="btn-secondary" onClick={onLaunch}>Launch Dashboard</button>
      </nav>

      <section className="hero">
        <div className="hero-badge animate-fade-up">
          <Sparkles size={13} color="var(--primary)" /> AI-Native Financial Intelligence
        </div>
        <h1 className="display hero-title animate-fade-up" style={{ animationDelay: "80ms" }}>
          Financial Intelligence
          <br />
          <span className="text-gradient">Powered by AI</span>
        </h1>
        <div className="hero-subtitle animate-fade-up" style={{ animationDelay: "160ms" }}>
          <span className="muted-1">Real-time</span>{" "}
          <span key={wordIndex} className="hero-word text-gradient">{SUBTITLE_WORDS[wordIndex]}</span>{" "}
          <span className="muted-1">for teams who move fast.</span>
        </div>
        <div className="hero-ctas animate-fade-up" style={{ animationDelay: "240ms" }}>
          <button className="btn-primary btn-lg" onClick={onLaunch}>
            <Zap size={16} /> Launch Dashboard
          </button>
          <button className="btn-ghost btn-lg" onClick={onLaunch}>
            View Analytics <ArrowUpRight size={16} />
          </button>
        </div>

        <div className="hero-floaters animate-fade-up" style={{ animationDelay: "320ms" }}>
          <div className="floater-card glass animate-float" style={{ animationDelay: "0s" }}>
            <div className="floater-label muted-2">MRR</div>
            <div className="mono floater-value">$2.4M</div>
            <div className="floater-spark">
              <svg viewBox="0 0 100 30" preserveAspectRatio="none">
                <polyline points="0,25 15,20 30,22 45,12 60,15 75,6 100,4" fill="none" stroke="#00FFA3" strokeWidth="2" />
              </svg>
            </div>
          </div>
          <div className="floater-card glass animate-float" style={{ animationDelay: "1.2s" }}>
            <div className="floater-label muted-2">FORECAST CONFIDENCE</div>
            <div className="mono floater-value">94.2%</div>
          </div>
          <div className="floater-card glass animate-float" style={{ animationDelay: "0.6s" }}>
            <div className="floater-label muted-2">CHURN RISK</div>
            <div className="mono floater-value" style={{ color: "#FFB020" }}>Low</div>
          </div>
        </div>
      </section>

      <div className="marquee-wrap">
        <div className="muted-3 small-text marquee-label">TRUSTED BY FINANCE TEAMS AT</div>
        <div className="marquee-track">
          <div className="marquee-inner">
            {[...TRUSTED_BY, ...TRUSTED_BY].map((name, i) => (
              <span key={i} className="marquee-item mono">{name}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   MAIN APP
============================================================================ */

export default function App() {
  const [view, setView] = useState("landing");
  const [tab, setTab] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dateRange, setDateRange] = useState(12);
  const [region, setRegion] = useState("All");
  const [currency, setCurrency] = useState("USD");
  const [role, setRole] = useState("Admin");
  const [themeColor, setThemeColor] = useState(THEME_PRESETS[0]);
  const [seed, setSeed] = useState(42);
  const [forecastHorizon, setForecastHorizon] = useState(6);

  const dataset = useMemo(() => generateDataset(seed), [seed]);

  const filteredRows = useMemo(
    () => dataset.months.slice(-dateRange).map((r) => applyRegionFilter(r, region)),
    [dataset, dateRange, region]
  );
  const previousRows = useMemo(() => {
    const slice = dataset.months.slice(-(dateRange * 2), -dateRange);
    return slice.map((r) => applyRegionFilter(r, region));
  }, [dataset, dateRange, region]);

  const forecast = useMemo(() => computeForecast(dataset.months, forecastHorizon), [dataset, forecastHorizon]);

  const cur = {
    revenue: sum(filteredRows, "revenue"),
    expenses: sum(filteredRows, "expenses"),
    profit: sum(filteredRows, "profit"),
    churn: filteredRows.length ? sum(filteredRows, "churnRate") / filteredRows.length : 0,
  };
  const prev = previousRows.length
    ? {
        revenue: sum(previousRows, "revenue"),
        expenses: sum(previousRows, "expenses"),
        profit: sum(previousRows, "profit"),
        churn: sum(previousRows, "churnRate") / previousRows.length,
      }
    : cur;

  const pctDelta = (a, b) => (b === 0 ? 0 : ((a - b) / Math.abs(b)) * 100);
  const lastRow = filteredRows[filteredRows.length - 1] || { customers: 1 };
  const netMargin = cur.revenue === 0 ? 0 : (cur.profit / cur.revenue) * 100;
  const prevNetMargin = prev.revenue === 0 ? 0 : (prev.profit / prev.revenue) * 100;
  const grossMargin = cur.revenue === 0 ? 0 : ((cur.revenue - cur.expenses * 0.6) / cur.revenue) * 100;
  const clv = (cur.revenue / Math.max(lastRow.customers, 1)) * 3;
  const aov = cur.revenue / Math.max(lastRow.customers * 2.1, 1);
  const cashFlow = cur.profit * 0.85;
  const roi = cur.expenses === 0 ? 0 : (cur.profit / cur.expenses) * 100;

  const kpiSparkData = filteredRows.map((r) => ({ label: r.label, revenue: r.revenue, profit: r.profit, churnRate: r.churnRate }));

  function regenerate() {
    setSeed(Math.floor(Math.random() * 100000) + 1);
  }

  const rootStyle = { "--primary": themeColor.primary, "--accent": themeColor.accent };

  if (view === "landing") {
    return (
      <div className="app-root" style={rootStyle}>
        <GlobalStyles />
        <LandingPage onLaunch={() => setView("app")} />
      </div>
    );
  }

  return (
    <div className="app-root" style={rootStyle}>
      <GlobalStyles />
      <div className="app-bg-grid" />
      <Sidebar tab={tab} setTab={setTab} collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className={"main-area" + (collapsed ? " main-area-collapsed" : "")}>
        <Topbar
          tab={tab} dateRange={dateRange} setDateRange={setDateRange}
          region={region} setRegion={setRegion} currency={currency} setCurrency={setCurrency}
          role={role} onMenuClick={() => setMobileOpen(true)}
        />

        <main className="content">
          {tab === "overview" ? (
            <>
              <div className="kpi-grid">
                <KPICard icon={DollarSign} label="Revenue" value={cur.revenue} deltaPct={pctDelta(cur.revenue, prev.revenue)} format="currency" currency={currency} color="var(--primary)" sparkData={kpiSparkData} sparkKey="revenue" delay={0} />
                <KPICard icon={Wallet} label="Profit" value={cur.profit} deltaPct={pctDelta(cur.profit, prev.profit)} format="currency" currency={currency} color="#00FFA3" sparkData={kpiSparkData} sparkKey="profit" delay={40} />
                <KPICard icon={Percent} label="Net Margin" value={netMargin} deltaPct={pctDelta(netMargin, prevNetMargin)} format="percent" currency={currency} color="var(--secondary)" delay={80} />
                <KPICard icon={BarChart3} label="Gross Margin" value={grossMargin} deltaPct={null} format="percent" currency={currency} color="var(--accent)" delay={120} />
                <KPICard icon={UserMinus} label="Churn Rate" value={cur.churn} deltaPct={pctDelta(cur.churn, prev.churn) * -1} format="percent" currency={currency} color="#FF5C7A" sparkData={kpiSparkData} sparkKey="churnRate" delay={160} />
                <KPICard icon={Target} label="ROI" value={roi} deltaPct={null} format="percent" currency={currency} color="#FFB020" delay={200} />
              </div>

              <div className="grid-2-1">
                <GlassCard delay={100}>
                  <SectionHeader eyebrow="FINANCIAL OVERVIEW" title="Revenue, expenses & profit" />
                  <RevenueOverviewChart rows={filteredRows} currency={currency} />
                </GlassCard>
                <GlassCard delay={140}>
                  <SectionHeader eyebrow="CUSTOMERS" title="Segments" />
                  <SegmentDonut segments={dataset.segments} />
                </GlassCard>
              </div>

              <div className="grid-2">
                <GlassCard delay={100}>
                  <SectionHeader eyebrow="GEOGRAPHY" title="Regional revenue" />
                  <RegionalBarChart rows={filteredRows.length ? filteredRows : dataset.months} region={region} currency={currency} />
                </GlassCard>
                <GlassCard delay={140}>
                  <SectionHeader eyebrow="BENCHMARK" title="Performance radar" />
                  <PerformanceRadarChart current={cur} previous={prev} />
                </GlassCard>
              </div>
            </>
          ) : null}

          {tab === "revenue" ? (
            <>
              <div className="kpi-grid kpi-grid-3">
                <KPICard icon={DollarSign} label="Total Revenue" value={cur.revenue} deltaPct={pctDelta(cur.revenue, prev.revenue)} format="currency" currency={currency} color="var(--primary)" sparkData={kpiSparkData} sparkKey="revenue" delay={0} />
                <KPICard icon={Wallet} label="Cash Flow" value={cashFlow} deltaPct={null} format="currency" currency={currency} color="#00FFA3" delay={40} />
                <KPICard icon={Activity} label="Avg Order Value" value={aov} deltaPct={null} format="currency" currency={currency} color="var(--accent)" delay={80} />
              </div>
              <GlassCard delay={100}>
                <SectionHeader eyebrow="TREND" title="Revenue vs expenses vs profit" />
                <RevenueOverviewChart rows={filteredRows} currency={currency} />
              </GlassCard>
              <div className="grid-2">
                <GlassCard delay={100}>
                  <SectionHeader eyebrow="GEOGRAPHY" title="Revenue by region" />
                  <RegionalBarChart rows={filteredRows.length ? filteredRows : dataset.months} region={region} currency={currency} />
                </GlassCard>
                <GlassCard delay={140}>
                  <SectionHeader eyebrow="DETAIL" title="Monthly breakdown" />
                  <div className="table-scroll table-scroll-tall">
                    <table className="data-table">
                      <thead><tr><th>Month</th><th>Revenue</th><th>Expenses</th><th>Profit</th></tr></thead>
                      <tbody>
                        {[...filteredRows].reverse().map((r) => (
                          <tr key={r.label}>
                            <td>{r.label}</td>
                            <td className="mono">{fmtFull(r.revenue, currency)}</td>
                            <td className="mono">{fmtFull(r.expenses, currency)}</td>
                            <td className="mono" style={{ color: r.profit >= 0 ? "#00FFA3" : "#FF5C7A" }}>{fmtFull(r.profit, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              </div>
            </>
          ) : null}

          {tab === "customers" ? (
            <>
              <div className="kpi-grid kpi-grid-3">
                <KPICard icon={Users} label="Active Customers" value={lastRow.customers} deltaPct={null} format="number" currency={currency} color="var(--primary)" delay={0} />
                <KPICard icon={UserMinus} label="Churn Rate" value={cur.churn} deltaPct={pctDelta(cur.churn, prev.churn) * -1} format="percent" currency={currency} color="#FF5C7A" sparkData={kpiSparkData} sparkKey="churnRate" delay={40} />
                <KPICard icon={Repeat} label="Customer LTV" value={clv} deltaPct={null} format="currency" currency={currency} color="#00FFA3" delay={80} />
              </div>
              <div className="grid-2-1">
                <GlassCard delay={100}>
                  <SectionHeader eyebrow="SEGMENTATION" title="Customer segments" />
                  <SegmentDonut segments={dataset.segments} />
                </GlassCard>
                <GlassCard delay={140}>
                  <SectionHeader eyebrow="RFM" title="Segment breakdown" />
                  <ul className="report-list segment-legend">
                    {dataset.segments.map((s) => (
                      <li key={s.name}>
                        <span className="tooltip-dot" style={{ background: s.color }} />
                        <span style={{ flex: 1 }}>{s.name}</span>
                        <span className="mono">{s.value.toLocaleString("en-US")}</span>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </div>
            </>
          ) : null}

          {tab === "products" ? (
            <>
              <GlassCard delay={0}>
                <SectionHeader eyebrow="CATALOG" title="Top products by revenue" />
                <ProductsBarChart products={dataset.products} currency={currency} />
              </GlassCard>
              <GlassCard delay={80}>
                <SectionHeader eyebrow="DETAIL" title="Product performance" />
                <div className="table-scroll">
                  <table className="data-table">
                    <thead><tr><th>Product</th><th>Revenue</th><th>Growth</th></tr></thead>
                    <tbody>
                      {[...dataset.products].sort((a, b) => b.revenue - a.revenue).map((p) => (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td className="mono">{fmtFull(p.revenue, currency)}</td>
                          <td><Delta value={p.growth} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </>
          ) : null}

          {tab === "forecasting" ? (
            <>
              <div className="kpi-grid kpi-grid-3">
                <KPICard icon={TrendingUp} label={"Projected Revenue (" + forecastHorizon + "mo)"} value={forecast.points.reduce((a, p) => a + p.forecast, 0)} deltaPct={null} format="currency" currency={currency} color="var(--primary)" delay={0} />
                <KPICard icon={Activity} label="Monthly Growth Trend" value={forecast.monthlyGrowthPct} deltaPct={null} format="percent" currency={currency} color="#00FFA3" delay={40} />
                <KPICard icon={ShieldCheck} label="Forecast Confidence" value={Math.max(60, 96 - forecastHorizon * 2)} deltaPct={null} format="percent" currency={currency} color="var(--accent)" delay={80} />
              </div>
              <GlassCard delay={100}>
                <SectionHeader
                  eyebrow="PYTHON / PROPHET-STYLE PROJECTION"
                  title="Revenue forecast"
                  action={
                    <div className="segmented">
                      <button className={forecastHorizon === 3 ? "seg-active" : ""} onClick={() => setForecastHorizon(3)}>30-day</button>
                      <button className={forecastHorizon === 6 ? "seg-active" : ""} onClick={() => setForecastHorizon(6)}>90-day</button>
                    </div>
                  }
                />
                <ForecastChart historyRows={dataset.months.slice(-12)} forecast={forecast} currency={currency} />
                <div className="muted-3 small-text" style={{ marginTop: 10 }}>
                  Projection uses trend regression over 24 months of history with seasonal adjustment. The shaded band widens with horizon length to represent growing uncertainty &mdash; the production build replaces this with a Prophet model in the Python service.
                </div>
              </GlassCard>
            </>
          ) : null}

          {tab === "ai" ? (
            <AIInsightsPanel filteredRows={filteredRows} dataset={dataset} currency={currency} region={region} forecast={forecast} />
          ) : null}

          {tab === "reports" ? (
            <UploadPanel dataset={dataset} filteredRows={filteredRows} currency={currency} role={role} />
          ) : null}

          {tab === "settings" ? (
            <SettingsPanel role={role} setRole={setRole} themeColor={themeColor} setThemeColor={setThemeColor} onRegenerate={regenerate} />
          ) : null}
        </main>
      </div>

      <AIChatWidget filteredRows={filteredRows} dataset={dataset} currency={currency} region={region} forecast={forecast} />
    </div>
  );
}

/* ============================================================================
   GLOBAL STYLES — dark neon-blue glassmorphism theme
============================================================================ */

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

      .app-root {
        --primary: #00E5FF;
        --secondary: #3F8CFF;
        --accent: #6EE7FF;
        --bg-deep: #060a16;
        --card-bg: rgba(18,25,45,0.72);
        --border-glass: rgba(255,255,255,0.08);
        position: relative;
        min-height: 100vh;
        background: radial-gradient(ellipse 80% 60% at 15% -10%, rgba(0,229,255,0.16), transparent 55%),
                    radial-gradient(ellipse 70% 50% at 100% 0%, rgba(63,140,255,0.14), transparent 55%),
                    var(--bg-deep);
        color: #EAF2FA;
        font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
        overflow-x: hidden;
      }
      .app-root * { box-sizing: border-box; }
      .display { font-family: 'Space Grotesk', 'Inter', sans-serif; letter-spacing: -0.01em; }
      .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
      .muted-1 { color: rgba(234,242,250,0.82); }
      .muted-2 { color: rgba(234,242,250,0.58); }
      .muted-3 { color: rgba(234,242,250,0.38); }
      .small-text { font-size: 12.5px; line-height: 1.5; }
      .eyebrow { font-size: 10.5px; letter-spacing: 0.14em; color: var(--primary); font-weight: 600; margin-bottom: 4px; }
      .stack-lg > * + * { margin-top: 20px; }

      .app-bg-grid {
        position: fixed; inset: 0; pointer-events: none; z-index: 0;
        background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
        background-size: 42px 42px;
        mask-image: radial-gradient(ellipse 70% 60% at 30% 0%, black, transparent 70%);
      }

      .glass {
        background: var(--card-bg);
        backdrop-filter: blur(30px);
        -webkit-backdrop-filter: blur(30px);
        border: 1px solid var(--border-glass);
        border-radius: 20px;
      }
      .card-pad { padding: 22px; }

      @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
      .animate-fade-up { animation: fadeUp 0.55s cubic-bezier(.22,1,.36,1) both; }

      @keyframes floatY { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
      .animate-float { animation: floatY 6s ease-in-out infinite; }

      @keyframes spin { to { transform: rotate(360deg); } }
      .spin { animation: spin 1s linear infinite; }

      @keyframes shimmerMove { 0% { background-position: -300% 0; } 100% { background-position: 300% 0; } }
      .shimmer { background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.09) 37%, rgba(255,255,255,0.03) 63%); background-size: 400% 100%; animation: shimmerMove 1.6s ease infinite; }

      @keyframes marqueeMove { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      @keyframes particleDrift { 0%, 100% { transform: translate(0,0); opacity: 0.5; } 50% { transform: translate(8px,-22px); opacity: 1; } }

      .text-gradient {
        background: linear-gradient(90deg, var(--primary), var(--secondary), var(--accent));
        -webkit-background-clip: text; background-clip: text; color: transparent;
      }

      /* ---------- buttons ---------- */
      .btn-primary, .btn-secondary, .btn-ghost {
        display: inline-flex; align-items: center; gap: 8px;
        font-family: 'Inter', sans-serif; font-weight: 600; font-size: 13px;
        padding: 10px 16px; border-radius: 12px; border: none; cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
      }
      .btn-primary { background: linear-gradient(135deg, var(--primary), var(--secondary)); color: #04101c; box-shadow: 0 0 24px rgba(0,229,255,0.25); }
      .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 0 34px rgba(0,229,255,0.4); }
      .btn-secondary { background: rgba(255,255,255,0.06); color: #EAF2FA; border: 1px solid var(--border-glass); }
      .btn-secondary:hover:not(:disabled) { background: rgba(255,255,255,0.1); transform: translateY(-1px); }
      .btn-ghost { background: transparent; color: #EAF2FA; border: 1px solid rgba(255,255,255,0.14); }
      .btn-ghost:hover { border-color: var(--primary); color: var(--primary); }
      .btn-lg { padding: 13px 22px; font-size: 14px; border-radius: 14px; }
      button:disabled { opacity: 0.45; cursor: not-allowed; }
      .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--border-glass); background: rgba(255,255,255,0.04); color: #EAF2FA; cursor: pointer; transition: all 0.2s ease; position: relative; }
      .icon-btn:hover { background: rgba(255,255,255,0.1); }
      .icon-btn-dot::after { content: ''; position: absolute; top: 7px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: #FF5C7A; }

      /* ---------- sidebar ---------- */
      .sidebar { position: fixed; top: 16px; left: 16px; bottom: 16px; width: 236px; z-index: 40; display: flex; flex-direction: column; padding: 18px 12px; transition: width 0.3s ease, transform 0.3s ease; }
      .sidebar-collapsed { width: 76px; }
      .sidebar-brand { display: flex; align-items: center; gap: 10px; padding: 6px 10px 22px 10px; }
      .brand-mark { width: 30px; height: 30px; border-radius: 9px; background: linear-gradient(135deg, var(--primary), var(--secondary)); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 0 18px rgba(0,229,255,0.35); }
      .brand-word { font-size: 15px; font-weight: 700; letter-spacing: 0.06em; white-space: nowrap; }
      .sidebar-nav { display: flex; flex-direction: column; gap: 3px; flex: 1; overflow-y: auto; }
      .nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; border: none; background: transparent; color: rgba(234,242,250,0.55); cursor: pointer; font-size: 13.5px; font-weight: 500; text-align: left; position: relative; transition: all 0.2s ease; white-space: nowrap; }
      .nav-item:hover { background: rgba(255,255,255,0.05); color: #EAF2FA; }
      .nav-item-active { background: rgba(0,229,255,0.1); color: var(--primary); }
      .nav-active-dot { position: absolute; right: 10px; width: 5px; height: 5px; border-radius: 50%; background: var(--primary); box-shadow: 0 0 8px var(--primary); }
      .sidebar-collapse-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px; border-radius: 10px; border: 1px solid var(--border-glass); background: transparent; color: rgba(234,242,250,0.5); cursor: pointer; font-size: 12px; }
      .sidebar-collapse-btn:hover { color: #EAF2FA; }
      .sidebar-scrim { display: none; }

      /* ---------- topbar ---------- */
      .main-area { margin-left: 268px; padding: 16px 20px 40px; transition: margin-left 0.3s ease; position: relative; z-index: 1; }
      .main-area-collapsed { margin-left: 108px; }
      .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 20px; margin-bottom: 20px; flex-wrap: wrap; }
      .topbar-left { display: flex; align-items: center; gap: 12px; }
      .topbar-title { font-size: 20px; font-weight: 700; }
      .topbar-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .filter-chip { display: flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-glass); color: rgba(234,242,250,0.7); }
      .filter-chip select { background: transparent; border: none; color: #EAF2FA; font-size: 12.5px; font-family: 'Inter', sans-serif; cursor: pointer; outline: none; }
      .filter-chip select option { background: #0b1224; color: #EAF2FA; }
      .filter-currency-icon { width: 13px; text-align: center; color: var(--primary); }
      .topbar-right { display: flex; align-items: center; gap: 10px; }
      .role-pill { padding: 6px 12px; border-radius: 999px; background: rgba(0,229,255,0.1); color: var(--primary); font-size: 11px; letter-spacing: 0.05em; border: 1px solid rgba(0,229,255,0.25); }
      .mobile-only { display: none; }

      /* ---------- kpi ---------- */
      .kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; margin-bottom: 20px; }
      .kpi-grid-3 { grid-template-columns: repeat(3, 1fr); }
      .kpi-card { cursor: default; transition: transform 0.15s ease; }
      .kpi-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
      .icon-ring { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--ring-color) 14%, transparent); border: 1px solid color-mix(in srgb, var(--ring-color) 30%, transparent); }
      .kpi-label { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
      .kpi-value { font-size: 24px; font-weight: 600; margin-bottom: 10px; }
      .delta-badge { display: inline-flex; align-items: center; gap: 2px; font-size: 11px; font-weight: 600; padding: 3px 7px; border-radius: 999px; }
      .delta-up { color: #00FFA3; background: rgba(0,255,163,0.1); }
      .delta-down { color: #FF5C7A; background: rgba(255,92,122,0.1); }

      /* ---------- layout grids ---------- */
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
      .grid-2-1 { display: grid; grid-template-columns: 1.6fr 1fr; gap: 16px; margin-bottom: 20px; }
      .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
      .section-title { font-size: 16px; font-weight: 600; }
      .section-title-sm { font-size: 15px; font-weight: 600; margin: 2px 0 4px; }

      /* ---------- tooltip ---------- */
      .tooltip-box { padding: 10px 12px; border-radius: 12px; }
      .tooltip-label { font-size: 11px; color: rgba(234,242,250,0.5); margin-bottom: 6px; }
      .tooltip-row { display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 2px 0; }
      .tooltip-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .tooltip-value { margin-left: auto; font-weight: 600; }

      /* ---------- tables ---------- */
      .table-scroll { max-height: 300px; overflow: auto; border-radius: 12px; border: 1px solid var(--border-glass); }
      .table-scroll-tall { max-height: 340px; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      .data-table th { position: sticky; top: 0; background: rgba(11,18,36,0.95); text-align: left; padding: 9px 12px; color: rgba(234,242,250,0.5); font-weight: 500; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.05em; }
      .data-table td { padding: 8px 12px; border-top: 1px solid rgba(255,255,255,0.05); color: rgba(234,242,250,0.85); }
      .data-table tr:hover td { background: rgba(255,255,255,0.02); }

      /* ---------- AI report ---------- */
      .ai-report-card { min-height: 200px; }
      .ai-report-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
      .ai-error { display: flex; align-items: center; gap: 8px; color: #FFB020; background: rgba(255,176,32,0.08); border: 1px solid rgba(255,176,32,0.2); padding: 10px 12px; border-radius: 10px; font-size: 12.5px; margin-bottom: 14px; }
      .ai-empty { padding: 30px 10px; text-align: center; font-size: 13px; }
      .report-skeleton { display: flex; gap: 20px; align-items: center; padding: 20px 0; }
      .skel { border-radius: 8px; }
      .skel-circle { width: 90px; height: 90px; border-radius: 50%; flex-shrink: 0; }
      .skel-lines { flex: 1; display: flex; flex-direction: column; gap: 10px; }
      .skel-line { height: 12px; }
      .report-top { display: flex; align-items: center; gap: 24px; margin-bottom: 22px; flex-wrap: wrap; }
      .report-summary { flex: 1; min-width: 240px; font-size: 14px; line-height: 1.6; color: rgba(234,242,250,0.85); }
      .report-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px; }
      .report-list-block { background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: 14px; padding: 14px 16px; }
      .report-list-title { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; margin-bottom: 10px; color: rgba(234,242,250,0.85); }
      .report-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
      .report-list li { font-size: 12.5px; line-height: 1.55; color: rgba(234,242,250,0.7); padding-left: 14px; position: relative; }
      .report-list li::before { content: ''; position: absolute; left: 0; top: 7px; width: 4px; height: 4px; border-radius: 50%; background: rgba(234,242,250,0.35); }
      .segment-legend li { display: flex; align-items: center; gap: 10px; padding-left: 0; }
      .segment-legend li::before { display: none; }
      .swot-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .swot-cell { background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-top: 2px solid; border-radius: 12px; padding: 12px 14px; }
      .swot-label { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 8px; }

      /* ---------- chat widget ---------- */
      .chat-fab { position: fixed; bottom: 26px; right: 26px; width: 54px; height: 54px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--secondary)); border: none; display: flex; align-items: center; justify-content: center; color: #04101c; cursor: pointer; box-shadow: 0 4px 30px rgba(0,229,255,0.4); z-index: 60; transition: transform 0.2s ease; }
      .chat-fab:hover { transform: scale(1.07); }
      .chat-fab-open { background: rgba(255,255,255,0.1); color: #EAF2FA; }
      .chat-panel { position: fixed; bottom: 92px; right: 26px; width: 360px; max-width: calc(100vw - 40px); height: 480px; max-height: calc(100vh - 140px); z-index: 60; display: flex; flex-direction: column; overflow: hidden; }
      .chat-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border-glass); }
      .chat-header-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; }
      .chat-body { flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
      .chat-msg { font-size: 12.5px; line-height: 1.55; padding: 9px 12px; border-radius: 12px; max-width: 88%; }
      .chat-msg-ai { background: rgba(255,255,255,0.06); color: rgba(234,242,250,0.9); align-self: flex-start; border-bottom-left-radius: 4px; }
      .chat-msg-user { background: linear-gradient(135deg, var(--primary), var(--secondary)); color: #04101c; align-self: flex-end; border-bottom-right-radius: 4px; font-weight: 500; }
      .chat-typing { display: flex; align-items: center; gap: 6px; }
      .chat-quick { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 16px 10px; }
      .chip { font-size: 11px; padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-glass); color: rgba(234,242,250,0.65); cursor: pointer; transition: all 0.2s ease; }
      .chip:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
      .chat-input-row { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border-glass); }
      .chat-input { flex: 1; background: rgba(255,255,255,0.05); border: 1px solid var(--border-glass); border-radius: 10px; padding: 9px 12px; color: #EAF2FA; font-size: 12.5px; outline: none; }
      .chat-input:focus { border-color: var(--primary); }
      .chat-send { padding: 9px 12px; border-radius: 10px; }

      /* ---------- upload / reports ---------- */
      .upload-drop { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 34px 20px; border: 1.5px dashed var(--border-glass); border-radius: 16px; cursor: pointer; transition: all 0.2s ease; text-align: center; }
      .upload-drop:hover { border-color: var(--primary); background: rgba(0,229,255,0.03); }
      .upload-drop-text { font-size: 13px; color: rgba(234,242,250,0.6); }
      .upload-results { margin-top: 18px; }
      .upload-meta-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 10px; }
      .toggle-row { display: flex; align-items: center; gap: 8px; cursor: pointer; }
      .toggle-row-full { justify-content: space-between; padding: 10px 0; font-size: 13px; }
      .toggle-list { display: flex; flex-direction: column; }
      .toggle-list label + label { border-top: 1px solid var(--border-glass); }
      .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 14px; }
      .stat-chip { background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: 12px; padding: 10px 12px; }
      .stat-chip-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: rgba(234,242,250,0.45); margin-bottom: 4px; }
      .stat-chip-value { font-size: 15px; font-weight: 600; }
      .stat-chip-sub { font-size: 10.5px; margin-top: 2px; }
      .export-row { display: flex; gap: 10px; flex-wrap: wrap; }

      /* ---------- settings ---------- */
      .profile-row { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
      .avatar-circle { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--secondary)); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #04101c; flex-shrink: 0; }
      .avatar-circle-sm { width: 34px; height: 34px; font-size: 11px; }
      .profile-name { font-size: 14px; font-weight: 600; }
      .field-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-top: 1px solid var(--border-glass); margin-bottom: 4px; }
      .select-input { background: rgba(255,255,255,0.05); border: 1px solid var(--border-glass); color: #EAF2FA; padding: 7px 10px; border-radius: 8px; font-size: 12.5px; }
      .theme-swatches { display: flex; gap: 10px; flex-wrap: wrap; }
      .theme-swatch { display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 12px; border: 1px solid var(--border-glass); background: rgba(255,255,255,0.03); color: rgba(234,242,250,0.7); font-size: 12.5px; cursor: pointer; }
      .theme-swatch-dot { width: 12px; height: 12px; border-radius: 50%; }
      .theme-swatch-active { border-color: var(--swatch-color); color: #fff; box-shadow: 0 0 16px color-mix(in srgb, var(--swatch-color) 35%, transparent); }

      /* ---------- forecasting segmented control ---------- */
      .segmented { display: flex; border: 1px solid var(--border-glass); border-radius: 10px; overflow: hidden; }
      .segmented button { background: transparent; border: none; color: rgba(234,242,250,0.6); font-size: 12px; padding: 7px 14px; cursor: pointer; }
      .seg-active { background: rgba(0,229,255,0.12) !important; color: var(--primary) !important; }

      /* ---------- landing page ---------- */
      .landing { position: relative; min-height: 100vh; overflow: hidden; }
      .landing-glow { position: absolute; top: -20%; left: -10%; width: 60%; height: 60%; background: radial-gradient(circle, rgba(0,229,255,0.22), transparent 60%); pointer-events: none; filter: blur(10px); }
      .landing-particles { position: absolute; inset: 0; pointer-events: none; }
      .particle { position: absolute; border-radius: 50%; background: var(--primary); opacity: 0.6; animation: particleDrift 6s ease-in-out infinite; box-shadow: 0 0 8px var(--primary); }
      .landing-nav { position: relative; z-index: 2; display: flex; align-items: center; justify-content: space-between; padding: 22px 36px; }
      .hero { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 70px 24px 40px; }
      .hero-badge { display: inline-flex; align-items: center; gap: 7px; padding: 7px 14px; border-radius: 999px; background: rgba(0,229,255,0.08); border: 1px solid rgba(0,229,255,0.25); font-size: 12px; color: rgba(234,242,250,0.8); margin-bottom: 22px; }
      .hero-title { font-size: 58px; font-weight: 700; line-height: 1.08; letter-spacing: -0.02em; margin-bottom: 22px; }
      .hero-subtitle { font-size: 17px; margin-bottom: 30px; max-width: 560px; }
      .hero-word { font-weight: 600; display: inline-block; animation: fadeUp 0.5s ease both; }
      .hero-ctas { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; margin-bottom: 56px; }
      .hero-floaters { display: flex; gap: 18px; flex-wrap: wrap; justify-content: center; }
      .floater-card { padding: 16px 20px; border-radius: 16px; min-width: 150px; text-align: left; }
      .floater-label { font-size: 10px; letter-spacing: 0.06em; margin-bottom: 6px; }
      .floater-value { font-size: 20px; font-weight: 600; }
      .floater-spark { width: 90px; height: 24px; margin-top: 6px; }
      .floater-spark svg { width: 100%; height: 100%; }

      .marquee-wrap { position: relative; z-index: 2; padding: 46px 0 60px; }
      .marquee-label { text-align: center; letter-spacing: 0.12em; margin-bottom: 18px; }
      .marquee-track { overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, black 12%, black 88%, transparent); mask-image: linear-gradient(90deg, transparent, black 12%, black 88%, transparent); }
      .marquee-inner { display: flex; gap: 56px; width: max-content; animation: marqueeMove 26s linear infinite; }
      .marquee-item { font-size: 13px; letter-spacing: 0.08em; color: rgba(234,242,250,0.35); white-space: nowrap; }

      /* ---------- responsive ---------- */
      @media (max-width: 1100px) {
        .kpi-grid { grid-template-columns: repeat(3, 1fr); }
        .grid-2, .grid-2-1 { grid-template-columns: 1fr; }
        .report-grid, .swot-grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 860px) {
        .sidebar { transform: translateX(-120%); left: 0; top: 0; bottom: 0; border-radius: 0; }
        .sidebar-mobile-open { transform: translateX(0); }
        .sidebar-collapse-btn { display: none; }
        .sidebar-scrim { display: block; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 39; }
        .main-area, .main-area-collapsed { margin-left: 0; padding: 14px 14px 100px; }
        .mobile-only { display: inline-flex; }
        .kpi-grid, .kpi-grid-3 { grid-template-columns: repeat(2, 1fr); }
        .hero-title { font-size: 38px; }
        .topbar { padding: 12px 14px; }
        .chat-panel { right: 12px; left: 12px; width: auto; bottom: 84px; }
        .chat-fab { right: 16px; bottom: 16px; }
      }
      @media (max-width: 520px) {
        .kpi-grid, .kpi-grid-3 { grid-template-columns: 1fr; }
        .hero-title { font-size: 30px; }
        .topbar-filters { width: 100%; }
      }

      @media (prefers-reduced-motion: reduce) {
        .app-root * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
      }
    `}</style>
  );
}