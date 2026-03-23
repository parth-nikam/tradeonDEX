import { tool } from "ai";
import { z } from "zod";
import { placeOrder, closeAllPositions, type Symbol } from "../lib/lighter.ts";
import { prisma } from "../lib/db.ts";

/**
 * LLM-callable tools. Each tool logs its call + result to the DB.
 */
export function buildTools(invocationId: number) {
  return {
    createPosition: tool({
      description:
        "Open a new perpetual futures position on the Lighter DEX. Always call closeAllPositions first if you have an existing position.",
      parameters: z.object({
        symbol: z.enum(["BTC", "ETH", "SOL"]).describe("Trading pair"),
        side: z.enum(["long", "short"]).describe("Direction"),
        quantity: z.number().positive().describe("Size in base asset units"),
        leverage: z.number().min(1).max(20).describe("Leverage multiplier"),
      }),
      execute: async ({ symbol, side, quantity, leverage }) => {
        const result = await placeOrder({
          symbol: symbol as Symbol,
          side,
          quantity,
          leverage,
        });
        await logToolCall(invocationId, "createPosition", { symbol, side, quantity, leverage }, result);
        return result;
      },
    }),

    closeAllPositions: tool({
      description: "Close every open position immediately using market-equivalent limit orders.",
      parameters: z.object({}),
      execute: async () => {
        await closeAllPositions();
        const result = { success: true, message: "All positions closed." };
        await logToolCall(invocationId, "closeAllPositions", {}, result);
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
