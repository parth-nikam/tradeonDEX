import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { prisma } from "../lib/db.ts";
import { buildTools } from "./tools.ts";
import { SYSTEM_PROMPT, buildUserPrompt, type MarketContext, type PortfolioContext } from "./prompt.ts";
import type { ModelConfig } from "@prisma/client";

// OpenRouter uses the OpenAI-compatible API
const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export async function invokeModel(
  config: ModelConfig,
  portfolio: PortfolioContext,
  markets: MarketContext[]
) {
  const userPrompt = buildUserPrompt(portfolio, markets);

  // Create invocation record first so tools can reference it
  const invocation = await prisma.modelInvocation.create({
    data: {
      modelId: config.id,
      prompt: userPrompt,
      response: "",
      totalCost: 0,
    },
  });

  const tools = buildTools(invocation.id);

  const { text, usage } = await generateText({
    model: openrouter(config.apiModelName),
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    tools,
    maxSteps: 5, // allow multi-step tool use
  });

  // Estimate cost (rough: $3/M input, $15/M output for Claude 3.5 Sonnet)
  const estimatedCost =
    ((usage?.promptTokens ?? 0) * 3 + (usage?.completionTokens ?? 0) * 15) /
    1_000_000;

  await prisma.modelInvocation.update({
    where: { id: invocation.id },
    data: { response: text, totalCost: estimatedCost },
  });

  return { text, invocationId: invocation.id };
}
