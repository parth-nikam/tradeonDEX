import { EMA, MACD } from "technicalindicators";
import type { Candle } from "./lighter.ts";

export interface Indicators {
  ema9: number;
  ema21: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  lastClose: number;
}

export function calcIndicators(candles: Candle[]): Indicators {
  const closes = candles.map((c) => c.close);

  const ema9 = EMA.calculate({ period: 9, values: closes });
  const ema21 = EMA.calculate({ period: 21, values: closes });

  const macdResult = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  const lastMacd = macdResult[macdResult.length - 1];

  return {
    ema9: ema9[ema9.length - 1] ?? 0,
    ema21: ema21[ema21.length - 1] ?? 0,
    macd: lastMacd?.MACD ?? 0,
    macdSignal: lastMacd?.signal ?? 0,
    macdHistogram: lastMacd?.histogram ?? 0,
    lastClose: closes[closes.length - 1],
  };
}
