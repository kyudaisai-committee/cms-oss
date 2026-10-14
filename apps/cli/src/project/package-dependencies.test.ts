import { mkdir, mkdtempDisposable, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { linkProductDependencies } from "./package-dependencies.js";

describe("linkProductDependencies", () => {
	it("links installed scoped dependencies from the product package", async () => {
		await using temporaryDirectory = await mkdtempDisposable(
			join(tmpdir(), "cms-cli-product-dependencies-"),
		);
		const directory = temporaryDirectory.path;
		const packageRoot = join(directory, "product");
		const dependencyRoot = join(packageRoot, "node_modules", "@scope", "runtime");
		const generatedDirectory = join(directory, ".cms");

		await mkdir(dependencyRoot, { recursive: true });
		await mkdir(join(packageRoot, "node_modules", ".bin"), { recursive: true });
		await writeFile(
			join(packageRoot, "package.json"),
			JSON.stringify({ dependencies: { "@scope/runtime": "1.0.0" } }),
		);
		await writeFile(
			join(dependencyRoot, "package.json"),
			JSON.stringify({ name: "@scope/runtime" }),
		);

		await linkProductDependencies(generatedDirectory, packageRoot);

		expect(await realpath(join(generatedDirectory, "node_modules", "@scope", "runtime"))).toBe(
			await realpath(dependencyRoot),
		);
		expect(
			await readFile(
				join(generatedDirectory, "node_modules", "@repo", "cli", "package.json"),
				"utf8",
			),
		).toBe(await readFile(join(packageRoot, "package.json"), "utf8"));
	});
});
