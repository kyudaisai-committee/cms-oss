import { env } from "cloudflare:workers";

import { cmsSettings } from "#web/cms-settings";
import { createApiApp } from "@repo/api/server";

const apiBasePath = "/api/v1";
const apiApp = createApiApp({
	apiName: cmsSettings.name,
	allowLocalFallback: import.meta.env.DEV,
});

async function forward(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const target = new URL(url);
	target.pathname = url.pathname.startsWith(`${apiBasePath}/`)
		? url.pathname.slice(apiBasePath.length) || "/"
		: "/";
	const forwarded = new Request(target, request);
	return apiApp.fetch(forwarded, env);
}

export const GET = forward;
export const HEAD = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const OPTIONS = forward;
export const QUERY = forward;
