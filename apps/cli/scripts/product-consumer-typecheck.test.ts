import { mkdir, mkdtempDisposable, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it } from "vitest";

import { prepareProductWorkspace, runPnpm } from "./testing/product-workspace.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("packed CMS consumer typecheck", () => {
	it("installs the product tarball and typechecks regenerated Waku and Worker sources", async () => {
		await using temporaryDirectory = await mkdtempDisposable(
			join(tmpdir(), "cms-product-consumer-"),
		);
		const workspaceDirectory = join(temporaryDirectory.path, "workspace");
		const productDirectory = join(temporaryDirectory.path, "product");
		const consumerDirectory = join(temporaryDirectory.path, "consumer");
		await prepareProductWorkspace(repositoryRoot, workspaceDirectory);
		await mkdir(productDirectory);
		await mkdir(consumerDirectory);

		runPnpm(["pack:product", "--pack-destination", productDirectory], workspaceDirectory);
		const productArchive = (await readdir(productDirectory)).find((name) => name.endsWith(".tgz"));
		if (productArchive === undefined) throw new Error("Product pack did not create a tarball.");

		await writeConsumerFiles(consumerDirectory, `file:../product/${productArchive}`);
		runPnpm(["install"], consumerDirectory);
		runPnpm(["exec", "cms", "init"], consumerDirectory);

		for (let generation = 0; generation < 2; generation += 1) {
			runPnpm(["exec", "cms", "typegen"], consumerDirectory);
			await writeWorkerBindingTypecheck(consumerDirectory);
			runPnpm(["exec", "tsc", "--noEmit", "-p", ".cms/tsconfig.json"], consumerDirectory);
		}
	}, 600_000);
});

async function writeConsumerFiles(directory: string, productArchive: string): Promise<void> {
	await writeFile(
		join(directory, "package.json"),
		`${JSON.stringify(
			{
				name: "cms-product-typecheck-consumer",
				private: true,
				type: "module",
				dependencies: { "@repo/cli": productArchive },
				devDependencies: { typescript: "7.0.2" },
			},
			null,
			2,
		)}\n`,
	);
	await writeFile(
		join(directory, "pnpm-workspace.yaml"),
		"allowBuilds:\n  esbuild: true\n  workerd: true\n",
	);
	await writeFile(
		join(directory, "cms.config.ts"),
		'import { defineConfig } from "@repo/cli/config";\n\nexport default defineConfig({\n\tcloudflare: { configPath: "./wrangler.jsonc" },\n});\n',
	);
	await writeFile(
		join(directory, "wrangler.jsonc"),
		`${JSON.stringify(
			{
				name: "cms-product-typecheck-consumer",
				compatibility_date: "2025-01-01",
				compatibility_flags: ["nodejs_compat"],
				d1_databases: [
					{
						binding: "DB",
						database_name: "cms-product-typecheck-consumer",
						database_id: "00000000-0000-0000-0000-000000000001",
					},
				],
				r2_buckets: [{ binding: "ASSETS", bucket_name: "cms-product-typecheck-consumer" }],
			},
			null,
			2,
		)}\n`,
	);
}

async function writeWorkerBindingTypecheck(directory: string): Promise<void> {
	await writeFile(
		join(directory, ".cms", "src", "consumer-worker-bindings.ts"),
		'function verifyWorkerBindings(env: Env): void {\n\tvoid env.DB.prepare("SELECT 1");\n\tvoid env.ASSETS.get("test.txt");\n}\n',
	);
}
