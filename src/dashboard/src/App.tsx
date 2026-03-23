import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Activity, TrendingUp, DollarSign, Zap,
  Bot, BarChart2, Settings, RefreshCw, ChevronRight,
  ArrowUpRight, ArrowDownRight, Minus, Clock, Cpu,
} from "lucide-react";
import { api, type Snapshot, type Invocation, type ModelStat, type Stats } from "./api";
import { LiveDot } from "./components/LiveDot";
import { Sparkline } from "./components/Sparkline";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = {
  usd: (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  pct: (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`,
  cost: (n: number) => `$${n.toFixed(5)}`,
  time: (s: string) => new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  datetime: (s: string) => new Date(s).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
  ago: (s: string) => {
    const diff = Date.now() - new Date(s).getTime();
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  },
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 8,
      padding: "10px 14px", fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    }}>
      <div style={{ color: "var(--muted)", marginBottom: 6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
          <span style={{ color: "var(--muted)" }}>{p.name}:</span>
          <span style={{ color: "#fff", fontWeight: 600 }}>{typeof p.value === "number" ? fmt.usd(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KPIProps {
  label: string; value: string; sub?: string;
  color?: string; icon: React.ReactNode; trend?: number; sparkData?: number[];
}

function KPICard({ label, value, sub, color = "var(--blue)", icon, trend, sparkData }: KPIProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: 14, padding: "1.1rem 1.25rem", flex: 1, minWidth: 160,
        position: "relative", overflow: "hidden",
      }}
      whileHover={{ borderColor: color, boxShadow: `0 0 24px ${color}22` }}
      transition={{ duration: 0.2 }}
    >
      {/* Subtle glow top-right */}
      <div style={{
        position: "absolute", top: -20, right: -20, width: 80, height: 80,
        borderRadius: "50%", background: color, opacity: 0.06, filter: "blur(20px)",
      }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>{sub}</div>}
        </div>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: color + "18",
          display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
      {sparkData && sparkData.length > 1 && (
        <div style={{ marginTop: 10, opacity: 0.6 }}>
          <Sparkline data={sparkData} color={color} height={32} />
        </div>
      )}
      {trend !== undefined && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 11 }}>
          {trend > 0 ? <ArrowUpRight size={12} color="var(--green)" /> : trend < 0 ? <ArrowDownRight size={12} color="var(--red)" /> : <Minus size={12} color="var(--muted)" />}
          <span style={{ color: trend > 0 ? "var(--green)" : trend < 0 ? "var(--red)" : "var(--muted)" }}>
            {fmt.pct(trend)}
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ─── Sidebar Nav ──────────────────────────────────────────────────────────────

type Tab = "overview" | "trades" | "models" | "settings";

const NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <BarChart2 size={16} /> },
  { id: "trades",   label: "Trades",   icon: <Activity size={16} /> },
  { id: "models",   label: "Models",   icon: <Bot size={16} /> },
  { id: "settings", label: "Settings", icon: <Settings size={16} /> },
];

function Sidebar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div style={{
      width: 200, flexShrink: 0, background: "var(--bg1)",
      borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column",
      padding: "1.5rem 0.75rem", gap: 4,
    }}>
      {/* Logo */}
      <div style={{ padding: "0 0.5rem 1.5rem", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, var(--blue), var(--purple))",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Zap size={16} color="#fff" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>DEX Trader</div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>AI Agent</div>
        </div>
      </div>

      {NAV.map((item) => (
        <motion.button
          key={item.id}
          onClick={() => onChange(item.id)}
          whileHover={{ x: 2 }}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
            borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
            background: active === item.id ? "var(--blue)18" : "transparent",
            color: active === item.id ? "var(--blue2)" : "var(--muted)",
            borderLeft: active === item.id ? "2px solid var(--blue)" : "2px solid transparent",
            transition: "all 0.15s",
          }}
        >
          {item.icon}
          {item.label}
          {active === item.id && <ChevronRight size={12} style={{ marginLeft: "auto" }} />}
        </motion.button>
      ))}

      {/* Bottom status */}
      <div style={{ marginTop: "auto", padding: "0.75rem 0.5rem", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)" }}>
          <LiveDot />
          <span>Live · Lighter DEX</span>
        </div>
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ snapshots, stats, invocations }: {
  snapshots: Snapshot[]; stats: Stats | null; invocations: Invocation[];
}) {
  const first = snapshots[0];
  const latest = snapshots[snapshots.length - 1];
  const pnl = latest && first ? latest.totalValue - first.totalValue : 0;
  const pnlPct = first?.totalValue ? (pnl / first.totalValue) * 100 : 0;
  const sparkValues = snapshots.slice(-20).map((s) => s.totalValue);

  const chartData = snapshots.map((s) => ({
    time: fmt.time(s.timestamp),
    "Portfolio": +s.totalValue.toFixed(2),
    "Cash": +s.availableCash.toFixed(2),
  }));

  const recentTrades = invocations.filter((i) => i.toolCalls?.length > 0).slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* KPI row */}
      <div style={{ display: "flex", gap: "0.875rem", flexWrap: "wrap" }}>
        <KPICard label="Portfolio Value" value={latest ? fmt.usd(latest.totalValue) : "—"}
          icon={<DollarSign size={16} />} color="var(--green)" sparkData={sparkValues}
          trend={pnlPct} sub={`${pnl >= 0 ? "+" : ""}${fmt.usd(pnl)} all time`} />
        <KPICard label="Available Cash" value={latest ? fmt.usd(latest.availableCash) : "—"}
          icon={<TrendingUp size={16} />} color="var(--blue)" />
        <KPICard label="Total Invocations" value={String(stats?.totalInvocations ?? 0)}
          sub={`${stats?.totalToolCalls ?? 0} tool calls`} icon={<Cpu size={16} />} color="var(--purple)" />
        <KPICard label="LLM Spend" value={fmt.cost(stats?.totalCost ?? 0)}
          icon={<Zap size={16} />} color="var(--yellow)" />
      </div>

      {/* Main chart */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Portfolio Performance</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Total value vs available cash over time</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11,
            background: pnl >= 0 ? "var(--green)18" : "var(--red)18",
            color: pnl >= 0 ? "var(--green)" : "var(--red)",
            padding: "4px 10px", borderRadius: 20, border: `1px solid ${pnl >= 0 ? "var(--green)" : "var(--red)"}33`,
          }}>
            {pnl >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {fmt.pct(pnlPct)}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="gPortfolio" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--green)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gCash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--blue)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="var(--blue)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="time" stroke="var(--muted2)" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis stroke="var(--muted2)" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="Portfolio" stroke="var(--green)" strokeWidth={2} fill="url(#gPortfolio)" dot={false} />
            <Area type="monotone" dataKey="Cash" stroke="var(--blue)" strokeWidth={1.5} fill="url(#gCash)" dot={false} strokeDasharray="4 2" />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Bottom row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
        {/* Tool usage */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.25rem" }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: "1rem" }}>Tool Usage</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stats?.toolBreakdown.map((t) => ({ name: t.toolName.replace("AllPositions", "All").replace("Position", "Pos"), count: t._count.toolName })) ?? []} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {(stats?.toolBreakdown ?? []).map((_, i) => (
                  <Cell key={i} fill={["var(--green)", "var(--red)", "var(--blue)", "var(--purple)"][i % 4]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Recent trades */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
          style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.25rem" }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: "1rem" }}>Recent Actions</div>
          {recentTrades.length === 0
            ? <div style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", paddingTop: 40 }}>No trades yet</div>
            : recentTrades.map((inv) => (
              <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{inv.model?.name}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{fmt.ago(inv.timestamp)}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {inv.toolCalls.map((tc, i) => (
                    <span key={i} style={{
                      fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 600,
                      background: tc.toolName === "createPosition" ? "var(--green)22" : "var(--red)22",
                      color: tc.toolName === "createPosition" ? "var(--green)" : "var(--red)",
                      border: `1px solid ${tc.toolName === "createPosition" ? "var(--green)" : "var(--red)"}44`,
                    }}>
                      {tc.toolName === "createPosition" ? "OPEN" : tc.toolName === "closeAllPositions" ? "CLOSE" : tc.toolName}
                    </span>
                  ))}
                </div>
              </div>
            ))
          }
        </motion.div>
      </div>
    </div>
  );
}

// ─── Trades Tab ───────────────────────────────────────────────────────────────

function TradesTab({ invocations }: { invocations: Invocation[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Invocation History</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{invocations.length} total invocations</div>
        </div>
      </div>

      {invocations.length === 0 && (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--muted)", background: "var(--bg2)", borderRadius: 14, border: "1px solid var(--border)" }}>
          No invocations yet. Start the agent loop to see activity.
        </div>
      )}

      {invocations.map((inv, idx) => (
        <motion.div key={inv.id}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}
          style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}
          whileHover={{ borderColor: "var(--border2)" }}
        >
          {/* Header row */}
          <div
            onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: inv.toolCalls?.length > 0 ? "var(--green)18" : "var(--bg3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: inv.toolCalls?.length > 0 ? "var(--green)" : "var(--muted)",
            }}>
              {inv.toolCalls?.length > 0 ? <Zap size={14} /> : <Bot size={14} />}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{inv.model?.name ?? "Unknown"}</span>
                <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "monospace" }}>{inv.model?.apiModelName}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {inv.response.slice(0, 100)}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              {inv.toolCalls?.map((tc, i) => (
                <span key={i} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                  background: tc.toolName === "createPosition" ? "var(--green)22" : tc.toolName === "closeAllPositions" ? "var(--red)22" : "var(--blue)22",
                  color: tc.toolName === "createPosition" ? "var(--green)" : tc.toolName === "closeAllPositions" ? "var(--red)" : "var(--blue)",
                  border: `1px solid ${tc.toolName === "createPosition" ? "var(--green)" : tc.toolName === "closeAllPositions" ? "var(--red)" : "var(--blue)"}44`,
                }}>
                  {tc.toolName === "createPosition" ? "OPEN" : tc.toolName === "closeAllPositions" ? "CLOSE" : tc.toolName.toUpperCase()}
                </span>
              ))}
              <span style={{ fontSize: 11, color: "var(--yellow)", fontFamily: "monospace" }}>{fmt.cost(inv.totalCost)}</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{fmt.ago(inv.timestamp)}</span>
              <motion.div animate={{ rotate: expanded === inv.id ? 90 : 0 }} transition={{ duration: 0.15 }}>
                <ChevronRight size={14} color="var(--muted)" />
              </motion.div>
            </div>
          </div>

          {/* Expanded detail */}
          <AnimatePresence>
            {expanded === inv.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                style={{ overflow: "hidden", borderTop: "1px solid var(--border)" }}
              >
                <div style={{ padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>LLM Response</div>
                    <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7, background: "var(--bg3)", padding: "0.875rem", borderRadius: 8, whiteSpace: "pre-wrap" }}>
                      {inv.response}
                    </div>
                  </div>
                  {inv.toolCalls?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Tool Calls</div>
                      {inv.toolCalls.map((tc, i) => (
                        <div key={i} style={{ background: "var(--bg3)", borderRadius: 8, padding: "0.75rem", marginBottom: 6, fontFamily: "monospace", fontSize: 11 }}>
                          <span style={{ color: "var(--blue)" }}>🔧 {tc.toolName}</span>
                          <span style={{ color: "var(--muted)" }}>({JSON.stringify(tc.parameters)})</span>
                          <div style={{ color: "var(--green)", marginTop: 4 }}>→ {JSON.stringify(tc.result)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", gap: 16 }}>
                    <span><Clock size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />{fmt.datetime(inv.timestamp)}</span>
                    <span>Cost: {fmt.cost(inv.totalCost)}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Models Tab ───────────────────────────────────────────────────────────────

function ModelsTab({ models }: { models: ModelStat[]; invocations: Invocation[] }) {
  const costByModel = models.map((m) => ({
    name: m.name.split(" ").slice(0, 2).join(" "),
    cost: +m.totalCost.toFixed(4),
    invocations: m._count.invocations,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Model cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
        {models.map((m, i) => (
          <motion.div key={m.id}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            style={{
              background: "var(--bg2)", border: `1px solid ${m.isActive ? "var(--green)44" : "var(--border)"}`,
              borderRadius: 14, padding: "1.25rem", position: "relative", overflow: "hidden",
            }}
          >
            {m.isActive && (
              <div style={{ position: "absolute", top: 14, right: 14 }}>
                <LiveDot color="var(--green)" />
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem" }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `linear-gradient(135deg, ${["var(--blue)", "var(--purple)", "var(--orange)", "var(--green)"][i % 4]}, ${["var(--purple)", "var(--blue)", "var(--yellow)", "var(--blue)"][i % 4]})`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Bot size={18} color="#fff" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "monospace" }}>{m.apiModelName}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              {[
                { label: "Invocations", value: String(m._count.invocations) },
                { label: "Total Cost", value: fmt.cost(m.totalCost) },
                { label: "Status", value: m.isActive ? "Active" : "Inactive" },
                { label: "Avg Cost", value: m._count.invocations > 0 ? fmt.cost(m.totalCost / m._count.invocations) : "—" },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: "var(--bg3)", borderRadius: 8, padding: "0.6rem 0.75rem" }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Cost comparison chart */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14, padding: "1.25rem" }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: "1rem" }}>Cost Comparison</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={costByModel} barSize={40}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="cost" name="Total Cost" radius={[6, 6, 0, 0]}>
              {costByModel.map((_, i) => (
                <Cell key={i} fill={["var(--blue)", "var(--purple)", "var(--orange)", "var(--green)"][i % 4]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const vars = [
    { key: "DATABASE_URL", desc: "PostgreSQL connection string (NeonDB)" },
    { key: "OPENROUTER_API_KEY", desc: "OpenRouter API key for LLM access" },
    { key: "LIGHTER_WALLET_ADDRESS", desc: "Your Ethereum wallet address" },
    { key: "LIGHTER_PRIVATE_KEY", desc: "Private key for signing orders" },
    { key: "TRADING_BUDGET_USD", desc: "Max capital to risk (default: 50)" },
    { key: "MAX_LEVERAGE", desc: "Max leverage multiplier (default: 5)" },
    { key: "CANDLE_RESOLUTION", desc: "Candle timeframe: 1m, 5m, 15m, 1h" },
    { key: "API_PORT", desc: "Dashboard API port (default: 3001)" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 640 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 15 }}>Configuration</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Set these in your <code style={{ fontFamily: "monospace", background: "var(--bg3)", padding: "1px 5px", borderRadius: 4 }}>.env</code> file</div>
      </div>
      {vars.map((v) => (
        <div key={v.key} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "0.875rem 1rem" }}>
          <div style={{ fontFamily: "monospace", fontSize: 13, color: "var(--blue2)", marginBottom: 4 }}>{v.key}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{v.desc}</div>
        </div>
      ))}
      <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Quick Start</div>
        {["bun install", "bun run db:push", "bun run seed", "bun run agent", "bun run api"].map((cmd) => (
          <div key={cmd} style={{ fontFamily: "monospace", fontSize: 12, color: "var(--green)", background: "var(--bg3)", padding: "6px 10px", borderRadius: 6, marginBottom: 4 }}>
            $ {cmd}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Auto Refresh Hook ────────────────────────────────────────────────────────

function useAutoRefresh(fn: () => void, ms = 30000) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [invocations, setInvocations] = useState<Invocation[]>([]);
  const [models, setModels] = useState<ModelStat[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const [s, inv, m, st] = await Promise.allSettled([
        api.snapshots(200),
        api.invocations(100),
        api.models(),
        api.stats(),
      ]);
      if (s.status === "fulfilled") setSnapshots(s.value);
      if (inv.status === "fulfilled") setInvocations(inv.value);
      if (m.status === "fulfilled") setModels(m.value);
      if (st.status === "fulfilled") setStats(st.value);
      setLastRefresh(new Date());
    } catch (_) {
      // silently fail — API may not be running yet
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useAutoRefresh(() => refresh(), 30000);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", position: "relative" }}>
      {/* Background */}
      <div className="grid-bg" />
      <div className="orb" style={{ width: 600, height: 600, top: -200, left: -100, background: "var(--blue)" }} />
      <div className="orb" style={{ width: 400, height: 400, bottom: -100, right: 100, background: "var(--purple)" }} />

      {/* Sidebar */}
      <Sidebar active={tab} onChange={setTab} />

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", zIndex: 1 }}>
        {/* Top bar */}
        <div style={{
          height: 56, flexShrink: 0, borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 1.5rem", background: "var(--bg1)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 15, textTransform: "capitalize" }}>{tab}</span>
            {loading && <span style={{ fontSize: 11, color: "var(--muted)" }}>Loading...</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              Updated {fmt.ago(lastRefresh.toISOString())}
            </span>
            <motion.button
              onClick={() => refresh(true)}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                borderRadius: 8, border: "1px solid var(--border2)", background: "var(--bg2)",
                color: "var(--text)", cursor: "pointer", fontSize: 12, fontWeight: 500,
              }}
            >
              <motion.span animate={{ rotate: refreshing ? 360 : 0 }} transition={{ duration: 0.6, repeat: refreshing ? Infinity : 0, ease: "linear" }}>
                <RefreshCw size={13} />
              </motion.span>
              Refresh
            </motion.button>
          </div>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: "auto", padding: "1.5rem" }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {tab === "overview" && (
                <OverviewTab snapshots={snapshots} stats={stats} invocations={invocations} />
              )}
              {tab === "trades" && (
                <TradesTab invocations={invocations} />
              )}
              {tab === "models" && (
                <ModelsTab models={models} invocations={invocations} />
              )}
              {tab === "settings" && (
                <SettingsTab />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
