import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";

import type { AccessJwtVerifier } from "#api/access.server";

import { createAccessJwtMiddleware } from "./middleware";
import type { ApiEnv } from "./utils";

function testApp(
	options: Parameters<typeof createAccessJwtMiddleware>[1],
	verify?: AccessJwtVerifier,
) {
	const app = new Hono<ApiEnv>();
	app.use("*", createAccessJwtMiddleware(verify, options));
	app.get("/", (c) => c.text(c.get("authMethod")));
	app.onError((error, c) => {
		if (error instanceof HTTPException) return c.text(error.message, error.status);
		return c.text("Internal server error.", 500);
	});
	return app;
}

describe("admin Access JWT middleware", () => {
	it("rejects a missing JWT in production-equivalent mode", async () => {
		const response = await testApp({ allowLocalFallback: false }).request("https://cms.example/");

		expect(response.status).toBe(403);
	});

	it("uses a local actor for a missing JWT in local development", async () => {
		const response = await testApp({ allowLocalFallback: true }).request("http://127.0.0.1/");

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("local");
	});

	it("keeps non-loopback requests protected with explicit local fallback", async () => {
		const response = await testApp({ allowLocalFallback: true }).request("https://cms.example/");

		expect(response.status).toBe(403);
	});

	it("rejects an invalid JWT even when local fallback is enabled", async () => {
		const rejectVerifier: AccessJwtVerifier = async () => {
			throw new Error("invalid JWT");
		};
		const response = await testApp({ allowLocalFallback: true }, rejectVerifier).request(
			"http://127.0.0.1/",
			{ headers: { "CF-Access-Jwt-Assertion": "invalid" } },
		);

		expect(response.status).toBe(403);
	});

	it("rejects an empty JWT header instead of treating it as missing", async () => {
		const response = await testApp({ allowLocalFallback: true }).request("http://127.0.0.1/", {
			headers: { "CF-Access-Jwt-Assertion": " " },
		});

		expect(response.status).toBe(403);
	});
});
