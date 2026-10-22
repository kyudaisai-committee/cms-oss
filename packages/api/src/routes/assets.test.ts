import { afterEach, describe, expect, it, vi } from "vitest";

import { CmsRepository } from "@repo/core/repository.server";
import { CmsService } from "@repo/core/service.server";
import type { AssetDto } from "@repo/core/types";

import { createApiApp } from "../app";
import type { ApiBindings } from "../context";

const filename = '案内\\ "report" 😀.txt';
const body = "asset contents";
const app = createApiApp({ apiName: "API tests", allowLocalFallback: true });
const scope = {
	id: "scope-1",
	year: 2026,
	site: "festival",
	name: "Festival",
	availableLanguages: ["ja", "en"],
	defaultLanguage: "ja",
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};
const baseAsset = {
	id: "asset-1",
	scope: { year: 2026, site: "festival" },
	uploaderActor: "test",
	createdAt: "2026-01-01T00:00:00.000Z",
} satisfies Pick<AssetDto, "id" | "scope" | "uploaderActor" | "createdAt">;

afterEach(() => {
	vi.restoreAllMocks();
});

describe("asset object filenames", () => {
	it("uploads and serves Unicode filenames with a safe fallback and RFC 5987 value", async () => {
		let uploadedBody = new ArrayBuffer(0);
		let uploadedAsset: AssetDto | null = null;
		let contentType = "application/octet-stream";
		const assets = {
			async put(
				_objectKey: string,
				value: BodyInit,
				options?: {
					httpMetadata?: { contentType?: string; contentDisposition?: string };
				},
			) {
				uploadedBody = await new Response(value).arrayBuffer();
				contentType = options?.httpMetadata?.contentType ?? contentType;
			},
			async get() {
				return {
					body: new Response(uploadedBody).body,
					size: uploadedBody.byteLength,
					httpEtag: '"asset-etag"',
					httpMetadata: { contentType },
				};
			},
		};
		const environment = {
			DB: {} as unknown as ApiBindings["DB"],
			ASSETS: assets as unknown as ApiBindings["ASSETS"],
			ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
			ACCESS_AUDIENCE: "test-audience",
		} satisfies ApiBindings;

		vi.spyOn(CmsRepository.prototype, "findScope").mockResolvedValue(scope);
		vi.spyOn(CmsService.prototype, "createAsset").mockImplementation(async (input) => {
			uploadedAsset = { ...baseAsset, ...input };
			return uploadedAsset;
		});
		vi.spyOn(CmsService.prototype, "getAsset").mockImplementation(async () => {
			if (!uploadedAsset) throw new Error("The asset has not been uploaded.");
			return uploadedAsset;
		});

		const form = new FormData();
		form.set("file", new File([body], filename, { type: "text/plain" }));
		const uploadResponse = await app.request(
			"http://127.0.0.1/admin/2026/festival/assets",
			{ method: "POST", body: form },
			environment,
		);
		const getResponse = await app.request("/2026/festival/assets/asset-1", {}, environment);

		expect(uploadResponse.status).toBe(201);
		expect(getResponse.status).toBe(200);
		expect(await getResponse.text()).toBe(body);
		expect(getResponse.headers.get("Content-Disposition")).toBe(
			`inline; filename="___ _report_ __.txt"; filename*=UTF-8''%E6%A1%88%E5%86%85%5C%20%22report%22%20%F0%9F%98%80.txt`,
		);
	});
});
