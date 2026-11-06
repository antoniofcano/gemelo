// Vitest solo para lógica pura en Node (MUNDOS §9.2): sin DOM. Lo que necesite DOM o GPU va al banco.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
