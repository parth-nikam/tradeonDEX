import type { Indicators } from "../lib/indicators.ts";
import { config } from "../lib/config.ts";

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

## CONSTRAINTS
- Total trading budget: $${config.TRADING_BUDGET_USD}. Never risk more than this.
- You can only hold ONE position at a time across all markets.
- If you want to open a new position and one already exists, you MUST call closeAllPositions first, then createPosition.
- Only trade when you have a HIGH-CONFIDENCE signal (at least 3 confirming indicators).
- When in doubt, do NOTHING. Patience is a strategy.
- Prefer risk/reward ratios of at least 2:1.
- Max leverage: ${config.MAX_LEVERAGE}x. Default to 2x unless the setup is very strong.
- Never use more than 20% of available cash on a single trade.

## SIGNAL FRAMEWORK
Strong LONG signals:
- EMA9 crosses above EMA21 (golden cross)
- MACD histogram turning positive
- RSI between 40-60 (not overbought)
- Price above BB middle band
- Trend = bullish

Strong SHORT signals:
- EMA9 crosses below EMA21 (death cross)
- MACD histogram turning negative
- RSI between 40-60 (not oversold)
- Price below BB middle band
- Trend = bearish

AVOID trading when:
- RSI > 75 (overbought) for longs
- RSI < 25 (oversold) for shorts
- MACD and EMA signals conflict
- Price is at BB extremes without momentum

## AVAILABLE TOOLS
- createPosition(symbol, side, quantity, leverage) — open a new position
- closeAllPositions() — close everything immediately

## RESPONSE FORMAT
1. Brief market analysis for each symbol (2-3 sentences)
2. Your trading decision with reasoning
3. Tool call(s) if action is warranted
4. If no action: explain exactly what signal you're waiting for`;

export function buildUserPrompt(
  portfolio: PortfolioContext,
  markets: MarketContext[]
): string {
  const positionSummary =
    portfolio.openPositions.length === 0
      ? "None"
      : portfolio.openPositions
          .map((p: any) => `  ${p.symbol ?? p.marketIndex}: ${p.side} ${p.amount ?? p.quantity} @ entry ${p.entryPrice ?? "unknown"} (PnL: ${p.unrealizedPnl ?? "unknown"})`)
          .join("\n");

  const marketSummaries = markets
    .map(({ symbol, candles, indicators: ind }) => {
      const last3 = candles.slice(-3);
      const vol24h = candles.reduce((s, c) => s + c.volume, 0).toFixed(2);
      return `
### ${symbol} — $${ind.lastClose.toFixed(2)} (${ind.priceChange24h >= 0 ? "+" : ""}${ind.priceChange24h.toFixed(2)}% period)
Trend: ${ind.trend.toUpperCase()}
EMA:   9=${ind.ema9.toFixed(2)}  21=${ind.ema21.toFixed(2)}  50=${ind.ema50.toFixed(2)}
MACD:  ${ind.macd.toFixed(4)} | Signal: ${ind.macdSignal.toFixed(4)} | Hist: ${ind.macdHistogram.toFixed(4)}
RSI14: ${ind.rsi14.toFixed(1)} ${ind.rsi14 > 70 ? "⚠️ OVERBOUGHT" : ind.rsi14 < 30 ? "⚠️ OVERSOLD" : "✅ NEUTRAL"}
BB:    Upper=${ind.bbUpper.toFixed(2)}  Mid=${ind.bbMiddle.toFixed(2)}  Lower=${ind.bbLower.toFixed(2)}
Vol:   ${vol24h} (period total)
Last 3 candles:
${last3.map((c) => `  ${new Date(c.time * 1000).toISOString().slice(11, 16)} O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)} V:${c.volume.toFixed(2)}`).join("\n")}`;
    })
    .join("\n");

  return `## PORTFOLIO
Total Value:    $${portfolio.totalValue.toFixed(2)}
Available Cash: $${portfolio.availableCash.toFixed(2)}
Open Positions: ${portfolio.openPositions.length === 0 ? "None" : "\n" + positionSummary}

## MARKET DATA (${config.CANDLE_RESOLUTION} candles, last ${config.CANDLE_COUNT})
${marketSummaries}

---
Timestamp: ${new Date().toISOString()}
What is your trading decision?`;
}
