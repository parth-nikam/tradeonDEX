/**
 * Seed initial model configs.
 * Run: bun run src/seed.ts
 */
import { prisma } from "./lib/db.ts";

await prisma.modelConfig.createMany({
  data: [
    {
      name: "Claude 3.5 Sonnet",
      apiModelName: "anthropic/claude-3.5-sonnet",
      accountIndex: 0,
      isActive: true,
    },
    {
      name: "DeepSeek R1",
      apiModelName: "deepseek/deepseek-r1",
      accountIndex: 0,
      isActive: false,
    },
    {
      name: "Qwen 2.5 72B",
      apiModelName: "qwen/qwen-2.5-72b-instruct",
      accountIndex: 0,
      isActive: false,
    },
  ],
  skipDuplicates: true,
});

console.log("Seeded model configs.");
await prisma.$disconnect();
