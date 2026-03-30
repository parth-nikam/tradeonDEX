// PM2 config — run: pm2 start ecosystem.config.cjs
// Modes:
//   Standard (5 min cron):   pm2 start ecosystem.config.cjs
//   High-frequency (1 min):  pm2 start ecosystem.config.cjs --only dex-trader-hf,dex-trader-api
module.exports = {
  apps: [
    // ── Standard loop: PM2 cron every 5 minutes ──────────────────────────────
    {
      name: "dex-trader-loop",
      script: "src/agent/loop.ts",
      interpreter: "/home/ubuntu/.bun/bin/bun",
      interpreter_args: "run",
      cron_restart: "*/5 * * * *",
      autorestart: false,
      exec_mode: "fork",
      env: { NODE_ENV: "production", LOOP_INTERVAL_MS: "0" },
    },

    // ── High-frequency loop: built-in interval (1 min) ────────────────────────
    // Uses LOOP_INTERVAL_MS so no PM2 cron overhead — tighter execution timing.
    // Switch CANDLE_RESOLUTION to 1m in .env for best results.
    {
      name: "dex-trader-hf",
      script: "src/agent/loop.ts",
      interpreter: "/home/ubuntu/.bun/bin/bun",
      interpreter_args: "run",
      autorestart: true,
      exec_mode: "fork",
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: "production",
        LOOP_INTERVAL_MS: "60000",
        CANDLE_RESOLUTION: "1m",
        CANDLE_COUNT: "100",
      },
    },

    // ── API server ────────────────────────────────────────────────────────────
    {
      name: "dex-trader-api",
      script: "src/api/server.ts",
      interpreter: "/home/ubuntu/.bun/bin/bun",
      interpreter_args: "run",
      watch: false,
      autorestart: true,
      exec_mode: "fork",
      max_restarts: 20,
      env: { NODE_ENV: "production", API_PORT: "3001" },
    },
  ],
};
