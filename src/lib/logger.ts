/**
 * Structured logger — outputs JSON in production, pretty in dev.
 */
import { config } from "./config.ts";

type Level = "info" | "warn" | "error" | "debug";

function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
  };
  if (config.NODE_ENV === "production") {
    console[level === "debug" ? "log" : level](JSON.stringify(entry));
  } else {
    const color = { info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m", debug: "\x1b[90m" }[level];
    const reset = "\x1b[0m";
    const metaStr = meta ? " " + JSON.stringify(meta) : "";
    console[level === "debug" ? "log" : level](`${color}[${level.toUpperCase()}]${reset} ${entry.ts} ${msg}${metaStr}`);
  }
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
};
