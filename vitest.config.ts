import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./tests/soporte/setup.ts"],
      include: ["tests/unit/**/*.test.{ts,tsx}"],
      css: false,
    },
  }),
);
