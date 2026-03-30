import { tool, jsonSchema } from "ai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { placeOrder, closeAllPositions, getOpenPositions, getBestPrices, type Symbol } from "../lib/lighter.ts";
import { prisma } from "../lib/db.ts";
import { logger } from "../lib/logger.ts";
import { config } from "../lib/config.ts";

// Bedrock Converse API requires "type":"object" at root of every tool schema.
// The ai@6 SDK doesn't inject this automatically, so we wrap with jsonSchema().
function bedrockTool<T extends z.ZodObject<any>>(opts: {
  description: string;
  parameters: T;
  execute: (args: z.infer<T>) => Promise<any>;
}) {
  const schema = zodToJsonSchema(opts.parameters, { target: "openApi3" }) as any;
  // Ensure type:object is present (Bedrock requirement)
  if (!schema.type) schema.type = "object";
  return tool({
    description: opts.description,
    parameters: jsonSchema<z.infer<T>>(schema),
    execute: opts.execute,
  });
}

export function buildTools(invocationId: number, modelId: number) {
  return {
    createPosition: bedrockTool({
      description: `Open a new perpetual futures position on the Lighter DEX.
IMPORTANT: Call closeAllPositions first if any position is already open.
Budget limit: ${config.TRADING_BUDGET_USD}. Max leverage: ${config.MAX_LEVERAGE}x.`,
      parameters: z.object({
        symbol: z.enum(["BTC", "ETH", "SOL"]).describe("Trading pair"),
        side: z.enum(["long", "short"]).describe("Direction"),
        quantity: z.number().positive().describe("Size in base asset units"),
        leverage: z.number().min(1).max(config.MAX_LEVERAGE).describe("Leverage multiplier (1-5)"),
        reasoning: z.string().describe("Brief explanation of why this trade is being opened"),
      }),
      execute: async ({ symbol, side, quantity, leverage, reasoning }) => {
        // Guard: enforce single position rule
        const existing = await getOpenPositions();
        if (existing.length > 0) {
          const msg = "Position already open. Call closeAllPositions first.";
          logger.warn(msg, { existing: existing.length });
          await logToolCall(invocationId, "createPosition", { symbol, side, quantity, leverage, reasoning }, { error: msg });
          return { error: msg };
        }

        // Guard: validate notional value against budget
        const { bid, ask } = await getBestPrices(symbol as Symbol);
        const entryPrice = (bid + ask) / 2;
        const notional = quantity * entryPrice;
        if (notional > config.TRADING_BUDGET_USD) {
          const msg = `Notional value $${notional.toFixed(2)} exceeds budget $${config.TRADING_BUDGET_USD}`;
          logger.warn(msg);
          await logToolCall(invocationId, "createPosition", { symbol, side, quantity, leverage, reasoning }, { error: msg });
          return { error: msg };
        }

        logger.info("Opening position", { symbol, side, quantity, leverage, reasoning, entryPrice });
        const result = await placeOrder({ symbol: symbol as Symbol, side, quantity, leverage });

        // Record trade
        try {
          await (prisma as any).tradeRecord.create({
            data: { modelId, symbol, side, quantity, leverage, entryPrice, reasoning, status: "open" },
          });
        } catch (err: any) {
          logger.warn("Could not save trade record", { error: err?.message });
        }

        await logToolCall(invocationId, "createPosition", { symbol, side, quantity, leverage, reasoning }, result);
        return result;
      },
    }),

    closeAllPositions: bedrockTool({
      description: "Close every open position immediately using market-equivalent limit orders.",
      parameters: z.object({
        reasoning: z.string().describe("Why positions are being closed"),
      }),
      execute: async ({ reasoning }) => {
        logger.info("Closing all positions", { reasoning });

        // Capture exit prices before closing
        const openPositions = await getOpenPositions();
        await closeAllPositions();

        // Update open trade records with exit info
        for (const pos of openPositions) {
          try {
            const { bid, ask } = await getBestPrices(pos.symbol ?? pos.marketIndex);
            const exitPrice = (bid + ask) / 2;
            const openTrade = await (prisma as any).tradeRecord.findFirst({
              where: { modelId, status: "open" },
              orderBy: { openedAt: "desc" },
            });
            if (openTrade) {
              const pnl = openTrade.side === "long"
                ? (exitPrice - openTrade.entryPrice) * openTrade.quantity * openTrade.leverage
                : (openTrade.entryPrice - exitPrice) * openTrade.quantity * openTrade.leverage;
              await (prisma as any).tradeRecord.update({
                where: { id: openTrade.id },
                data: { exitPrice, pnl, status: "closed", closedAt: new Date() },
              });
            }
          } catch (err: any) {
            logger.warn("Could not update trade record on close", { error: err?.message });
          }
        }

        const result = { success: true, message: "All positions closed.", reasoning };
        await logToolCall(invocationId, "closeAllPositions", { reasoning }, result);
        return result;
      },
    }),

    getPortfolioStatus: bedrockTool({
      description: "Get current portfolio status including open positions and balances.",
      parameters: z.object({
        reason: z.string().optional().describe("Why you are checking portfolio status"),
      }),
      execute: async () => {
        const positions = await getOpenPositions();
        const result = {
          openPositions: positions,
          positionCount: positions.length,
          timestamp: new Date().toISOString(),
        };
        await logToolCall(invocationId, "getPortfolioStatus", {}, result);
        return result;
      },
    }),
  };
}

async function logToolCall(
  invocationId: number,
  toolName: string,
  parameters: object,
  result: object
) {
  await prisma.toolCall.create({
    data: { invocationId, toolName, parameters, result },
  });
}
