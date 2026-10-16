import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { build, createServer, runnerImport, type InlineConfig } from "vite";

import {
	prepareProductWorkspace,
	runPnpm,
} from "../../../cli/scripts/testing/product-workspace.ts";

export interface ProductConsumerAssets {
	developmentCss: string;
	productionCss: string;
	browserEntry: string;
}

export async function prepareProductConsumer(
	temporaryRoot: string,
	repositoryRoot: string,
): Promise<ProductConsumerAssets> {
	const workspaceDirectory = path.join(temporaryRoot, "workspace");
	const productDirectory = path.join(temporaryRoot, "product");
	const consumerDirectory = path.join(temporaryRoot, "consumer");
	await prepareProductWorkspace(repositoryRoot, workspaceDirectory);
	await mkdir(productDirectory, { recursive: true });
	await mkdir(consumerDirectory, { recursive: true });

	runPnpm(["pack:product", "--pack-destination", productDirectory], workspaceDirectory);
	const productArchive = (await readdir(productDirectory)).find((name) => name.endsWith(".tgz"));
	if (productArchive === undefined) throw new Error("Product pack did not create a tarball.");

	await writeConsumerFiles(consumerDirectory, `file:../product/${productArchive}`);
	runPnpm(["install"], consumerDirectory);
	runPnpm(["exec", "cms", "init"], consumerDirectory);
	runPnpm(["exec", "cms", "init"], consumerDirectory);

	const cmsDirectory = path.join(consumerDirectory, ".cms");
	const buildEntry = path.join(cmsDirectory, ".product-consumer-css-entry.js");
	const browserEntry = path.join(consumerDirectory, ".product-consumer-browser-fixture.tsx");
	await writeFile(buildEntry, 'import "./src/styles.css";\n');
	await writeFile(
		browserEntry,
		'export { Button } from "@cloudflare/kumo";\nexport { MarkdownEditor } from "@repo/editor";\n',
	);

	const previousDirectory = process.cwd();
	process.chdir(cmsDirectory);
	try {
		const { module } = await runnerImport<{ default: { vite?: InlineConfig } }>(
			path.join(cmsDirectory, "waku.config.ts"),
			{ configFile: false, root: cmsDirectory },
		);
		const viteConfig = module.default.vite ?? {};
		const developmentServer = await createServer({
			...viteConfig,
			configFile: false,
			root: cmsDirectory,
			optimizeDeps: { ...viteConfig.optimizeDeps, noDiscovery: true, include: [] },
			logLevel: "silent",
			server: { ...viteConfig.server, middlewareMode: true },
		});
		let developmentCss: string;
		try {
			const transformed = await developmentServer.transformRequest("/src/styles.css?direct");
			if (transformed === null) {
				throw new Error("Vite did not transform the generated CMS stylesheet.");
			}
			developmentCss = transformed.code;
		} finally {
			await developmentServer.close();
		}

		const productionDirectory = path.join(temporaryRoot, "production");
		await build({
			...viteConfig,
			configFile: false,
			root: cmsDirectory,
			logLevel: "silent",
			build: {
				...viteConfig.build,
				outDir: productionDirectory,
				emptyOutDir: true,
				write: true,
				cssCodeSplit: false,
				minify: false,
				rolldownOptions: {
					...viteConfig.build?.rolldownOptions,
					input: buildEntry,
				},
			},
		});
		const productionCssPath = await findCssFile(productionDirectory);
		if (productionCssPath === undefined) {
			throw new Error("Vite did not emit CSS for the generated CMS stylesheet.");
		}
		const productionCss = await readFile(productionCssPath, "utf8");
		return {
			developmentCss,
			productionCss,
			browserEntry: toViteFileUrl(browserEntry),
		};
	} finally {
		process.chdir(previousDirectory);
		await rm(buildEntry, { force: true });
	}
}

async function writeConsumerFiles(directory: string, productArchive: string): Promise<void> {
	await writeFile(
		path.join(directory, "package.json"),
		`${JSON.stringify(
			{
				name: "cms-product-browser-consumer",
				private: true,
				type: "module",
				dependencies: { "@kyudaisai/cms": productArchive },
				devDependencies: { typescript: "7.0.2" },
			},
			null,
			2,
		)}\n`,
	);
	await writeFile(
		path.join(directory, "pnpm-workspace.yaml"),
		"allowBuilds:\n  esbuild: true\n  workerd: true\n",
	);
	await writeFile(
		path.join(directory, "cms.config.ts"),
		'import { defineConfig } from "@kyudaisai/cms/config";\n\nexport default defineConfig({\n\tcloudflare: { configPath: "./wrangler.jsonc" },\n});\n',
	);
	await writeFile(
		path.join(directory, "wrangler.jsonc"),
		`${JSON.stringify(
			{
				name: "cms-product-browser-consumer",
				compatibility_date: "2026-09-25",
				compatibility_flags: ["nodejs_als"],
				d1_databases: [
					{
						binding: "DB",
						database_name: "cms-product-browser-consumer",
						database_id: "00000000-0000-0000-0000-000000000001",
					},
				],
				r2_buckets: [
					{
						binding: "ASSETS",
						bucket_name: "cms-product-browser-consumer",
					},
				],
			},
			null,
			2,
		)}\n`,
	);
}

function toViteFileUrl(filePath: string): string {
	return `/@fs/${filePath.replaceAll("\\", "/")}`;
}

async function findCssFile(directory: string): Promise<string | undefined> {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			const nestedCss = await findCssFile(entryPath);
			if (nestedCss !== undefined) return nestedCss;
		} else if (entry.isFile() && entry.name.endsWith(".css")) {
			return entryPath;
		}
	}
	return undefined;
}
