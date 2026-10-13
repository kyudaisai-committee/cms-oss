import { describe, expect, it } from "vitest";

import { cmsSettings } from "#web/cms-settings";

import type { NewsFormState } from "../store";
import {
	getNewsFormDraftStorageKey,
	getNewsFormFingerprint,
	NEWS_FORM_DRAFT_VERSION,
	normalizeNewsFormState,
	persistNewsFormDraft,
	readNewsFormDraft,
	removeNewsFormDraft,
	sha256Hex,
	serializeNewsFormState,
	writeNewsFormDraft,
	type NewsFormDraftStorage,
} from "./news-form-storage";

const state: NewsFormState = {
	title: "お知らせ",
	slug: "notice",
	summary: "概要",
	contentType: "markdown",
	content: "本文",
	tagIds: ["tag-1"],
	publishedAt: "2026-09-12T18:30",
	lang: "ja",
};

function createStorage(): NewsFormDraftStorage & { values: Map<string, string> } {
	const values = new Map<string, string>();
	return {
		values,
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value),
		removeItem: (key) => values.delete(key),
	};
}

describe("news form draft storage", () => {
	it("creates versioned keys that distinguish scopes and new/edit forms", () => {
		const scope = { year: 2026, site: "festival" as const };

		expect(
			getNewsFormDraftStorageKey(scope).startsWith(
				`${cmsSettings.newsFormStoragePrefix}:v${NEWS_FORM_DRAFT_VERSION}:`,
			),
		).toBe(true);
		expect(getNewsFormDraftStorageKey(scope)).toContain(":v3:");
		expect(getNewsFormDraftStorageKey(scope)).not.toBe(getNewsFormDraftStorageKey(scope, "new"));
		expect(getNewsFormDraftStorageKey(scope)).not.toBe(
			getNewsFormDraftStorageKey({ year: 2026, site: "committee" }, "news-1"),
		);
		expect(getNewsFormDraftStorageKey(scope)).not.toBe(
			getNewsFormDraftStorageKey({ year: 2027, site: "festival" }),
		);
		expect(getNewsFormDraftStorageKey(scope, "news-1")).not.toBe(
			getNewsFormDraftStorageKey(scope, "news:1"),
		);
	});

	it("hashes a known SHA-256 vector", async () => {
		expect(await sha256Hex("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});

	it("round-trips a complete form state with its server fingerprint", async () => {
		const storage = createStorage();
		const key = getNewsFormDraftStorageKey({ year: 2026, site: "festival" });
		const baseFingerprint = await getNewsFormFingerprint(state);
		if (!baseFingerprint) throw new Error("SHA-256 is unavailable in the test environment");
		writeNewsFormDraft(key, state, baseFingerprint, storage);

		expect(readNewsFormDraft(key, storage)).toEqual({ baseFingerprint, state });
	});

	it("normalizes tag order before serializing a fingerprint", async () => {
		const reordered = { ...state, tagIds: [...state.tagIds].reverse() };

		expect(normalizeNewsFormState(reordered).tagIds).toEqual(state.tagIds);
		expect(serializeNewsFormState(reordered)).toBe(serializeNewsFormState(state));
		expect(await getNewsFormFingerprint(reordered)).toBe(await getNewsFormFingerprint(state));
		expect(await getNewsFormFingerprint({ ...state, title: "別のお知らせ" })).not.toBe(
			await getNewsFormFingerprint(state),
		);
	});

	it("ignores malformed, old, and incomplete values", () => {
		const storage = createStorage();
		const key = getNewsFormDraftStorageKey({ year: 2026, site: "festival" });

		storage.values.set(key, "not-json");
		expect(readNewsFormDraft(key, storage)).toBeNull();

		storage.values.set(key, JSON.stringify({ baseFingerprint: "old", state, version: 1 }));
		expect(readNewsFormDraft(key, storage)).toBeNull();

		storage.values.set(
			key,
			JSON.stringify({ baseFingerprint: "base", state: { ...state, tagIds: [1] }, version: 2 }),
		);
		expect(readNewsFormDraft(key, storage)).toBeNull();

		storage.values.set(key, JSON.stringify({ baseFingerprint: "", state, version: 2 }));
		expect(readNewsFormDraft(key, storage)).toBeNull();
	});

	it("removes a draft and tolerates unavailable storage", async () => {
		const storage = createStorage();
		const key = getNewsFormDraftStorageKey({ year: 2026, site: "festival" });
		const baseFingerprint = await getNewsFormFingerprint(state);
		if (!baseFingerprint) throw new Error("SHA-256 is unavailable in the test environment");
		writeNewsFormDraft(key, state, baseFingerprint, storage);
		removeNewsFormDraft(key, storage);

		expect(readNewsFormDraft(key, storage)).toBeNull();
		expect(readNewsFormDraft(key, null)).toBeNull();
		expect(() => writeNewsFormDraft(key, state, baseFingerprint, null)).not.toThrow();
		expect(() => removeNewsFormDraft(key, null)).not.toThrow();
	});

	it("removes a draft when the form returns to the server state", async () => {
		const storage = createStorage();
		const key = getNewsFormDraftStorageKey({ year: 2026, site: "festival" });
		const changedState = { ...state, title: "変更後のお知らせ" };

		expect(await persistNewsFormDraft(key, changedState, state, storage)).toBe(false);
		expect(readNewsFormDraft(key, storage)).not.toBeNull();

		expect(await persistNewsFormDraft(key, state, state, storage)).toBe(true);
		expect(readNewsFormDraft(key, storage)).toBeNull();
	});

	it("stores the server fingerprint separately from the restored draft state", async () => {
		const storage = createStorage();
		const key = getNewsFormDraftStorageKey({ year: 2026, site: "festival" });
		const changedState = { ...state, title: "変更後のお知らせ" };
		const serverFingerprint = await getNewsFormFingerprint(state);
		if (!serverFingerprint) throw new Error("SHA-256 is unavailable in the test environment");

		await persistNewsFormDraft(key, changedState, state, storage);

		expect(readNewsFormDraft(key, storage)).toEqual({
			baseFingerprint: serverFingerprint,
			state: changedState,
		});
	});

	it("does not commit a draft after its hash operation is aborted", async () => {
		const storage = createStorage();
		const key = getNewsFormDraftStorageKey({ year: 2026, site: "festival" });
		const controller = new AbortController();
		const pending = persistNewsFormDraft(
			key,
			{ ...state, title: "変更後のお知らせ" },
			state,
			storage,
			controller.signal,
		);
		controller.abort();

		expect(await pending).toBe(false);
		expect(readNewsFormDraft(key, storage)).toBeNull();
	});
});
