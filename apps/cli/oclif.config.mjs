// @ts-check

/** @satisfies {import('@oclif/core').Interfaces.OclifConfiguration} */
export default {
	bin: "cms",
	commands: {
		strategy: "pattern",
		target: "./dist/commands",
	},
	topicSeparator: " ",
};
