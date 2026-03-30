/**
 * Seed initial model configs — AWS Bedrock models.
 * Run: bun run src/seed.ts
 */
import { prisma } from "./lib/db.ts";

await prisma.modelConfig.createMany({
  data: [
    {
      name: "Claude 3.5 Sonnet v2",
      apiModelName: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      accountIndex: 0,
      isActive: true,
    },
    {
      name: "Claude 3.7 Sonnet",
      apiModelName: "anthropic.claude-3-7-sonnet-20250219-v1:0",
      accountIndex: 0,
      isActive: false,
    },
    {
      name: "Claude 3 Haiku",
      apiModelName: "anthropic.claude-3-haiku-20240307-v1:0",
      accountIndex: 0,
      isActive: false,
    },
  ],
  skipDuplicates: true,
});

console.log("Seeded Bedrock model configs.");
await prisma.$disconnect();
