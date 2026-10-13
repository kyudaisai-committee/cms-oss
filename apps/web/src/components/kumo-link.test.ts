import { describe, expect, it } from "vitest";

import { shouldUseWakuLink } from "./kumo-link";

describe("shouldUseWakuLink", () => {
	it("uses Waku for an internal href", () => {
		expect(shouldUseWakuLink({ href: "/2026/festival" })).toBe(true);
	});

	it.each([
		["external URL", { href: "https://example.com" }],
		["protocol-relative URL", { href: "//example.com" }],
		["hash link", { href: "#details" }],
		["new-tab target", { href: "/2026/festival", target: "_blank" }],
		["download", { href: "/2026/festival", download: "export.html" }],
	] as const)("keeps %s as a regular anchor", (_label, props) => {
		expect(shouldUseWakuLink(props)).toBe(false);
	});
});
