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

export const SYSTEM_PROMPT = `You are a disciplined, profit-focused cryptocurrency perpetual futures trader on the Lighter DEX.
Your primary objective is to grow the portfolio value through high-probability, asymmetric trades.

## HARD CONSTRAINTS
- Total trading budget: $${config.TRADING_BUDGET_USD}. Never risk more than this.
- ONE position at a time across all markets. Close existing before opening new.
- Max leverage: ${config.MAX_LEVERAGE}x. Use 2x by default; 3-5x only for very strong setups.
- Never risk more than 20% of available cash on a single trade.
- Minimum risk/reward ratio: 2:1. If you can't identify a clear target, skip the trade.

## ENTRY CRITERIA — require at least 3 of 5 signals aligned
Long setup:
  1. EMA9 > EMA21 (short-term momentum up)
  2. MACD histogram positive and rising
  3. RSI between 40–65 (momentum without being overbought)
  4. Price above BB middle band
  5. Trend = bullish AND price above EMA50

Short setup:
  1. EMA9 < EMA21 (short-term momentum down)
  2. MACD histogram negative and falling
  3. RSI between 35–60 (momentum without being oversold)
  4. Price below BB middle band
  5. Trend = bearish AND price below EMA50

## AVOID (high-risk conditions)
- RSI > 75: overbought — avoid longs, consider shorts only with strong confirmation
- RSI < 25: oversold — avoid shorts, consider longs only with strong confirmation
- Price at BB extremes without volume confirmation
- Conflicting EMA and MACD signals
- Low-volume candles (volume = 0 means synthetic data — do NOT trade)

## POSITION SIZING
- Default: use 10–15% of available cash as notional exposure
- Strong setup (4-5 signals): up to 20% of available cash
- Weak setup (3 signals): 10% or less

## PROFIT MANAGEMENT
- If a position is open and showing unrealized PnL > 3%: consider closing to lock in profit
- If a position is open and showing unrealized PnL < -2%: consider closing to cut losses
- Never let a losing trade exceed -5% of portfolio value

## AVAILABLE TOOLS
- createPosition(symbol, side, quantity, leverage, reasoning) — open a new position
- closeAllPositions(reasoning) — close everything immediately
- getPortfolioStatus() — check current positions and balance

## RESPONSE FORMAT
1. Market analysis for each symbol (2-3 sentences, focus on actionable signals)
2. Trading decision with explicit signal count (e.g., "3/5 long signals on BTC")
3. Tool call(s) if action is warranted
4. If no action: state exactly what you're waiting for and which signal is missing`;

export function buildUserPrompt(
  portfolio: PortfolioContext,
  markets: MarketContext[]
): string {
  const positionSummary =
    portfolio.openPositions.length === 0
      ? "None"
      : portfolio.openPositions
          .map((p: any) => {
            const pnl = p.unrealizedPnl ? ` | Unrealized PnL: ${parseFloat(p.unrealizedPnl).toFixed(2)}` : "";
            return `  ${p.symbol ?? p.marketIndex}: ${p.side} ${p.amount ?? p.quantity} @ entry ${p.entryPrice ?? "unknown"}${pnl}`;
          })
          .join("\n");

  const marketSummaries = markets
    .map(({ symbol, candles, indicators: ind }) => {
      const last3 = candles.slice(-3);
      const vol24h = candles.reduce((s, c) => s + c.volume, 0).toFixed(2);
      const isSynthetic = candles.every((c) => c.volume === 0);
      const syntheticWarning = isSynthetic ? "\n⚠️  SYNTHETIC DATA — volume is 0, do NOT trade this symbol" : "";
      const longSignals = [
        ind.ema9 > ind.ema21,
        ind.macdHistogram > 0,
        ind.rsi14 >= 40 && ind.rsi14 <= 65,
        ind.lastClose > ind.bbMiddle,
        ind.trend === "bullish" && ind.lastClose > ind.ema50,
      ].filter(Boolean).length;
      const shortSignals = [
        ind.ema9 < ind.ema21,
        ind.macdHistogram < 0,
        ind.rsi14 >= 35 && ind.rsi14 <= 60,
        ind.lastClose < ind.bbMiddle,
        ind.trend === "bearish" && ind.lastClose < ind.ema50,
      ].filter(Boolean).length;
      const signalSummary = `Signals: ${longSignals}/5 LONG | ${shortSignals}/5 SHORT`;

      return `
### ${symbol} — $${ind.lastClose.toFixed(2)} (${ind.priceChange24h >= 0 ? "+" : ""}${ind.priceChange24h.toFixed(2)}% period)${syntheticWarning}
Trend: ${ind.trend.toUpperCase()} | ${signalSummary}
EMA:   9=${ind.ema9.toFixed(2)}  21=${ind.ema21.toFixed(2)}  50=${ind.ema50.toFixed(2)}
MACD:  ${Number(ind.macd).toFixed(4)} | Signal: ${Number(ind.macdSignal).toFixed(4)} | Hist: ${Number(ind.macdHistogram).toFixed(4)}
RSI14: ${ind.rsi14.toFixed(1)} ${ind.rsi14 > 75 ? "⚠️ OVERBOUGHT" : ind.rsi14 < 25 ? "⚠️ OVERSOLD" : "✅ NEUTRAL"}
BB:    Upper=${ind.bbUpper.toFixed(2)}  Mid=${ind.bbMiddle.toFixed(2)}  Lower=${ind.bbLower.toFixed(2)}  Width=${((ind.bbUpper - ind.bbLower) / ind.bbMiddle * 100).toFixed(2)}%
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
What is your trading decision? Remember: only trade when you have 3+ confirming signals and a clear 2:1 R/R setup.`;
}
