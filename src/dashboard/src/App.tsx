import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area, BarChart, Bar, Cell,
} from "recharts";
import { api, type Snapshot, type Invocation, type ModelStat, type Stats } from "./api";

const DARK = "#0a0a0a";
const CARD = "#111111";
const BORDER = "#222222";
const GREEN = "#22c55e";
const RED = "#ef4444";
const BLUE = "#3b82f6";
const YELLOW = "#eab308";
const MUTED = "#666666";

function useAutoRefresh(fn: () => void, ms = 30_000) {
  useEffect(() => {
    fn();
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }, []);
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "1rem", ...style }}>
      {children}
    </div>
  );
}

function KPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? "#fff" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600 }}>
      {text}
    </span>
  );
}

export default function App() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [invocations, setInvocations] = useState<Invocation[]>([]);
  const [models, setModels] = useState<ModelStat[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "trades" | "models">("overview");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [s, inv, m, st] = await Promise.all([
        api.snapshots(300),
        api.invocations(100),
        api.models(),
        api.stats(),
      ]);
      setSnapshots(s);
      setInvocations(inv);
      setModels(m);
      setStats(st);
    } catch (e) {
      console.error("Refresh failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useAutoRefresh(refresh, 30_000);

  const latest = snapshots[snapshots.length - 1];
  const first = snapshots[0];
  const pnl = latest && first ? latest.totalValue - first.totalValue : 0;
  const pnlPct = first?.totalValue ? (pnl / first.totalValue) * 100 : 0;

  const chartData = snapshots.map((s) => ({
    time: new Date(s.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    value: +s.totalValue.toFixed(2),
    cash: +s.availableCash.toFixed(2),
  }));

  const toolData = stats?.toolBreakdown.map((t) => ({
    name: t.toolName,
    count: t._count.toolName,
  })) ?? [];

  const tabs = ["overview", "trades", "models"] as const;

  if (loading) {
    return (
      <div style={{ background: DARK, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ background: DARK, minHeight: "100vh", color: "#e5e5e5", fontFamily: "'Inter', system-ui, sans-serif", padding: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>⚡ DEX AI Trader</h1>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Lighter DEX · Auto-refreshes every 30s</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                background: activeTab === t ? BLUE : CARD,
                color: activeTab === t ? "#fff" : MUTED,
                border: `1px solid ${activeTab === t ? BLUE : BORDER}`,
                borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 500,
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <KPI label="Portfolio Value" value={latest ? `$${latest.totalValue.toFixed(2)}` : "—"} />
        <KPI label="Available Cash" value={latest ? `$${latest.availableCash.toFixed(2)}` : "—"} />
        <KPI
          label="Total P&L"
          value={`${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`}
          sub={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}% since start`}
          color={pnl >= 0 ? GREEN : RED}
        />
        <KPI label="Invocations" value={String(stats?.totalInvocations ?? 0)} sub={`${stats?.totalToolCalls ?? 0} tool calls`} />
        <KPI label="Total Cost" value={`$${(stats?.totalCost ?? 0).toFixed(4)}`} sub="LLM API spend" color={YELLOW} />
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: "0.75rem" }}>Portfolio Value Over Time</div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={GREEN} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="time" stroke={MUTED} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis stroke={MUTED} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#1a1a1a", border: `1px solid ${BORDER}`, borderRadius: 6 }} />
                <Legend />
                <Area type="monotone" dataKey="value" stroke={GREEN} fill="url(#gv)" dot={false} name="Total Value" />
                <Line type="monotone" dataKey="cash" stroke={BLUE} dot={false} name="Cash" strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: "0.75rem" }}>Tool Usage</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={toolData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis type="number" stroke={MUTED} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" stroke={MUTED} tick={{ fontSize: 10 }} width={130} />
                <Tooltip contentStyle={{ background: "#1a1a1a", border: `1px solid ${BORDER}`, borderRadius: 6 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {toolData.map((_, i) => (
                    <Cell key={i} fill={[GREEN, RED, BLUE, YELLOW][i % 4]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {/* TRADES TAB */}
      {activeTab === "trades" && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: "0.75rem" }}>Recent Invocations</div>
          {invocations.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No invocations yet.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {invocations.slice(0, 20).map((inv) => (
              <div key={inv.id} style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Badge text={inv.model?.name ?? "Unknown"} color={BLUE} />
                    {inv.toolCalls?.length > 0 && (
                      <Badge text={`${inv.toolCalls.length} tool call${inv.toolCalls.length > 1 ? "s" : ""}`} color={GREEN} />
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: MUTED }}>
                    <span style={{ color: YELLOW }}>${inv.totalCost.toFixed(5)}</span>
                    <span>{new Date(inv.timestamp).toLocaleString()}</span>
                  </div>
                </div>
                <p style={{ margin: "0.3rem 0 0.4rem", fontSize: 12, color: "#ccc", lineHeight: 1.5 }}>
                  {inv.response.slice(0, 300)}{inv.response.length > 300 ? "…" : ""}
                </p>
                {inv.toolCalls?.map((tc, i) => (
                  <div key={i} style={{ fontSize: 11, color: GREEN, marginTop: 3, fontFamily: "monospace" }}>
                    🔧 {tc.toolName}({JSON.stringify(tc.parameters).slice(0, 120)})
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* MODELS TAB */}
      {activeTab === "models" && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: "0.75rem" }}>Model Performance</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}` }}>
                {["Model", "API Name", "Status", "Invocations", "Total Cost"].map((h) => (
                  <th key={h} style={{ padding: "6px 10px", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{m.name}</td>
                  <td style={{ padding: "8px 10px", color: MUTED, fontFamily: "monospace", fontSize: 11 }}>{m.apiModelName}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <Badge text={m.isActive ? "Active" : "Inactive"} color={m.isActive ? GREEN : MUTED} />
                  </td>
                  <td style={{ padding: "8px 10px" }}>{m._count.invocations}</td>
                  <td style={{ padding: "8px 10px", color: YELLOW }}>${m.totalCost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
