/**
 * Centralised, validated config.
 * Throws at startup if required env vars are missing.
 */
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  LIGHTER_API_URL: z.string().url().default("https://mainnet.zklighter.elliot.ai"),
  LIGHTER_WALLET_ADDRESS: z.string().optional(),
  LIGHTER_PRIVATE_KEY: z.string().optional(),
  API_PORT: z.coerce.number().default(3001),
  LOOP_INTERVAL_MS: z.coerce.number().default(0),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Trading params
  TRADING_BUDGET_USD: z.coerce.number().default(50),
  MAX_LEVERAGE: z.coerce.number().default(5),
  CANDLE_RESOLUTION: z.enum(["1m", "5m", "15m", "1h"]).default("5m"),
  CANDLE_COUNT: z.coerce.number().default(50),
});

export type Config = z.infer<typeof schema>;

function loadConfig(): Config {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    console.error("[config] Invalid environment:", result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
