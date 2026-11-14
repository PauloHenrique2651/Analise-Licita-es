import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    pool: "threads",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
