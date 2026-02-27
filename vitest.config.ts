import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["test/setup/unit.ts"],
    restoreMocks: true,
    mockReset: true,
    clearMocks: true,
    unstubEnvs: true,
    fileParallelism: false,
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true
      }
    },
    coverage: {
      provider: "v8",
      all: true,
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/types.ts",
        "src/scripts/**",
        "src/**/*.test.ts",
        "src/**/__tests__/**"
      ],
      thresholds: {
        perFile: true,
        functions: 100,
        lines: 90,
        statements: 90,
        branches: 85
      }
    }
  }
});
