/**
 * Lighter DEX SDK wrapper
 * API docs: https://mainnet.zklighter.elliot.ai/api/v1/
 */
import * as sdk from "../../node_modules/lighter-js-sdk/dist/generated/index.js";
import { logger } from "./logger.ts";

// Real market IDs from /api/v1/orderBookDetails
export const MARKET_INDEX: Record<string, number> = {
  ETH: 0,
  BTC: 1,
  SOL: 2,
};

export type Symbol = "BTC" | "ETH" | "SOL";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function getConfig() {
  return (sdk as any).createConfiguration({
    baseServer: new (sdk as any).ServerConfiguration(
      process.env.LIGHTER_API_URL ?? "https://mainnet.zklighter.elliot.ai",
      {}
    ),
  });
}

export async function getWalletBalance(): Promise<number> {
  const address = process.env.LIGHTER_WALLET_ADDRESS;
  if (!address) {
    logger.warn("[lighter] LIGHTER_WALLET_ADDRESS not set, returning 0 balance");
    return 0;
  }
  const api = new (sdk as any).AccountApi(getConfig());
  const account = await api.account("l1_address", address);
  return parseFloat(account?.availableBalance ?? account?.available_balance ?? "0");
}

export async function getOpenPositions(): Promise<any[]> {
  const address = process.env.LIGHTER_WALLET_ADDRESS;
  if (!address) return [];
  const api = new (sdk as any).AccountApi(getConfig());
  const account = await api.account("l1_address", address);
  return account?.positions ?? [];
}

export async function getCandles(
  symbol: Symbol,
  resolution: "1m" | "5m" | "15m" | "1h" = "5m",
  countBack = 50
): Promise<Candle[]> {
  const api = new (sdk as any).CandlestickApi(getConfig());
  const marketId = MARKET_INDEX[symbol];
  const now = Math.floor(Date.now() / 1000);
  const resSeconds: Record<string, number> = {
    "1m": 60, "5m": 300, "15m": 900, "1h": 3600,
  };
  const startTimestamp = now - resSeconds[resolution] * countBack;

  try {
    const raw = await api.candlesticks(
      marketId,
      resolution,
      startTimestamp,
      now,
      countBack,
      false
    );
    const candles: any[] = raw?.candlesticks ?? raw ?? [];
    return candles.map((c: any) => ({
      time: typeof c.time === "number" ? c.time : parseInt(c.time ?? c.timestamp),
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume ?? "0"),
    }));
  } catch (err: any) {
    // If 403 (no auth), fall back to synthetic candles from order book
    logger.warn(`[lighter] Candlestick fetch failed (${err?.code ?? err?.message}), using order book price fallback — indicators will be unreliable`);
    return getCandlesFallback(symbol, countBack);
  }
}

/**
 * Fallback: build synthetic "candles" from the current order book mid-price.
 * Not real OHLCV data — only useful for testing without auth.
 */
async function getCandlesFallback(symbol: Symbol, count: number): Promise<Candle[]> {
  const { bid, ask } = await getBestPrices(MARKET_INDEX[symbol]);
  const mid = (bid + ask) / 2;
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: count }, (_, i) => ({
    time: now - (count - i) * 300,
    open: mid,
    high: mid * 1.001,
    low: mid * 0.999,
    close: mid,
    volume: 0,
  }));
}

/**
 * Get best bid/ask from the public orderBookDetails endpoint.
 */
export async function getBestPrices(marketIdOrSymbol: number | string): Promise<{ bid: number; ask: number }> {
  const marketId = typeof marketIdOrSymbol === "string" ? MARKET_INDEX[marketIdOrSymbol] ?? 0 : marketIdOrSymbol;
  // Use the public REST endpoint directly — no auth needed
  const res = await fetch(`${process.env.LIGHTER_API_URL ?? "https://mainnet.zklighter.elliot.ai"}/api/v1/orderBookDetails`);
  const data = await res.json() as any;
  const markets: any[] = data?.perp_order_book_details ?? data?.order_book_details ?? [];
  const market = markets.find((m: any) => m.market_id === marketId);
  if (!market) return { bid: 0, ask: 0 };
  const price = parseFloat(market.last_trade_price ?? "0");
  // Approximate bid/ask from last trade price (±0.05%)
  return { bid: price * 0.9995, ask: price * 1.0005 };
}

/**
 * Place a limit order using an "obnoxious" price to act as a market order:
 * - Long:  price = ask * 1.05  (fills immediately)
 * - Short: price = bid * 0.95  (fills immediately)
 *
 * NOTE: Actual order placement requires a signed transaction via private key.
 * The SDK's OrderApi handles REST reads; writes go through the signer module.
 */
export async function placeOrder(params: {
  symbol: Symbol;
  side: "long" | "short";
  quantity: number;
  leverage: number;
}): Promise<any> {
  const marketId = MARKET_INDEX[params.symbol];
  const { bid, ask } = await getBestPrices(marketId);
  const mid = (bid + ask) / 2;

  const obnoxiousPrice =
    params.side === "long"
      ? (mid * 1.05).toFixed(2)
      : (mid * 0.95).toFixed(2);

  // TODO: Replace with signed transaction via Lighter signer module
  // when LIGHTER_PRIVATE_KEY is configured.
  logger.info(
    `[lighter] Would place ${params.side} ${params.quantity} ${params.symbol} @ ${obnoxiousPrice} (${params.leverage}x)`
  );

  return {
    symbol: params.symbol,
    side: params.side,
    quantity: params.quantity,
    leverage: params.leverage,
    price: obnoxiousPrice,
    status: "simulated",
  };
}

export async function closeAllPositions(): Promise<void> {
  const positions = await getOpenPositions();
  for (const pos of positions) {
    const symbol = Object.keys(MARKET_INDEX).find(
      (k) => MARKET_INDEX[k] === pos.marketIndex
    ) as Symbol | undefined;
    if (!symbol) continue;

    const { bid, ask } = await getBestPrices(pos.marketIndex);
    const mid = (bid + ask) / 2;
    const closeSide = pos.side === "long" ? "short" : "long";
    const price =
      closeSide === "short"
        ? (mid * 0.95).toFixed(2)
        : (mid * 1.05).toFixed(2);

    logger.info(
      `[lighter] Would close ${pos.side} position on ${symbol} @ ${price}`
    );
    // TODO: signed transaction
  }
}
