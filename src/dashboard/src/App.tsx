import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { fetchSnapshots, fetchInvocations } from "./api";

interface Snapshot {
  timestamp: string;
  totalValue: number;
  availableCash: number;
}

interface Invocation {
  id: number;
  model: { name: string };
  timestamp: string;
  totalCost: number;
  response: string;
  toolCalls: { toolName: string; parameters: object; result: object }[];
}

export default function App() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [invocations, setInvocations] = useState<Invocation[]>([]);

  useEffect(() => {
    fetchSnapshots().then(setSnapshots).catch(console.error);
    fetchInvocations().then(setInvocations).catch(console.error);
    const id = setInterval(() => {
      fetchSnapshots().then(setSnapshots).catch(console.error);
      fetchInvocations().then(setInvocations).catch(console.error);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const chartData = snapshots.map((s) => ({
    time: new Date(s.timestamp).toLocaleTimeString(),
    totalValue: parseFloat(s.totalValue.toFixed(2)),
    availableCash: parseFloat(s.availableCash.toFixed(2)),
  }));

  const latest = snapshots[snapshots.length - 1];

  return (
    <div style={{ fontFamily: "sans-serif", padding: "1.5rem", background: "#0f0f0f", minHeight: "100vh", color: "#e5e5e5" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>DEX AI Trader Dashboard</h1>
      <p style={{ color: "#888", marginBottom: "2rem" }}>Auto-refreshes every 30s</p>

      {/* KPI row */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
        <KPI label="Portfolio Value" value={latest ? `$${latest.totalValue.toFixed(2)}` : "—"} />
        <KPI label="Available Cash" value={latest ? `$${latest.availableCash.toFixed(2)}` : "—"} />
        <KPI label="Total Invocations" value={invocations.length.toString()} />
        <KPI
          label="Total Cost"
          value={`$${invocations.reduce((s, i) => s + i.totalCost, 0).toFixed(4)}`}
        />
      </div>

      {/* Portfolio chart */}
      <div style={{ background: "#1a1a1a", borderRadius: 8, padding: "1rem", marginBottom: "2rem" }}>
        <h2 style={{ marginTop: 0 }}>Portfolio Over Time</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="time" stroke="#666" tick={{ fontSize: 11 }} />
            <YAxis stroke="#666" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#222", border: "none" }} />
            <Legend />
            <Line type="monotone" dataKey="totalValue" stroke="#4ade80" dot={false} name="Total Value" />
            <Line type="monotone" dataKey="availableCash" stroke="#60a5fa" dot={false} name="Cash" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Recent invocations */}
      <div style={{ background: "#1a1a1a", borderRadius: 8, padding: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Recent Invocations</h2>
        {invocations.length === 0 && <p style={{ color: "#666" }}>No invocations yet.</p>}
        {invocations.slice(-10).reverse().map((inv) => (
          <div key={inv.id} style={{ borderBottom: "1px solid #333", paddingBottom: "0.75rem", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#aaa" }}>
              <span>{inv.model?.name ?? "Unknown"}</span>
              <span>{new Date(inv.timestamp).toLocaleString()}</span>
              <span style={{ color: "#f59e0b" }}>${inv.totalCost.toFixed(5)}</span>
            </div>
            <p style={{ margin: "0.4rem 0 0.25rem", fontSize: 13 }}>{inv.response.slice(0, 200)}...</p>
            {inv.toolCalls?.map((tc, i) => (
              <div key={i} style={{ fontSize: 12, color: "#4ade80", marginTop: 4 }}>
                🔧 {tc.toolName}({JSON.stringify(tc.parameters)})
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, background: "#1a1a1a", borderRadius: 8, padding: "1rem" }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
