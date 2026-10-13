import { exec } from "node:child_process";
import { promisify, styleText } from "node:util";

const execAsync = promisify(exec);

function box(message: string) {
	const strWidthLen = (str: string) => {
		const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
		return Array.from(segmenter.segment(str), (m) => m.segment).reduce((count, char) => {
			const len = Math.min(Buffer.byteLength(char, "utf8"), 2);
			return count + len;
		}, 0);
	};
	const lines = message.split("\n");
	const width = Math.max(...lines.map((l) => strWidthLen(l)));
	return [
		"=".repeat(width + 4),
		"",
		...lines.map((l) => {
			const pad = width - strWidthLen(l);
			return `  ${l}${" ".repeat(Math.max(pad, 0))}  `;
		}),
		"",
		"=".repeat(width + 4),
	].join("\n");
}

try {
	const { stdout, stderr } = await execAsync("git rev-parse --abbrev-ref HEAD");
	if (stderr) {
		throw new Error(stderr);
	}
	const branch = stdout.trim();
	if (branch === "main") {
		console.error(
			styleText(
				"redBright",
				box("mainブランチへの直コミットは禁止しています。\n別のブランチからPRを作成してください。"),
			),
		);
		process.exit(1);
	}
} catch (error) {
	console.error(error);
	process.exit(1);
}
