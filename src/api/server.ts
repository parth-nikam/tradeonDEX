/**
 * Minimal Bun HTTP server for the dashboard.
 * Run: bun run src/api/server.ts
 */
import { prisma } from "../lib/db.ts";

const PORT = parseInt(process.env.API_PORT ?? "3001");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === "/snapshots") {
      const data = await prisma.portfolioSnapshot.findMany({
        orderBy: { timestamp: "asc" },
        take: 200,
      });
      return Response.json(data, { headers: CORS });
    }

    if (url.pathname === "/invocations") {
      const data = await prisma.modelInvocation.findMany({
        orderBy: { timestamp: "desc" },
        take: 50,
        include: { model: true, toolCalls: true },
      });
      return Response.json(data, { headers: CORS });
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
});

console.log(`API server running on http://localhost:${PORT}`);
