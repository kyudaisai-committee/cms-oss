import { describe, expect, it } from "vitest";

import { createCmsWakuConfig } from "../waku.config.js";

describe("createCmsWakuConfig", () => {
	it("passes consumer-owned allowed hosts to the Vite development server", () => {
		const config = createCmsWakuConfig(undefined, ["cms.example.test"]);

		expect(config.vite?.server?.allowedHosts).toEqual(["cms.example.test"]);
	});

	it("does not add allowed hosts by default", () => {
		const config = createCmsWakuConfig();

		expect(config.vite?.server?.allowedHosts).toEqual([]);
	});
});
