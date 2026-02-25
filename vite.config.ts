import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const defaultBase = process.env.GITHUB_ACTIONS && repoName ? `/${repoName}/` : "/";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? defaultBase,
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/component/**/*.test.ts"],
  },
});
