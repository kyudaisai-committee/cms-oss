import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import cacheControl from "#web/middleware/cache-control";

describe("cache-control middleware", () => {
	it("defaults responses to no-store while preserving explicit cache policy", async () => {
		const app = new Hono();
		app.use("*", cacheControl());
		app.get("/private", () => new Response("private"));
		app.get(
			"/public",
			() => new Response("public", { headers: { "Cache-Control": "public, max-age=60" } }),
		);

		const privateResponse = await app.request("/private");
		const publicResponse = await app.request("/public");

		expect(privateResponse.headers.get("Cache-Control")).toBe("no-store");
		expect(publicResponse.headers.get("Cache-Control")).toBe("public, max-age=60");
	});
});
