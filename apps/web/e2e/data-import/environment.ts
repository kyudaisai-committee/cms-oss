import { spawn } from "node:child_process";
import { access, mkdtemp, mkdtempDisposable, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";

import { schema } from "@repo/core/db/schema";

export interface ExecuteResult {
	stdout: string;
	stderr: string;
}

interface ExecuteOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
}

export interface IsolatedEnvironment extends AsyncDisposable {
	chromePath: string;
	persistDirectory: string;
	databaseDirectory: string;
	screenshotDirectory: string;
	baseUrl: string;
	server: ReturnType<typeof startServer>;
}

export const webDirectory = process.cwd();
export const wranglerPath = path.join(webDirectory, "node_modules/.bin/wrangler");

export async function findChrome(): Promise<string> {
	const candidates = [
		process.env.CHROME_EXECUTABLE_PATH,
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
	];
	for (const candidate of candidates) {
		if (!candidate) continue;
		try {
			await access(candidate);
			return candidate;
		} catch {}
	}
	throw new Error("既存のChromeが見つかりません。ブラウザの自動ダウンロードは行いません。");
}

export async function execute(
	command: string,
	args: string[],
	options: ExecuteOptions = {},
): Promise<ExecuteResult> {
	using child = spawn(command, args, {
		cwd: options.cwd ?? webDirectory,
		env: options.env ?? process.env,
		stdio: ["ignore", "pipe", "pipe"],
	});
	let stdout = "";
	let stderr = "";
	child.stdout?.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
	child.stderr?.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
	return await new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) reject(new Error(`${command} exited ${code}\n${stdout}\n${stderr}`));
			else resolve({ stdout, stderr });
		});
	});
}

function startServer(port: number, databaseDirectory: string) {
	const processHandle = spawn(
		path.join(webDirectory, "node_modules/.bin/waku"),
		["dev", "--host", "127.0.0.1", "--port", String(port)],
		{
			cwd: webDirectory,
			env: {
				...process.env,
				CMS_E2E_WRANGLER_STATE_DIR: databaseDirectory,
				WRANGLER_SEND_METRICS: "false",
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let logs = "";
	processHandle.stdout?.setEncoding("utf8").on("data", (chunk: string) => (logs += chunk));
	processHandle.stderr?.setEncoding("utf8").on("data", (chunk: string) => (logs += chunk));
	return { processHandle, getLogs: () => logs };
}

async function getAvailablePort(): Promise<number> {
	await using listener = net.createServer();
	await new Promise<void>((resolve, reject) => {
		listener.once("error", reject);
		listener.listen(0, "127.0.0.1", resolve);
	});
	const address = listener.address();
	if (!address || typeof address === "string") throw new Error("ポートを取得できませんでした。");
	return address.port;
}

async function waitForServer(
	baseUrl: string,
	activeServer: ReturnType<typeof startServer>,
): Promise<void> {
	const deadline = Date.now() + 90_000;
	while (Date.now() < deadline) {
		if (activeServer.processHandle.exitCode !== null)
			throw new Error(`Waku dev が起動前に終了しました。\n${activeServer.getLogs()}`);
		try {
			const response = await fetch(`${baseUrl}/api/v1/scopes`);
			if (response.ok) return;
		} catch {}
		await delay(400);
	}
	throw new Error(`Waku dev の起動がタイムアウトしました。\n${activeServer.getLogs()}`);
}

export async function stopServer(
	activeServer: ReturnType<typeof startServer> | undefined,
): Promise<void> {
	if (!activeServer || activeServer.processHandle.exitCode !== null) return;
	const exited = new Promise<void>((resolve) =>
		activeServer.processHandle.once("exit", () => resolve()),
	);
	activeServer.processHandle.kill("SIGTERM");
	const timeoutElapsed = Promise.withResolvers<void>();
	using _timeout = setTimeout(timeoutElapsed.resolve, 8_000);
	await Promise.race([exited, timeoutElapsed.promise]);
	if (activeServer.processHandle.exitCode === null) activeServer.processHandle.kill("SIGKILL");
}

export async function createIsolatedEnvironment(): Promise<IsolatedEnvironment> {
	const chromePath = await findChrome();
	await using resources = new AsyncDisposableStack();
	const persistence = await mkdtempDisposable(path.join(os.tmpdir(), "cms-import-e2e-d1-"));
	resources.use(persistence);
	const persistDirectory = persistence.path;
	const databaseDirectory = path.join(persistDirectory, "d1");
	const screenshotDirectory = await mkdtemp(path.join(os.tmpdir(), "cms-import-e2e-review-"));
	const currentSchema = await generateSQLiteDrizzleJson(schema);
	const emptySchema = await generateSQLiteDrizzleJson({});
	const statements = await generateSQLiteMigration(emptySchema, currentSchema);
	if (statements.length === 0) throw new Error("D1 schema generation produced no statements.");
	const schemaFile = path.join(persistDirectory, "schema.sql");
	try {
		await writeFile(schemaFile, `${statements.join("\n")}\n`, "utf8");
		await execute(wranglerPath, [
			"d1",
			"execute",
			"DB",
			"--local",
			"--persist-to",
			databaseDirectory,
			"--config",
			"wrangler.toml",
			"--file",
			schemaFile,
		]);
	} finally {
		await rm(schemaFile, { force: true });
	}
	const port = await getAvailablePort();
	const baseUrl = `http://127.0.0.1:${port}`;
	const server = startServer(port, databaseDirectory);
	resources.defer(() => stopServer(server));
	await waitForServer(baseUrl, server);
	const ownedResources = resources.move();
	return {
		chromePath,
		persistDirectory,
		databaseDirectory,
		screenshotDirectory,
		baseUrl,
		server,
		async [Symbol.asyncDispose]() {
			await ownedResources.disposeAsync();
		},
	};
}
