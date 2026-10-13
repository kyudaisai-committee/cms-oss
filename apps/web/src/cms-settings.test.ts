import { describe, expect, it } from "vitest";

import { createCmsSettings } from "#web/cms-settings";

describe("CMS settings", () => {
	it("provides generic defaults when environment values are unset", () => {
		expect(createCmsSettings({})).toEqual({
			name: "お知らせ CMS",
			description: "お知らせを管理するCMS",
			iconUrl: undefined,
			themeStorageKey: "cms-theme",
			newsFormStoragePrefix: "cms:news-form",
		});
	});

	it("uses configured branding and storage identifiers", () => {
		expect(
			createCmsSettings({
				VITE_CMS_NAME: "Example Festival CMS",
				VITE_CMS_DESCRIPTION: "Manage the Example Festival announcements",
				VITE_CMS_ICON_URL: "/brand/icon.png",
				VITE_CMS_THEME_STORAGE_KEY: "example-cms-theme",
				VITE_CMS_NEWS_FORM_STORAGE_PREFIX: "example-cms:news-form",
			}),
		).toEqual({
			name: "Example Festival CMS",
			description: "Manage the Example Festival announcements",
			iconUrl: "/brand/icon.png",
			themeStorageKey: "example-cms-theme",
			newsFormStoragePrefix: "example-cms:news-form",
		});
	});

	it("uses generic defaults for blank values and omits a blank icon URL", () => {
		expect(
			createCmsSettings({
				VITE_CMS_NAME: "   ",
				VITE_CMS_DESCRIPTION: "",
				VITE_CMS_ICON_URL: "  ",
				VITE_CMS_THEME_STORAGE_KEY: "",
				VITE_CMS_NEWS_FORM_STORAGE_PREFIX: "  ",
			}),
		).toEqual(createCmsSettings({}));
	});
});
