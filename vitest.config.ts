import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["shared/**/*.spec.ts", "actions/**/*.spec.ts", "server/**/*.spec.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.output/**",
      "**/.deploy-tmp/**",
    ],
  },
});
