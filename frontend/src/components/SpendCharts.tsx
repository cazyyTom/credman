"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  categoryColour,
  categoryLabel,
  moneyCompact,
  monthLabel,
} from "@/lib/format";
import type { Analytics } from "@/lib/types";
import { Card } from "./ui/Card";
import { Tag } from "./ui/Chip";

interface ChartProps {
  analytics: Analytics | null;
  loading: boolean;
  /** Categories currently filtered, so selected slices can be highlighted. */
  selectedCategories: string[];
  uncategorisedOnly: boolean;
  onToggleCategory: (category: string | null) => void;
  selectedMonth: string | null;
  onToggleMonth: (month: string) => void;
}

export function SpendCharts({
  analytics,
  loading,
  selectedCategories,
  uncategorisedOnly,
  onToggleCategory,
  selectedMonth,
  onToggleMonth,
}: ChartProps) {
  return (
    <div className="charts">
      <style>{css}</style>
      <CategoryChart
        analytics={analytics}
        loading={loading}
        selectedCategories={selectedCategories}
        uncategorisedOnly={uncategorisedOnly}
        onToggleCategory={onToggleCategory}
      />
      <MonthlyChart
        analytics={analytics}
        loading={loading}
        selectedMonth={selectedMonth}
        onToggleMonth={onToggleMonth}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CategoryChart({
  analytics,
  loading,
  selectedCategories,
  uncategorisedOnly,
  onToggleCategory,
}: Omit<ChartProps, "selectedMonth" | "onToggleMonth">) {
  const slices = analytics?.by_category ?? [];
  const hasSelection = selectedCategories.length > 0 || uncategorisedOnly;

  const isSelected = (category: string | null) =>
    category === null ? uncategorisedOnly : selectedCategories.includes(category);

  // Recharts needs a positive number per slice. Refunds are netted into the
  // category total and could push it negative, so the arc is drawn from the
  // magnitude while the label keeps the real signed figure.
  const data = slices.map((slice, index) => ({
    ...slice,
    magnitude: Math.abs(Number(slice.total_amount)),
    colour: categoryColour(slice.category, index),
  }));

  return (
    <Card
      title="Where it goes"
      hint={
        hasSelection
          ? "Tap a segment again to clear it"
          : "Tap a segment to filter the payments below"
      }
      action={
        analytics && analytics.excluded_outliers > 0 && !loading ? (
          <Tag tone="warn" title="Three payments above ₹1,00,000 look like data errors and are excluded by default">
            {analytics.excluded_outliers} excluded
          </Tag>
        ) : null
      }
    >
      {loading ? (
        <ChartSkeleton height={216} />
      ) : data.length === 0 ? (
        <Empty>No spending matches these filters.</Empty>
      ) : (
        <>
          <div style={{ height: 216, marginInline: "calc(var(--space-2) * -1)" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="magnitude"
                  nameKey="category"
                  innerRadius="58%"
                  outerRadius="88%"
                  paddingAngle={1.5}
                  stroke="var(--ink-850)"
                  strokeWidth={2}
                  isAnimationActive={false}
                  onClick={(entry: { category?: string | null }) =>
                    onToggleCategory(entry?.category ?? null)
                  }
                >
                  {data.map((slice) => (
                    <Cell
                      key={slice.category ?? "null"}
                      fill={slice.colour}
                      // Dim unselected slices so the selection is legible on the
                      // chart itself, not only in the filter bar.
                      opacity={!hasSelection || isSelected(slice.category) ? 1 : 0.28}
                      style={{ cursor: "pointer", outline: "none" }}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CategoryTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* The legend doubles as the keyboard-accessible control surface: chart
              segments are not focusable, so every slice also exists as a button. */}
          <ul className="charts__legend">
            {data.map((slice) => {
              const selected = isSelected(slice.category);
              return (
                <li key={slice.category ?? "null"}>
                  <button
                    type="button"
                    className="charts__legend-item"
                    data-active={selected || undefined}
                    aria-pressed={selected}
                    onClick={() => onToggleCategory(slice.category)}
                  >
                    <span
                      className="charts__swatch"
                      style={{ background: slice.colour }}
                      aria-hidden="true"
                    />
                    <span className="charts__legend-name">
                      {categoryLabel(slice.category)}
                    </span>
                    <span className="charts__legend-value mono">
                      {moneyCompact(slice.total_amount)}
                    </span>
                    <span className="charts__legend-share mono">
                      {(slice.share * 100).toFixed(0)}%
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function MonthlyChart({
  analytics,
  loading,
  selectedMonth,
  onToggleMonth,
}: Pick<ChartProps, "analytics" | "loading" | "selectedMonth" | "onToggleMonth">) {
  const data = (analytics?.monthly ?? []).map((point) => ({
    ...point,
    label: monthLabel(point.month),
    value: Number(point.total_amount),
  }));

  return (
    <Card
      title="Month by month"
      hint={selectedMonth ? "Tap the bar again to clear it" : "Tap a bar to jump to that month"}
    >
      {loading ? (
        <ChartSkeleton height={216} />
      ) : data.length === 0 ? (
        <Empty>No spending matches these filters.</Empty>
      ) : (
        <div style={{ height: 216, marginInline: "calc(var(--space-2) * -1)" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--paper-500)", fontSize: 10 }}
                axisLine={{ stroke: "var(--ink-700)" }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={8}
              />
              <YAxis
                tickFormatter={(v: number) => moneyCompact(v)}
                tick={{ fill: "var(--paper-500)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                content={<MonthTooltip />}
                cursor={{ fill: "rgba(255,255,255,0.035)" }}
              />
              <Bar
                dataKey="value"
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
                onClick={(entry: { month?: string }) =>
                  entry?.month && onToggleMonth(entry.month)
                }
              >
                {data.map((point) => (
                  <Cell
                    key={point.month}
                    fill={
                      selectedMonth === point.month
                        ? "var(--indigo-300)"
                        : "var(--indigo-500)"
                    }
                    opacity={!selectedMonth || selectedMonth === point.month ? 1 : 0.3}
                    style={{ cursor: "pointer" }}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

interface TooltipPayload<T> {
  active?: boolean;
  payload?: { payload: T }[];
}

function CategoryTooltip({
  active,
  payload,
}: TooltipPayload<{
  category: string | null;
  total_amount: string;
  transaction_count: number;
  share: number;
}>) {
  const slice = payload?.[0]?.payload;
  if (!active || !slice) return null;
  return (
    <div className="charts__tooltip">
      <strong>{categoryLabel(slice.category)}</strong>
      <span className="mono">{moneyCompact(slice.total_amount)}</span>
      <span className="charts__tooltip-meta">
        {slice.transaction_count.toLocaleString("en-IN")} payments ·{" "}
        {(slice.share * 100).toFixed(1)}%
      </span>
    </div>
  );
}

function MonthTooltip({
  active,
  payload,
}: TooltipPayload<{ month: string; value: number; transaction_count: number }>) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="charts__tooltip">
      <strong>{monthLabel(point.month)}</strong>
      <span className="mono">{moneyCompact(point.value)}</span>
      <span className="charts__tooltip-meta">
        {point.transaction_count.toLocaleString("en-IN")} payments
      </span>
    </div>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div className="charts__skeleton" style={{ height }} aria-hidden="true">
      <span />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="charts__empty">
      <p>{children}</p>
    </div>
  );
}

const css = `
.charts{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(320px,1fr));
  gap:var(--space-4);
}

.charts__legend{
  list-style:none;
  padding:0;
  margin:var(--space-4) 0 0;
  display:flex;
  flex-direction:column;
  gap:1px;
  border-top:var(--rule);
  padding-top:var(--space-2);
}
.charts__legend-item{
  width:100%;
  display:grid;
  grid-template-columns:8px 1fr auto 36px;
  align-items:center;
  gap:var(--space-2);
  padding:var(--space-1) var(--space-2);
  background:none;
  border:1px solid transparent;
  border-radius:var(--radius-sm);
  color:var(--paper-400);
  font-size:var(--text-xs);
  text-align:left;
  cursor:pointer;
  transition:background var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease);
}
.charts__legend-item:hover{background:var(--ink-800);color:var(--paper-50)}
.charts__legend-item[data-active]{
  background:rgba(107,118,232,0.12);
  border-color:var(--indigo-400);
  color:var(--paper-50);
}
.charts__swatch{
  width:8px;
  height:8px;
  border-radius:2px;
  flex-shrink:0;
}
.charts__legend-name{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.charts__legend-value{color:var(--paper-200);font-weight:500}
.charts__legend-share{color:var(--paper-500);text-align:right;font-size:var(--text-2xs)}

.charts__tooltip{
  display:flex;
  flex-direction:column;
  gap:2px;
  padding:var(--space-2) var(--space-3);
  background:var(--ink-750);
  border:var(--rule-strong);
  border-radius:var(--radius-md);
  box-shadow:var(--shadow-pop);
  font-size:var(--text-xs);
  color:var(--paper-50);
}
.charts__tooltip strong{font-family:var(--font-display);font-size:var(--text-sm)}
.charts__tooltip-meta{color:var(--paper-500);font-size:var(--text-2xs)}

.charts__skeleton{
  display:grid;
  place-items:center;
}
.charts__skeleton span{
  width:150px;
  height:150px;
  border-radius:50%;
  border:26px solid var(--ink-750);
  animation:charts-pulse 1.6s ease-in-out infinite;
}
@keyframes charts-pulse{
  0%,100%{opacity:1}
  50%{opacity:0.45}
}
@media (prefers-reduced-motion:reduce){
  .charts__skeleton span{animation:none}
}

.charts__empty{
  display:grid;
  place-items:center;
  min-height:216px;
  text-align:center;
}
.charts__empty p{
  font-size:var(--text-sm);
  color:var(--paper-500);
  max-width:28ch;
}
`;
