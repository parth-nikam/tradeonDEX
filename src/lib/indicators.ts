import { EMA, MACD, RSI, BollingerBands } from "technicalindicators";
import type { Candle } from "./lighter.ts";

export interface Indicators {
  ema9: number;
  ema21: number;
  ema50: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  rsi14: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  lastClose: number;
  priceChange24h: number; // % change from first candle to last
  trend: "bullish" | "bearish" | "neutral";
}

export function calcIndicators(candles: Candle[]): Indicators {
  const closes = candles.map((c) => c.close);

  const ema9Arr = EMA.calculate({ period: 9, values: closes });
  const ema21Arr = EMA.calculate({ period: 21, values: closes });
  const ema50Arr = EMA.calculate({ period: 50, values: closes });

  const macdResult = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  const rsiArr = RSI.calculate({ period: 14, values: closes });

  const bbArr = BollingerBands.calculate({
    period: 20,
    values: closes,
    stdDev: 2,
  });

  const lastMacd = macdResult[macdResult.length - 1];
  const lastBB = bbArr[bbArr.length - 1];
  const lastClose = closes[closes.length - 1];
  const firstClose = closes[0];

  const ema9 = ema9Arr[ema9Arr.length - 1] ?? 0;
  const ema21 = ema21Arr[ema21Arr.length - 1] ?? 0;

  // Simple trend: ema9 > ema21 and price above ema21 = bullish
  const trend: Indicators["trend"] =
    ema9 > ema21 && lastClose > ema21
      ? "bullish"
      : ema9 < ema21 && lastClose < ema21
      ? "bearish"
      : "neutral";

  return {
    ema9,
    ema21,
    ema50: ema50Arr[ema50Arr.length - 1] ?? 0,
    macd: lastMacd?.MACD ?? 0,
    macdSignal: lastMacd?.signal ?? 0,
    macdHistogram: lastMacd?.histogram ?? 0,
    rsi14: rsiArr[rsiArr.length - 1] ?? 50,
    bbUpper: lastBB?.upper ?? 0,
    bbMiddle: lastBB?.middle ?? 0,
    bbLower: lastBB?.lower ?? 0,
    lastClose,
    priceChange24h: firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0,
    trend,
  };
}
