import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, mkdtempDisposable, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("packed CMS consumer", () => {
	it("uses the public package for configuration, schema, generated app, and local migrations", async () => {
		await using temporaryDirectory = await mkdtempDisposable(
			join(tmpdir(), "cms-product-consumer-"),
		);
		const productDirectory = join(temporaryDirectory.path, "product");
		const consumerDirectory = join(temporaryDirectory.path, "consumer");
		await mkdir(productDirectory);
		await mkdir(consumerDirectory);

		runPnpm(["pack:product", "--pack-destination", productDirectory], repositoryRoot);
		const archives = (await readdir(productDirectory)).filter((name) => name.endsWith(".tgz"));
		expect(archives).toHaveLength(1);
		const productArchive = archives[0];
		if (productArchive === undefined) throw new Error("Product pack did not create a tarball.");
		expect(productArchive).toMatch(/^kyudaisai-cms-.+\.tgz$/);

		await writeConsumerFiles(consumerDirectory, `file:../product/${productArchive}`);
		runPnpm(["install"], consumerDirectory);
		runNode(["--input-type=module", "-e", consumerRuntimeAssertions], consumerDirectory);
		runPnpm(["exec", "cms", "init"], consumerDirectory);

		for (let generation = 0; generation < 2; generation += 1) {
			runPnpm(["exec", "cms", "typegen"], consumerDirectory);
			await writeWorkerBindingTypecheck(consumerDirectory);
			runPnpm(["exec", "tsc", "--noEmit", "-p", ".cms/tsconfig.json"], consumerDirectory);
		}
		await writePackageApiTypecheck(consumerDirectory);
		runPnpm(
			[
				"exec",
				"tsc",
				"--noEmit",
				"--strict",
				"--skipLibCheck",
				"--target",
				"es2022",
				"--module",
				"nodenext",
				"--moduleResolution",
				"nodenext",
				"cms.config.ts",
				"drizzle.config.ts",
				"consumer-package-api.ts",
			],
			consumerDirectory,
		);

		runPnpm(["exec", "cms", "migrate", "init"], consumerDirectory);
		runPnpm(["exec", "cms", "migrate", "init", "--local"], consumerDirectory);
		const packageManifest = JSON.parse(
			await readFile(join(consumerDirectory, "node_modules/@kyudaisai/cms/package.json"), "utf8"),
		) as { version: string };
		const migrationState = JSON.parse(
			await readFile(join(consumerDirectory, "drizzle", "cms-state.json"), "utf8"),
		) as { baseline?: { schemaId?: string; version?: string } };
		expect(migrationState.baseline).toEqual({
			schemaId: "core-schema-v1",
			version: packageManifest.version,
		});
		await expect(
			access(join(consumerDirectory, "drizzle", ".cms-initial-pending.json")),
		).rejects.toHaveProperty("code", "ENOENT");

		runPnpm(["exec", "cms", "build"], consumerDirectory);
		await expectDevServerResponse(consumerDirectory);
	}, 600_000);
});

const consumerRuntimeAssertions = `
import assert from "node:assert/strict";
import { access } from "node:fs/promises";

const manifestModule = await import("@kyudaisai/cms/package.json", { with: { type: "json" } });
const config = await import("@kyudaisai/cms/config");
const schema = await import("@kyudaisai/cms/db/schema");

assert.equal(manifestModule.default.name, "@kyudaisai/cms");
assert.equal(manifestModule.default.bin.cms, "./bin/run.js");
assert.deepEqual(Object.keys(manifestModule.default.exports).sort(), ["./config", "./db/schema", "./package.json", "./web/*"]);
assert.equal(typeof config.defineConfig, "function");
assert.equal(typeof config.cmsSchemaPath, "string");
assert.equal(typeof schema.news, "object");
await access(config.cmsSchemaPath);
`;

function runPnpm(arguments_: string[], cwd: string): void {
	console.info(`consumer command: pnpm ${arguments_.join(" ")}`);
	const result = spawnSync("pnpm", arguments_, {
		cwd,
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
		shell: false,
	});
	if (result.error) throw result.error;
	expect(
		result.status,
		`pnpm ${arguments_.join(" ")} failed in ${cwd}:\n${result.stdout}\n${result.stderr}`,
	).toBe(0);
}

