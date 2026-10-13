import { describe, expect, it } from "vitest";

import { scopeRefSchema } from "@repo/core/types";

import { getScopeFallbackLabel, scopePath } from "./site";

describe("scope labels and paths", () => {
	it("uses the year and site identifier when a scope name is not available", () => {
		expect(getScopeFallbackLabel({ year: 2026, site: "news room" })).toBe("2026 · news room");
	});

	it("encodes arbitrary site identifiers as one route segment", () => {
		expect(scopePath({ year: 2026, site: "news room/祭" })).toBe("/2026/news%20room%2F%E7%A5%AD");
	});

	it("accepts a non-empty custom site identifier in scope input", () => {
		expect(scopeRefSchema.parse({ year: "2028", site: "expo" })).toEqual({
			year: 2028,
			site: "expo",
		});
		expect(scopeRefSchema.safeParse({ year: 2028, site: "  " }).success).toBe(false);
	});
});
