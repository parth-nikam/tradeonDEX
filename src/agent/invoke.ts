import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { prisma } from "../lib/db.ts";
import { buildTools } from "./tools.ts";
import { SYSTEM_PROMPT, buildUserPrompt, type MarketContext, type PortfolioContext } from "./prompt.ts";
import { logger } from "../lib/logger.ts";
import type { ModelConfig } from "@prisma/client";

if (!process.env.OPENROUTER_API_KEY) {
  logger.warn("OPENROUTER_API_KEY is not set — LLM calls will fail");
}

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

// Cost per million tokens (input / output) in USD
const MODEL_COSTS: Record<string, [number, number]> = {
  "anthropic/claude-3.5-sonnet":   [3,    15],
  "anthropic/claude-3-haiku":      [0.25,  1.25],
  "deepseek/deepseek-r1":          [0.55,  2.19],
  "qwen/qwen-2.5-72b-instruct":    [0.35,  0.40],
  "openai/gpt-4o":                 [5,    15],
  "openai/gpt-4o-mini":            [0.15,  0.60],
};

function estimateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  const [inputRate, outputRate] = MODEL_COSTS[modelName] ?? [3, 15];
  return (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 2000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === retries) throw err;
      logger.warn(`Retrying after error (attempt ${attempt + 1}/${retries})`, { error: err?.message });
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw new Error("unreachable");
}

export async function invokeModel(
  config: ModelConfig,
  portfolio: PortfolioContext,
  markets: MarketContext[]
): Promise<{ text: string; invocationId: number; cost: number }> {
  const userPrompt = buildUserPrompt(portfolio, markets);

  const invocation = await prisma.modelInvocation.create({
    data: { modelId: config.id, prompt: userPrompt, response: "", totalCost: 0 },
  });

  const tools = buildTools(invocation.id, config.id);

  const { text, usage } = await withRetry(() =>
    generateText({
      model: openrouter(config.apiModelName),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      tools,
      maxSteps: 5,
    })
  );

  const cost = estimateCost(
    config.apiModelName,
    usage?.promptTokens ?? 0,
    usage?.completionTokens ?? 0
  );

  await prisma.modelInvocation.update({
    where: { id: invocation.id },
    data: { response: text, totalCost: cost },
  });

  logger.info("Model invocation complete", {
    model: config.name,
    tokens: usage?.totalTokens,
    cost: `$${cost.toFixed(6)}`,
    invocationId: invocation.id,
  });

  return { text, invocationId: invocation.id, cost };
}
