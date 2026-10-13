import { vi, describe, expect, it } from "vitest";

const { patch, post } = vi.hoisted(() => ({ patch: vi.fn(), post: vi.fn() }));

vi.mock("@repo/api/client", () => ({
	createApiClient: () => ({
		admin: {
			scopes: {
				":year": { ":site": { $patch: patch } },
				ensure: { $post: post },
			},
		},
	}),
}));

import type { ScopeDto } from "@repo/core/types";

import { ensureScope, updateScope } from "./scope-api";

const scope: ScopeDto = {
	id: "scope-1",
	year: 2026,
	site: "festival",
	name: "Festival",
	availableLanguages: ["ja", "en"],
	defaultLanguage: "ja",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("updateScope", () => {
	it("validates PATCH input without requiring year and site in the body", async () => {
		patch.mockResolvedValueOnce(
			new Response(JSON.stringify({ data: scope }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		await expect(
			updateScope(scope, { availableLanguages: ["ja", "en"], defaultLanguage: "en" }),
		).resolves.toEqual(scope);
		expect(patch).toHaveBeenCalledWith({
			param: { year: "2026", site: "festival" },
			json: { availableLanguages: ["ja", "en"], defaultLanguage: "en" },
		});
	});
});

describe("ensureScope", () => {
	it("accepts a custom site identifier and sends it to the admin API", async () => {
		const customScope: ScopeDto = {
			...scope,
			id: "scope-expo",
			year: 2028,
			site: "expo",
			name: "展示企画",
		};
		post.mockResolvedValueOnce(
			new Response(JSON.stringify({ data: customScope }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		await expect(ensureScope({ year: 2028, site: "expo" })).resolves.toEqual(customScope);
		expect(post).toHaveBeenCalledWith({ json: { year: 2028, site: "expo" } });
	});
});