function runNode(arguments_: string[], cwd: string): void {
	console.info(`consumer command: node ${arguments_.join(" ")}`);
	const result = spawnSync(process.execPath, arguments_, {
		cwd,
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
		shell: false,
	});
	if (result.error) throw result.error;
	expect(
		result.status,
		`node ${arguments_.join(" ")} failed in ${cwd}:\n${result.stdout}\n${result.stderr}`,
	).toBe(0);
}

async function writeConsumerFiles(directory: string, productArchive: string): Promise<void> {
	await writeFile(
		join(directory, "package.json"),
		`${JSON.stringify(
			{
				name: "cms-product-consumer",
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
		join(directory, "pnpm-workspace.yaml"),
		"allowBuilds:\n  esbuild: true\n  workerd: true\n",
	);
	await writeFile(
		join(directory, "cms.config.ts"),
		'import { defineConfig } from "@kyudaisai/cms/config";\n\nexport default defineConfig({\n\tcloudflare: { configPath: "./wrangler.jsonc" },\n});\n',
	);
	await writeFile(
		join(directory, "drizzle.config.ts"),
		'import { cmsSchemaPath } from "@kyudaisai/cms/config";\n\nexport default {\n\tdialect: "sqlite",\n\tschema: cmsSchemaPath,\n\tout: "./drizzle",\n};\n',
	);
	await writeFile(
		join(directory, "wrangler.jsonc"),
		`${JSON.stringify(
			{
				name: "cms-product-consumer",
				compatibility_date: "2025-01-01",
				compatibility_flags: ["nodejs_compat"],
				d1_databases: [
					{
						binding: "DB",
						database_name: "cms-product-consumer",
						database_id: "00000000-0000-0000-0000-000000000001",
						migrations_dir: "./drizzle",
					},
				],
				r2_buckets: [{ binding: "ASSETS", bucket_name: "cms-product-consumer" }],
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

async function writePackageApiTypecheck(directory: string): Promise<void> {
	await writeFile(
		join(directory, "consumer-package-api.ts"),
		'import { defineConfig, cmsSchemaPath } from "@kyudaisai/cms/config";\nimport { news } from "@kyudaisai/cms/db/schema";\n\nconst config = defineConfig({ cloudflare: { configPath: "./wrangler.jsonc" } });\ntype CmsNewsId = typeof news.$inferSelect.id;\nconst schemaPath: string = cmsSchemaPath;\nconst id: CmsNewsId = "news-id";\nvoid config;\nvoid schemaPath;\nvoid id;\n',
	);
}

async function expectDevServerResponse(consumerDirectory: string): Promise<void> {
	const port = await getAvailablePort();
	const child = spawn("pnpm", ["exec", "cms", "dev"], {
		cwd: consumerDirectory,
		detached: process.platform !== "win32",
		env: { ...process.env, PORT: String(port) },
		stdio: ["ignore", "pipe", "pipe"],
		shell: false,
	});
	let output = "";
	child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
		output += chunk;
	});
	child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
		output += chunk;
	});
	const exited = once(child, "exit");
	const deadline = Date.now() + 120_000;
	console.info(`consumer command: pnpm exec cms dev (port ${port})`);
	try {
		while (Date.now() < deadline) {
			if (child.exitCode !== null) {
				throw new Error(`cms dev exited with status ${child.exitCode}:\n${output}`);
			}
			let response: Response;
			try {
				response = await fetch(`http://localhost:${port}/api/v1/scopes`, {
					signal: AbortSignal.timeout(90_000),
				});
			} catch {
				await delay(500);
				continue;
			}
			const body = await response.text();
			expect(response.status, `HTTP ${response.status}: ${body}\n${output}`).toBe(200);
			expect(response.headers.get("content-type")).toContain("application/json");
			return;
		}
		throw new Error(`cms dev did not respond to HTTP requests before timeout:\n${output}`);
	} finally {
		if (child.exitCode === null && child.signalCode === null) {
			signalDevProcessTree(child, "SIGTERM");
		}
		await Promise.race([exited, delay(10_000)]);
		if (child.exitCode === null && child.signalCode === null) {
			signalDevProcessTree(child, "SIGKILL");
			await exited;
		}
	}
}

function signalDevProcessTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
	if (child.pid === undefined) return;
	if (process.platform === "win32") {
		child.kill(signal);
		return;
	}
	try {
		process.kill(-child.pid, signal);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ESRCH") return;
		throw error;
	}
}

async function getAvailablePort(): Promise<number> {
	await using server = createServer();
	await new Promise<void>((resolveListen, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolveListen);
	});
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("Could not allocate a local CMS dev server port.");
	}
	return address.port;
}
