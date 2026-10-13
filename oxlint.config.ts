import { defineConfig } from "oxlint";

export default defineConfig({
	options: {
		typeAware: true,
		typeCheck: true,
	},
	rules: {
		"typescript/no-deprecated": "warn",
	},
});
