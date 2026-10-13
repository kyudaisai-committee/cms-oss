import { defineConfig } from "oxfmt";

export default defineConfig({
	sortTailwindcss: true,
	sortPackageJson: true,
	sortImports: {
		groups: [
			"server-only",
			"builtin",
			"external",
			["internal", "subpath"],
			["parent", "sibling", "index"],
			["style", "side_effect_style", "side_effect"],
			"unknown",
		],
		customGroups: [
			{
				groupName: "server-only",
				elementNamePattern: ["server-only"],
			},
		],
		internalPattern: ["#web/", "#core/", "#editor/", "@repo/"],
		newlinesBetween: true,
	},
	ignorePatterns: ["worker-configuration.d.ts", "package-lock.yaml", "**/pages.gen.ts"],
});
