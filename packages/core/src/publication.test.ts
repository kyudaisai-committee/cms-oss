import { describe, expect, it } from "vitest";

import { getNewsDisplayStatus, isNewsPublicAt } from "./publication";

describe("news publication", () => {
	const now = new Date("2026-09-12T00:00:00.000Z");

	it("distinguishes draft, scheduled, and published states", () => {
		expect(getNewsDisplayStatus("draft", null, now)).toBe("draft");
		expect(getNewsDisplayStatus("published", "2026-09-13T00:00:00.000Z", now)).toBe("scheduled");
		expect(getNewsDisplayStatus("published", "2026-09-11T00:00:00.000Z", now)).toBe("published");
	});

	it("only exposes published news at or before the current time", () => {
		expect(isNewsPublicAt("published", new Date("2026-09-12T00:00:00.000Z"), now)).toBe(true);
		expect(isNewsPublicAt("draft", now, now)).toBe(false);
	});
});
