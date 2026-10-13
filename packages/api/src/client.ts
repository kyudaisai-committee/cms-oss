import { hc } from "hono/client";

import type { ApiType } from "./server";

export const apiBasePath = "/api/v1";
export function createApiClient(baseUrl = apiBasePath) {
	return hc<ApiType>(baseUrl);
}
export type { ApiType } from "./server";
