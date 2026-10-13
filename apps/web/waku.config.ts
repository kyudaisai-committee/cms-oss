import { cloudflare } from "@cloudflare/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "waku/config";

const isolatedPersistencePath = process.env.CMS_E2E_WRANGLER_STATE_DIR;

export default defineConfig({
	unstable_adapter: "waku/adapters/cloudflare",
	vite: {
		server: {
			watch: {
				ignored: /[\\/]\.wrangler[\\/]/,
			},
			allowedHosts: ["cms"],
		},
		plugins: [
			cloudflare({
				viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
				persistState: isolatedPersistencePath ? { path: isolatedPersistencePath } : true,
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
