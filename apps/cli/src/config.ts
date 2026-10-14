import { fileURLToPath } from "node:url";

export {
	CMS_BINDINGS,
	CMS_CONFIG_DEFAULTS,
	defineConfig,
	isCloudflareConfigReference,
	projectDisplaySettings,
	validateConfig,
	validateDeployConfig,
} from "@repo/config";

export const cmsSchemaPath = fileURLToPath(new URL("./db/schema.js", import.meta.url));

export type {
	CmsCloudflareConfig,
	CmsCloudflareConfigReference,
	CmsCloudflareWorkerConfig,
	CmsConfig,
	CmsConfigInput,
	CmsDisplaySettings,
} from "@repo/config";
