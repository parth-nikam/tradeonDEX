# ⚡ DEX AI Trader

An autonomous AI agent that trades cryptocurrency perpetual futures on the [Lighter DEX](https://lighter.xyz). Multiple LLMs (Claude, DeepSeek, Qwen) analyze live market data and technical indicators every 5 minutes, then execute trades via the Lighter SDK.

```
Market Data → Technical Indicators → LLM Decision → Order Execution → DB Log → Dashboard
```

---

## Stack

| Layer | Tech |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript |
| LLM | Vercel AI SDK → OpenRouter (Claude 3.5 Sonnet, DeepSeek R1, Qwen) |
| Exchange | [Lighter DEX](https://lighter.xyz) via `lighter-js-sdk` |
| Database | PostgreSQL ([NeonDB](https://neon.tech)) + Prisma ORM |
| Dashboard | React + Recharts (Vite) |
| Process | PM2 cron (every 5 min) |

---

## Project Structure

```
tradeonDEX/
├── src/
│   ├── agent/
│   │   ├── loop.ts        # Main execution loop
│   │   ├── invoke.ts      # LLM invocation + cost tracking
│   │   ├── prompt.ts      # System & user prompt builder
│   │   └── tools.ts       # LLM-callable tools (createPosition, closeAllPositions)
│   ├── lib/
│   │   ├── lighter.ts     # Lighter DEX SDK wrapper
│   │   ├── indicators.ts  # EMA, MACD, RSI, Bollinger Bands
│   │   ├── config.ts      # Validated env config (Zod)
│   │   ├── logger.ts      # Structured logger
│   │   └── db.ts          # Prisma client singleton
│   ├── api/
│   │   └── server.ts      # Bun HTTP server for dashboard
│   ├── dashboard/         # React + Recharts frontend
│   └── seed.ts            # Seed model configs
├── prisma/
│   └── schema.prisma      # DB schema
├── ecosystem.config.cjs   # PM2 config
└── .env.example
```

---

## Quick Start

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Clone & install deps

```bash
git clone https://github.com/YOUR_USERNAME/tradeonDEX.git
cd tradeonDEX
bun install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (NeonDB recommended) |
| `OPENROUTER_API_KEY` | Get from [openrouter.ai/keys](https://openrouter.ai/keys) |
| `LIGHTER_WALLET_ADDRESS` | Your Ethereum wallet address |
| `LIGHTER_PRIVATE_KEY` | Private key for signing orders |
| `TRADING_BUDGET_USD` | Max capital to risk (default: `50`) |
| `MAX_LEVERAGE` | Max leverage multiplier (default: `5`) |

### 4. Set up the database

```bash
bun run db:push    # push schema to PostgreSQL
bun run seed       # seed Claude / DeepSeek / Qwen model configs
```

### 5. Run

```bash
# Agent loop (single run)
bun run agent

# Dashboard API server
bun run api

# React dashboard (http://localhost:5173)
bun run dashboard
```

### 6. Production (PM2)

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 logs
```

---

## How It Works

### Execution Loop (`src/agent/loop.ts`)

Every 5 minutes:
1. Fetch 50 candles (5m) for BTC, ETH, SOL from Lighter
2. Calculate EMA9/21/50, MACD, RSI14, Bollinger Bands
3. Fetch wallet balance and open positions
4. Snapshot portfolio to DB
5. For each active model: invoke LLM with full market context
6. LLM calls tools (`createPosition` / `closeAllPositions`) if warranted
7. Log invocation, tool calls, and cost to DB

### Technical Indicators (`src/lib/indicators.ts`)

| Indicator | Use |
|---|---|
| EMA 9/21/50 | Trend direction, crossover signals |
| MACD (12/26/9) | Momentum, histogram divergence |
| RSI 14 | Overbought/oversold detection |
| Bollinger Bands (20, 2σ) | Volatility, mean reversion |

### LLM Signal Framework

The system prompt instructs the LLM to only trade when **3+ indicators confirm**:

- **Long**: EMA9 > EMA21, MACD histogram positive, RSI 40–60, price above BB mid
- **Short**: EMA9 < EMA21, MACD histogram negative, RSI 40–60, price below BB mid
- **Avoid**: RSI > 75 (overbought longs), RSI < 25 (oversold shorts), conflicting signals

### Order Execution

Orders use an **"obnoxious price"** strategy to act as market orders:
- Long: limit price = mid × 1.05 (fills immediately against asks)
- Short: limit price = mid × 0.95 (fills immediately against bids)

---

## Dashboard

The React dashboard (port 5173) shows:

- **Overview**: Portfolio value chart, tool usage breakdown
- **Trades**: Full invocation history with LLM reasoning and tool calls
- **Models**: Per-model stats (invocation count, total cost)

Set `VITE_API_URL` in `src/dashboard/.env` if your API runs on a different host.

---

## Database Schema

```
ModelConfig        — LLM model registry (name, API model string, active flag)
ModelInvocation    — Every LLM call (prompt, response, cost, timestamp)
ToolCall           — Every tool execution (name, params, result)
PortfolioSnapshot  — Portfolio state at each loop run
TradeRecord        — Individual trade lifecycle (entry, exit, P&L)
```

---

## Supported Models (via OpenRouter)

| Model | API Name |
|---|---|
| Claude 3.5 Sonnet | `anthropic/claude-3.5-sonnet` |
| DeepSeek R1 | `deepseek/deepseek-r1` |
| Qwen 2.5 72B | `qwen/qwen-2.5-72b-instruct` |
| GPT-4o | `openai/gpt-4o` |
| GPT-4o Mini | `openai/gpt-4o-mini` |

Enable/disable models by toggling `isActive` in the `ModelConfig` table.

---

## Safety

- Single position limit enforced in code (not just the prompt)
- Budget cap via `TRADING_BUDGET_USD` env var
- Max leverage cap via `MAX_LEVERAGE` env var
- All orders logged before and after execution
- Graceful degradation when API keys are missing

> **Disclaimer**: This is experimental software. Crypto trading carries significant risk. Never trade with funds you can't afford to lose.

---

## License

MIT
