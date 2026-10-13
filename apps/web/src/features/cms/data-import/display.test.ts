import { describe, expect, it } from "vitest";

import { getDataImportDisplayTranslations } from "./display";

describe("data import display translation order", () => {
	it("shows the source default language first while retaining original indexes and remaining order", () => {
		const translations = Object.freeze([
			Object.freeze({ lang: "en", title: "English" }),
			Object.freeze({ lang: "fr", title: "Français" }),
			Object.freeze({ lang: "ja", title: "日本語" }),
		]);

		const displayed = getDataImportDisplayTranslations(translations, "ja");

		expect(displayed.map(({ translation }) => translation.title)).toEqual([
			"日本語",
			"English",
			"Français",
		]);
		expect(displayed.map(({ sourceIndex }) => sourceIndex)).toEqual([2, 0, 1]);
		expect(
			displayed.map(({ sourceIndex }) => ["target-en", "target-fr", "target-ja"][sourceIndex]),
		).toEqual(["target-ja", "target-en", "target-fr"]);
		expect(translations.map(({ lang }) => lang)).toEqual(["en", "fr", "ja"]);
	});

	it("uses the source English default without hardcoding Japanese", () => {
		const translations = [
			{ lang: "ja", title: "日本語" },
			{ lang: "en", title: "English" },
		];

		expect(
			getDataImportDisplayTranslations(translations, "en").map(
				({ translation }) => translation.lang,
			),
		).toEqual(["en", "ja"]);
	});

	it("retains source order when the default language translation is absent", () => {
		const translations = [
			{ lang: "en", title: "English" },
			{ lang: "fr", title: "Français" },
		];

		expect(
			getDataImportDisplayTranslations(translations, "ja").map(({ sourceIndex }) => sourceIndex),
		).toEqual([0, 1]);
	});
});
