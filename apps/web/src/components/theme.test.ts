import { describe, expect, it } from "vitest";

import { cmsSettings } from "#web/cms-settings";

import {
	modeFromSystemPreference,
	parseThemePreference,
	resolveThemeMode,
	THEME_STORAGE_KEY,
	type ThemeMode,
} from "./theme";

describe("theme preference logic", () => {
	it("uses the configured browser storage key", () => {
		expect(THEME_STORAGE_KEY).toBe(cmsSettings.themeStorageKey);
	});

	it("uses system as the default and rejects unknown stored values", () => {
		expect(parseThemePreference(null)).toBe("system");
		expect(parseThemePreference("unknown")).toBe("system");
		expect(parseThemePreference("system")).toBe("system");
		expect(parseThemePreference("light")).toBe("light");
		expect(parseThemePreference("dark")).toBe("dark");
	});

	it("resolves system to the current operating system mode", () => {
		const light: ThemeMode = modeFromSystemPreference(false);
		const dark: ThemeMode = modeFromSystemPreference(true);

		expect(resolveThemeMode("system", light)).toBe("light");
		expect(resolveThemeMode("system", dark)).toBe("dark");
	});

	it("keeps explicit light and dark selections independent of the system", () => {
		expect(resolveThemeMode("light", "dark")).toBe("light");
		expect(resolveThemeMode("dark", "light")).toBe("dark");
	});
});
