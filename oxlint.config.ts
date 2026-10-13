import { defineConfig } from "oxlint";

const packageToAppRestrictions = [
	{
		regex: "(^|/)apps(/|$)",
		message: "Packages must not depend on application workspaces.",
	},
	{
		regex: "^@repo/web(/|$)",
		message: "Packages must not depend on the web application.",
	},
	{
		regex: "^#web(/|$)",
		message: "Packages must not depend on the web application.",
	},
];

export default defineConfig({
	options: {
		typeAware: true,
		typeCheck: true,
	},
	overrides: [
		{
			files: ["packages/**"],
			rules: {
				"no-restricted-imports": ["error", { patterns: packageToAppRestrictions }],
			},
		},
	],
	rules: {
		"typescript/no-deprecated": "warn",
	},
});
