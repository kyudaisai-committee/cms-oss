import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const sourceDirectory = fileURLToPath(new URL("./src/", import.meta.url));

export default defineConfig({
	resolve: {
		alias: [{ find: /^#cli\//, replacement: sourceDirectory }],
	},
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
