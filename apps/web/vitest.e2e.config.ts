import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["e2e/data-import.spec.ts"],
		testTimeout: 300_000,
		hookTimeout: 30_000,
		reporters: ["verbose"],
		silent: false,
	},
});
