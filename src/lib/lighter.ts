/**
 * Lighter DEX SDK wrapper
 * Docs: https://github.com/lighter-xyz/lighter-js-sdk
 */

// Market index mapping
export const MARKET_INDEX = {
  BTC: 0,
  ETH: 1,
  SOL: 2,
} as const;

export type Symbol = keyof typeof MARKET_INDEX;

// Lazy-init client so we don't crash if SDK isn't installed yet
let _client: any = null;

async function getClient() {
  if (_client) return _client;
  const { Lighter } = await import("lighter-js-sdk");
  _client = new Lighter({
    privateKey: process.env.LIGHTER_PRIVATE_KEY!,
    apiUrl: process.env.LIGHTER_API_URL ?? "https://mainnet.zklighter.elliot.ai",
  });
  return _client;
}

export async function getWalletBalance(): Promise<number> {
  const client = await getClient();
  const account = await client.getAccount();
  return parseFloat(account.availableBalance);
}

export async function getOpenPositions(): Promise<any[]> {
  const client = await getClient();
  const positions = await client.getPositions();
  return positions ?? [];
}

export async function getCandles(
  symbol: Symbol,
  resolution: "3" | "5" = "5",
  limit = 50
): Promise<Candle[]> {
  const client = await getClient();
  const marketIndex = MARKET_INDEX[symbol];
  const raw = await client.getCandles({ marketIndex, resolution, limit });
  return raw.map((c: any) => ({
    time: c.time,
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
    volume: parseFloat(c.volume),
  }));
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Place a limit order. Use an "obnoxious" price to act as a market order:
 * - Long:  price = ask * 1.05  (well above market, fills immediately)
 * - Short: price = bid * 0.95  (well below market, fills immediately)
 */
export async function placeOrder(params: {
  symbol: Symbol;
  side: "long" | "short";
  quantity: number;
  leverage: number;
}): Promise<any> {
  const client = await getClient();
  const marketIndex = MARKET_INDEX[params.symbol];

  const ticker = await client.getTicker({ marketIndex });
  const midPrice = (parseFloat(ticker.bestAsk) + parseFloat(ticker.bestBid)) / 2;
  const obnoxiousPrice =
    params.side === "long"
      ? (midPrice * 1.05).toFixed(2)
      : (midPrice * 0.95).toFixed(2);

  return client.createOrder({
    marketIndex,
    side: params.side === "long" ? "buy" : "sell",
    orderType: "limit",
    price: obnoxiousPrice,
    quantity: params.quantity.toString(),
    leverage: params.leverage.toString(),
  });
}

export async function closeAllPositions(): Promise<void> {
  const client = await getClient();
  const positions = await getOpenPositions();
  for (const pos of positions) {
    const closeSide = pos.side === "long" ? "sell" : "buy";
    const ticker = await client.getTicker({ marketIndex: pos.marketIndex });
    const midPrice =
      (parseFloat(ticker.bestAsk) + parseFloat(ticker.bestBid)) / 2;
    const obnoxiousPrice =
      closeSide === "sell"
        ? (midPrice * 0.95).toFixed(2)
        : (midPrice * 1.05).toFixed(2);

    await client.createOrder({
      marketIndex: pos.marketIndex,
      side: closeSide,
      orderType: "limit",
      price: obnoxiousPrice,
      quantity: pos.quantity,
      reduceOnly: true,
    });
  }
}
