const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(BASE + path);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

export const api = {
  snapshots: (limit = 200) => get<Snapshot[]>("/snapshots", { limit: String(limit) }),
  invocations: (limit = 50, modelId?: number) =>
    get<Invocation[]>("/invocations", { limit: String(limit), ...(modelId ? { modelId: String(modelId) } : {}) }),
  models: () => get<ModelStat[]>("/models"),
  stats: () => get<Stats>("/stats"),
};

export interface Snapshot {
  id: number;
  timestamp: string;
  totalValue: number;
  availableCash: number;
  positions: any[];
}

export interface Invocation {
  id: number;
  model: { name: string; apiModelName: string };
  timestamp: string;
  totalCost: number;
  response: string;
  toolCalls: ToolCall[];
}

export interface ToolCall {
  toolName: string;
  parameters: Record<string, unknown>;
  result: Record<string, unknown>;
  timestamp: string;
}

export interface ModelStat {
  id: number;
  name: string;
  apiModelName: string;
  isActive: boolean;
  totalCost: number;
  _count: { invocations: number };
}

export interface Stats {
  totalInvocations: number;
  totalToolCalls: number;
  totalCost: number;
  latestPortfolioValue: number;
  toolBreakdown: { toolName: string; _count: { toolName: number } }[];
}
