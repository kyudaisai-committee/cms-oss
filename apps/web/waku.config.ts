import { cloudflare, type WorkerConfig } from "@cloudflare/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "waku/config";

import type { CmsCloudflareConfig } from "@repo/config";

export function createCmsWakuConfig(cloudflareConfig?: CmsCloudflareConfig) {
	const workerConfig = cloudflareConfig
		? (resolvedConfig: WorkerConfig) => {
				Object.assign(resolvedConfig, resolveWorkerConfig(cloudflareConfig));
			}
		: undefined;
	const persistencePath =
		process.env.CMS_E2E_WRANGLER_STATE_DIR ?? process.env.CMS_WRANGLER_STATE_DIR;
	return defineConfig({
		unstable_adapter: "waku/adapters/cloudflare",
		vite: {
			resolve: { dedupe: ["react", "react-dom", "react-server-dom-webpack"] },
			server: {
				watch: {
					ignored: /[\\/]\.wrangler[\\/]/,
				},
				allowedHosts: ["cms"],
			},
			plugins: [
				cloudflare({
					...(workerConfig ? { config: workerConfig } : {}),
					viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
					persistState: persistencePath ? { path: persistencePath } : true,
					inspectorPort: false,
					remoteBindings: false,
				}),
				tailwindcss(),
				react(),
				babel({ presets: [reactCompilerPreset()] }),
			],
			environments: {
				client: {
					optimizeDeps: { exclude: ["lucide-react"] },
				},
				rsc: {
					optimizeDeps: { noDiscovery: true, exclude: ["lucide-react"] },
					build: { rolldownOptions: { platform: "neutral" } },
				},
				ssr: {
					optimizeDeps: { noDiscovery: true },
					build: { rolldownOptions: { platform: "neutral" } },
				},
			},
		},
	});
}

export default createCmsWakuConfig();

function resolveWorkerConfig(config: CmsCloudflareConfig): Partial<WorkerConfig> {
	return {
		name: config.workerName,
		main: "./src/waku.server.ts",
		compatibility_date: config.compatibilityDate,
		compatibility_flags: config.compatibilityFlags,
		workers_dev: config.workersDev,
		cache: { enabled: true },
		assets: { directory: "./dist/public", binding: "STATIC_ASSETS" },
		vars: {
			ACCESS_TEAM_DOMAIN: config.accessTeamDomain,
			ACCESS_AUDIENCE: config.accessAudience,
		},
		routes: config.routes,
		d1_databases: [
			{
				binding: "DB",
				database_name: config.databaseName,
				database_id: config.databaseId,
			},
		],
		r2_buckets: [{ binding: "ASSETS", bucket_name: config.bucketName }],
		observability: {
			logs: { enabled: true, head_sampling_rate: 1, invocation_logs: true },
		},
	};
}
