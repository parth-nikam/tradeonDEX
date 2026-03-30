/**
 * LLM invocation via AWS Bedrock (Claude).
 * No external API key needed — uses EC2 IAM role with bedrock:InvokeModel.
 */
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { generateText } from "ai";
import { prisma } from "../lib/db.ts";
import { buildTools } from "./tools.ts";
import { SYSTEM_PROMPT, buildUserPrompt, type MarketContext, type PortfolioContext } from "./prompt.ts";
import { logger } from "../lib/logger.ts";
import type { ModelConfig } from "@prisma/client";

// Bedrock client — uses IAM role credentials automatically on EC2
const bedrock = createAmazonBedrock({
  region: process.env.AWS_REGION ?? "ap-south-1",
});

// Cost per million tokens (input / output) in USD — Bedrock on-demand pricing
const MODEL_COSTS: Record<string, [number, number]> = {
  "anthropic.claude-3-5-sonnet-20241022-v2:0": [3.0,  15.0],
  "anthropic.claude-3-7-sonnet-20250219-v1:0": [3.0,  15.0],
  "anthropic.claude-3-haiku-20240307-v1:0":    [0.25,  1.25],
  "anthropic.claude-sonnet-4-20250514-v1:0":   [3.0,  15.0],
};

function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const [inputRate, outputRate] = MODEL_COSTS[modelId] ?? [3.0, 15.0];
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
      model: bedrock(config.apiModelName),
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
