/**
 * Bun HTTP API server for the dashboard.
 * Run: bun run src/api/server.ts
 */
import { prisma } from "../lib/db.ts";
import { logger } from "../lib/logger.ts";
import { config } from "../lib/config.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

Bun.serve({
  port: config.API_PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    try {
      // GET /snapshots?limit=200
      if (url.pathname === "/snapshots") {
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "200"), 1000);
        const data = await prisma.portfolioSnapshot.findMany({
          orderBy: { timestamp: "asc" },
          take: limit,
        });
        return json(data);
      }

      // GET /invocations?limit=50&modelId=1
      if (url.pathname === "/invocations") {
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
        const modelId = url.searchParams.get("modelId");
        const data = await prisma.modelInvocation.findMany({
          where: modelId ? { modelId: parseInt(modelId) } : undefined,
          orderBy: { timestamp: "desc" },
          take: limit,
          include: { model: { select: { name: true, apiModelName: true } }, toolCalls: true },
        });
        return json(data);
      }

      // GET /models
      if (url.pathname === "/models") {
        const models = await prisma.modelConfig.findMany({
          include: { _count: { select: { invocations: true } } },
        });
        const withCost = await Promise.all(
          models.map(async (m) => {
            const agg = await prisma.modelInvocation.aggregate({
              where: { modelId: m.id },
              _sum: { totalCost: true },
            });
            return { ...m, totalCost: agg._sum.totalCost ?? 0 };
          })
        );
        return json(withCost);
      }

      // GET /trades?limit=100&status=closed
      if (url.pathname === "/trades") {
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500);
        const status = url.searchParams.get("status");
        const data = await (prisma as any).tradeRecord.findMany({
          where: status ? { status } : undefined,
          orderBy: { openedAt: "desc" },
          take: limit,
        });
        return json(data);
      }

      // GET /stats
      if (url.pathname === "/stats") {
        const [totalInvocations, totalToolCalls, costAgg, latestSnapshot, tradeStats] = await Promise.all([
          prisma.modelInvocation.count(),
          prisma.toolCall.count(),
          prisma.modelInvocation.aggregate({ _sum: { totalCost: true } }),
          prisma.portfolioSnapshot.findFirst({ orderBy: { timestamp: "desc" } }),
          (prisma as any).tradeRecord.findMany({ where: { status: "closed" }, select: { pnl: true, side: true } }) as Promise<{ pnl: number | null; side: string }[]>,
        ]);

        const toolBreakdown = await prisma.toolCall.groupBy({
          by: ["toolName"],
          _count: { toolName: true },
        });

        const closedTrades = (tradeStats as { pnl: number | null; side: string }[]).filter((t) => t.pnl !== null);
        const totalPnl = closedTrades.reduce((s: number, t: { pnl: number | null }) => s + (t.pnl ?? 0), 0);
        const winningTrades = closedTrades.filter((t: { pnl: number | null }) => (t.pnl ?? 0) > 0);
        const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;

        return json({
          totalInvocations,
          totalToolCalls,
          totalCost: costAgg._sum.totalCost ?? 0,
          latestPortfolioValue: latestSnapshot?.totalValue ?? 0,
          toolBreakdown,
          totalPnl,
          winRate,
          totalTrades: closedTrades.length,
          winningTrades: winningTrades.length,
        });
      }

      // GET /health
      if (url.pathname === "/health") {
        return json({ status: "ok", ts: new Date().toISOString() });
      }

      return json({ error: "Not found" }, 404);
    } catch (err: any) {
      logger.error("API error", { path: url.pathname, error: err?.message });
      return json({ error: "Internal server error" }, 500);
    }
  },
});

logger.info(`API server running`, { port: config.API_PORT });
