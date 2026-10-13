import { describe, expect, it } from "vitest";

import { ScopeDataProvider } from "./scope-data-provider";

function providerKey(year: number, site: string) {
	return ScopeDataProvider({
		news: [],
		children: null,
		scope: { site, year },
		tags: [],
	}).key;
}

describe("ScopeDataProvider", () => {
	it("uses a stable key for each scope", () => {
		expect(providerKey(2026, "festival")).toBe("2026:festival");
		expect(providerKey(2026, "festival")).toBe(providerKey(2026, "festival"));
	});

	it("uses a different key when the scope changes", () => {
		expect(providerKey(2026, "festival")).not.toBe(providerKey(2026, "committee"));
		expect(providerKey(2026, "festival")).not.toBe(providerKey(2026, "expo"));
		expect(providerKey(2026, "festival")).not.toBe(providerKey(2027, "festival"));
	});
});
