/**
 * Paper Trading Engine — production-quality simulation.
 * Uses real market prices from Binance public API (no auth needed).
 * All order execution is simulated with realistic slippage + fees.
 * Stage 2: swap this file for the real Lighter DEX SDK.
 */

import { logger } from "./logger.ts";

export type Symbol = "BTC" | "ETH" | "SOL";

// ── Binance symbol map ────────────────────────────────────────────────────────
const BINANCE_SYMBOL: Record<Symbol, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
};

// ── Paper portfolio state (in-memory, persisted via DB snapshots) ─────────────
interface PaperPosition {
  symbol: Symbol;
  side: "long" | "short";
  quantity: number;
  leverage: number;
  entryPrice: number;
  openedAt: Date;
  liquidationPrice: number;
}

const paperState = {
  balance: parseFloat(process.env.TRADING_BUDGET_USD ?? "10000"),
  positions: [] as PaperPosition[],
};

// ── Realistic trading constants ───────────────────────────────────────────────
const TAKER_FEE = 0.0005;      // 0.05% taker fee (typical perp DEX)
const SLIPPAGE   = 0.0003;     // 0.03% market order slippage
const FUNDING_RATE = 0.0001;   // 0.01% per 8h funding (simplified)

// ── Candle type ───────────────────────────────────────────────────────────────
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── Fetch real OHLCV candles from Binance ─────────────────────────────────────
export async function getCandles(
  symbol: Symbol,
  resolution: string = "5m",
  count: number = 50
): Promise<Candle[]> {
  const binanceSym = BINANCE_SYMBOL[symbol];
  // Map resolution to Binance interval
  const intervalMap: Record<string, string> = {
    "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m",
    "30m": "30m", "1h": "1h", "4h": "4h", "1d": "1d",
  };
  const interval = intervalMap[resolution] ?? "5m";

  const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${interval}&limit=${count}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "dex-ai-trader/1.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Binance candles failed: ${res.status} ${res.statusText}`);

  const raw: any[][] = await res.json();
  return raw.map((k) => ({
    time:   parseInt(k[0]),
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

// ── Fetch real bid/ask from Binance order book ────────────────────────────────
export async function getBestPrices(symbol: Symbol): Promise<{ bid: number; ask: number }> {
  const binanceSym = BINANCE_SYMBOL[symbol];
  const url = `https://api.binance.com/api/v3/ticker/bookTicker?symbol=${binanceSym}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "dex-ai-trader/1.0" },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Binance ticker failed: ${res.status}`);

  const data = await res.json();
  return {
    bid: parseFloat(data.bidPrice),
    ask: parseFloat(data.askPrice),
  };
}

// ── Paper wallet balance ──────────────────────────────────────────────────────
export async function getWalletBalance(): Promise<number> {
  // Apply unrealized PnL to available balance
  let unrealizedPnl = 0;
  for (const pos of paperState.positions) {
    const { bid, ask } = await getBestPrices(pos.symbol).catch(() => ({ bid: pos.entryPrice, ask: pos.entryPrice }));
    const markPrice = (bid + ask) / 2;
    unrealizedPnl += calcUnrealizedPnl(pos, markPrice);
  }
  return parseFloat((paperState.balance + unrealizedPnl).toFixed(4));
}

// ── Open positions ────────────────────────────────────────────────────────────
export async function getOpenPositions(): Promise<any[]> {
  const enriched = await Promise.all(
    paperState.positions.map(async (pos) => {
      const { bid, ask } = await getBestPrices(pos.symbol).catch(() => ({
        bid: pos.entryPrice,
        ask: pos.entryPrice,
      }));
      const markPrice = (bid + ask) / 2;
      const unrealizedPnl = calcUnrealizedPnl(pos, markPrice);
      const roe = (unrealizedPnl / (pos.entryPrice * pos.quantity)) * 100;

      return {
        symbol:          pos.symbol,
        side:            pos.side,
        quantity:        pos.quantity,
        leverage:        pos.leverage,
        entryPrice:      pos.entryPrice,
        markPrice:       parseFloat(markPrice.toFixed(4)),
        unrealizedPnl:   parseFloat(unrealizedPnl.toFixed(4)),
        roe:             parseFloat(roe.toFixed(2)),
        liquidationPrice: pos.liquidationPrice,
        notionalValue:   parseFloat((pos.quantity * markPrice).toFixed(4)),
        openedAt:        pos.openedAt.toISOString(),
        isPaper:         true,
      };
    })
  );
  return enriched;
}

// ── Place a paper order ───────────────────────────────────────────────────────
export async function placeOrder(params: {
  symbol: Symbol;
  side: "long" | "short";
  quantity: number;
  leverage: number;
}): Promise<object> {
  const { symbol, side, quantity, leverage } = params;

  // Get real market price
  const { bid, ask } = await getBestPrices(symbol);
  const midPrice = (bid + ask) / 2;

  // Apply slippage (long pays ask + slippage, short gets bid - slippage)
  const fillPrice = side === "long"
    ? ask * (1 + SLIPPAGE)
    : bid * (1 - SLIPPAGE);

  const notional = quantity * fillPrice;
  const margin   = notional / leverage;
  const fee      = notional * TAKER_FEE;
  const totalCost = margin + fee;

  // Validate budget
  if (totalCost > paperState.balance) {
    throw new Error(`Insufficient paper balance. Need ${totalCost.toFixed(2)}, have ${paperState.balance.toFixed(2)}`);
  }

  // Liquidation price (simplified: entry ± (1/leverage) * 0.9 buffer)
  const liqBuffer = (1 / leverage) * 0.9;
  const liquidationPrice = side === "long"
    ? fillPrice * (1 - liqBuffer)
    : fillPrice * (1 + liqBuffer);

  // Deduct margin + fee from balance
  paperState.balance -= totalCost;

  const position: PaperPosition = {
    symbol, side, quantity, leverage,
    entryPrice: parseFloat(fillPrice.toFixed(6)),
    openedAt: new Date(),
    liquidationPrice: parseFloat(liquidationPrice.toFixed(4)),
  };
  paperState.positions.push(position);

  const result = {
    orderId:    `PAPER-${Date.now()}`,
    symbol,
    side,
    quantity,
    leverage,
    fillPrice:  parseFloat(fillPrice.toFixed(6)),
    notional:   parseFloat(notional.toFixed(4)),
    margin:     parseFloat(margin.toFixed(4)),
    fee:        parseFloat(fee.toFixed(6)),
    liquidationPrice: position.liquidationPrice,
    balanceAfter: parseFloat(paperState.balance.toFixed(4)),
    isPaper:    true,
    timestamp:  new Date().toISOString(),
  };

  logger.info("PAPER ORDER FILLED", result);
  return result;
}

// ── Close all paper positions ─────────────────────────────────────────────────
export async function closeAllPositions(): Promise<void> {
  if (paperState.positions.length === 0) return;

  for (const pos of paperState.positions) {
    const { bid, ask } = await getBestPrices(pos.symbol).catch(() => ({
      bid: pos.entryPrice,
      ask: pos.entryPrice,
    }));

    // Closing a long sells at bid - slippage; closing a short buys at ask + slippage
    const exitPrice = pos.side === "long"
      ? bid * (1 - SLIPPAGE)
      : ask * (1 + SLIPPAGE);

    const pnl = calcUnrealizedPnl(pos, exitPrice);
    const fee = pos.quantity * exitPrice * TAKER_FEE;
    const margin = (pos.quantity * pos.entryPrice) / pos.leverage;

    // Return margin + pnl - exit fee
    paperState.balance += margin + pnl - fee;

    logger.info("PAPER POSITION CLOSED", {
      symbol:     pos.symbol,
      side:       pos.side,
      entryPrice: pos.entryPrice,
      exitPrice:  parseFloat(exitPrice.toFixed(6)),
      pnl:        parseFloat(pnl.toFixed(4)),
      fee:        parseFloat(fee.toFixed(6)),
      balanceAfter: parseFloat(paperState.balance.toFixed(4)),
    });
  }

  paperState.positions = [];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcUnrealizedPnl(pos: PaperPosition, markPrice: number): number {
  const rawPnl = pos.side === "long"
    ? (markPrice - pos.entryPrice) * pos.quantity * pos.leverage
    : (pos.entryPrice - markPrice) * pos.quantity * pos.leverage;

  // Apply funding cost (hours held * funding rate)
  const hoursHeld = (Date.now() - pos.openedAt.getTime()) / 3_600_000;
  const fundingCost = pos.entryPrice * pos.quantity * FUNDING_RATE * (hoursHeld / 8);

  return rawPnl - fundingCost;
}
