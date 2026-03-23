// PM2 config — run: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "dex-trader-loop",
      script: "src/agent/loop.ts",
      interpreter: "bun",
      cron_restart: "*/5 * * * *", // every 5 minutes
      autorestart: false,
      env: { NODE_ENV: "production" },
    },
    {
      name: "dex-trader-api",
      script: "src/api/server.ts",
      interpreter: "bun",
      watch: false,
      env: { NODE_ENV: "production", API_PORT: "3001" },
    },
  ],
};
