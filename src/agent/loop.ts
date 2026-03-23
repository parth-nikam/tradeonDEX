/**
 * Main execution loop — runs every 5 minutes.
 * Deploy with: pm2 start "bun run src/agent/loop.ts" --name dex-trader --cron "*/5 * * * *"
 */

import { prisma } from "../lib/db.ts";
import { getCandles, getWalletBalance, getOpenPositions } from "../lib/lighter.ts";
import { calcIndicators } from "../lib/indicators.ts";
import { invokeModel } from "./invoke.ts";
import type { MarketContext, PortfolioContext } from "./prompt.ts";

const SYMBOLS = ["BTC", "ETH", "SOL"] as const;

async function run() {
  console.log(`[${new Date().toISOString()}] Starting agent loop...`);

  // 1. Fetch market data for all symbols
  const markets: MarketContext[] = await Promise.all(
    SYMBOLS.map(async (symbol) => {
      const candles = await getCandles(symbol, "5", 50);
      const indicators = calcIndicators(candles);
      return { symbol, candles, indicators };
    })
  );

  // 2. Fetch portfolio state
  const [availableCash, openPositions] = await Promise.all([
    getWalletBalance(),
    getOpenPositions(),
  ]);

  const positionValue = openPositions.reduce(
    (sum: number, p: any) => sum + parseFloat(p.notionalValue ?? 0),
    0
  );

  const portfolio: PortfolioContext = {
    totalValue: availableCash + positionValue,
    availableCash,
    openPositions,
  };

  // 3. Snapshot portfolio to DB
  await prisma.portfolioSnapshot.create({
    data: {
      modelId: 0, // global snapshot
      totalValue: portfolio.totalValue,
      availableCash: portfolio.availableCash,
      positions: openPositions,
    },
  });

  // 4. Run each active model
  const models = await prisma.modelConfig.findMany({ where: { isActive: true } });

  if (models.length === 0) {
    console.warn("No active models found. Add one via DB or seed script.");
    return;
  }

  for (const model of models) {
    console.log(`  Running model: ${model.name} (${model.apiModelName})`);
    try {
      const { text, invocationId } = await invokeModel(model, portfolio, markets);
      console.log(`  [${model.name}] Response: ${text.slice(0, 120)}...`);
      console.log(`  [${model.name}] Invocation ID: ${invocationId}`);
    } catch (err) {
      console.error(`  [${model.name}] Error:`, err);
    }
  }

  console.log(`[${new Date().toISOString()}] Loop complete.\n`);
}

// Run immediately, then on interval if LOOP_INTERVAL_MS is set
await run();

const intervalMs = parseInt(process.env.LOOP_INTERVAL_MS ?? "0");
if (intervalMs > 0) {
  setInterval(run, intervalMs);
}
