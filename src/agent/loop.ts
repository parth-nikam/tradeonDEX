/**
 * Main execution loop.
 * Single run: bun run src/agent/loop.ts
 * Scheduled:  pm2 start ecosystem.config.cjs
 */

import { prisma } from "../lib/db.ts";
import { getCandles, getWalletBalance, getOpenPositions } from "../lib/lighter.ts";
import { calcIndicators } from "../lib/indicators.ts";
import { invokeModel } from "./invoke.ts";
import { logger } from "../lib/logger.ts";
import { config } from "../lib/config.ts";
import type { MarketContext, PortfolioContext } from "./prompt.ts";

const SYMBOLS = ["BTC", "ETH", "SOL"] as const;

async function fetchMarkets(): Promise<MarketContext[]> {
  const results = await Promise.allSettled(
    SYMBOLS.map(async (symbol) => {
      const candles = await getCandles(symbol, config.CANDLE_RESOLUTION, config.CANDLE_COUNT);
      const indicators = calcIndicators(candles);
      return { symbol, candles, indicators };
    })
  );

  return results
    .map((r, i) => {
      if (r.status === "rejected") {
        logger.error(`Failed to fetch market data for ${SYMBOLS[i]}`, { error: r.reason?.message });
        return null;
      }
      return r.value;
    })
    .filter(Boolean) as MarketContext[];
}

async function run() {
  const runStart = Date.now();
  logger.info("Agent loop starting");

  // 1. Fetch market data
  const markets = await fetchMarkets();
  if (markets.length === 0) {
    logger.error("No market data available, aborting run");
    return;
  }

  // 2. Fetch portfolio state
  let availableCash = 0;
  let openPositions: any[] = [];
  try {
    [availableCash, openPositions] = await Promise.all([
      getWalletBalance(),
      getOpenPositions(),
    ]);
  } catch (err: any) {
    logger.warn("Could not fetch portfolio state, using defaults", { error: err?.message });
  }

  const positionValue = openPositions.reduce(
    (sum: number, p: any) => sum + parseFloat(p.notionalValue ?? p.unrealizedPnl ?? 0),
    0
  );

  const portfolio: PortfolioContext = {
    totalValue: availableCash + positionValue,
    availableCash,
    openPositions,
  };

  logger.info("Portfolio state", {
    totalValue: portfolio.totalValue,
    availableCash: portfolio.availableCash,
    openPositions: openPositions.length,
  });

  // 3. Snapshot portfolio
  try {
    await prisma.portfolioSnapshot.create({
      data: {
        modelId: 0,
        totalValue: portfolio.totalValue,
        availableCash: portfolio.availableCash,
        positions: openPositions,
      },
    });
  } catch (err: any) {
    logger.warn("Could not save portfolio snapshot", { error: err?.message });
  }

  // 4. Run active models
  let models: any[] = [];
  try {
    models = await prisma.modelConfig.findMany({ where: { isActive: true } });
  } catch (err: any) {
    logger.error("Could not fetch model configs from DB", { error: err?.message });
    return;
  }

  if (models.length === 0) {
    logger.warn("No active models found. Run: bun run seed");
    return;
  }

  let totalCost = 0;
  for (const model of models) {
    logger.info(`Running model: ${model.name}`, { apiModel: model.apiModelName });
    try {
      const { text, invocationId, cost } = await invokeModel(model, portfolio, markets);
      totalCost += cost;
      logger.info(`Model response`, {
        model: model.name,
        invocationId,
        preview: text.slice(0, 150).replace(/\n/g, " "),
      });
    } catch (err: any) {
      logger.error(`Model invocation failed`, { model: model.name, error: err?.message });
    }
  }

  const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
  logger.info("Agent loop complete", { elapsed: `${elapsed}s`, totalCost: `$${totalCost.toFixed(6)}` });
}

// Run immediately
await run().catch((err) => {
  logger.error("Fatal loop error", { error: err?.message, stack: err?.stack });
  process.exit(1);
});

// Optional: keep running on interval (set LOOP_INTERVAL_MS env var)
if (config.LOOP_INTERVAL_MS > 0) {
  logger.info(`Loop interval set to ${config.LOOP_INTERVAL_MS}ms`);
  setInterval(() => {
    run().catch((err) => logger.error("Loop iteration error", { error: err?.message }));
  }, config.LOOP_INTERVAL_MS);
}
