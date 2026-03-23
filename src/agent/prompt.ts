import type { Indicators } from "../lib/indicators.ts";

export interface MarketContext {
  symbol: string;
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  indicators: Indicators;
}

export interface PortfolioContext {
  totalValue: number;
  availableCash: number;
  openPositions: any[];
}

export const SYSTEM_PROMPT = `You are an expert cryptocurrency perpetual futures trader operating on the Lighter DEX.

RULES:
- Your total trading budget is $50. Never risk more than this.
- You can only hold ONE position at a time across all markets.
- If you want to open a new position and one already exists, you MUST call closeAllPositions first.
- Only trade when you have a high-confidence signal. When in doubt, do nothing.
- Prefer risk/reward ratios of at least 2:1.
- Max leverage: 5x. Default to 2x unless the setup is very strong.

AVAILABLE ACTIONS:
- createPosition(symbol, side, quantity, leverage) — open a new position
- closeAllPositions() — close everything immediately

Respond with your reasoning first, then call the appropriate tool(s). If no action is warranted, explain why.`;

export function buildUserPrompt(
  portfolio: PortfolioContext,
  markets: MarketContext[]
): string {
  const positionSummary =
    portfolio.openPositions.length === 0
      ? "None"
      : JSON.stringify(portfolio.openPositions, null, 2);

  const marketSummaries = markets
    .map(({ symbol, candles, indicators }) => {
      const last5 = candles.slice(-5);
      return `
## ${symbol}
Last close: $${indicators.lastClose.toFixed(2)}
EMA9: ${indicators.ema9.toFixed(2)} | EMA21: ${indicators.ema21.toFixed(2)}
MACD: ${indicators.macd.toFixed(4)} | Signal: ${indicators.macdSignal.toFixed(4)} | Histogram: ${indicators.macdHistogram.toFixed(4)}
Recent candles (last 5 of 50):
${last5.map((c) => `  [${new Date(c.time * 1000).toISOString()}] O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`).join("\n")}`;
    })
    .join("\n");

  return `
PORTFOLIO STATUS:
- Total Value: $${portfolio.totalValue.toFixed(2)}
- Available Cash: $${portfolio.availableCash.toFixed(2)}
- Open Positions: ${positionSummary}

MARKET DATA (5-min candles, last 50):
${marketSummaries}

Based on the above, what action should be taken?`;
}
