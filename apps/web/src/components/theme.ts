import { cmsSettings } from "#web/cms-settings";

export const THEME_STORAGE_KEY = cmsSettings.themeStorageKey;

export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export type ThemeMode = "light" | "dark";
export type ThemePreference = "system" | ThemeMode;

export function isThemeMode(value: unknown): value is ThemeMode {
	return value === "light" || value === "dark";
}

export function isThemePreference(value: unknown): value is ThemePreference {
	return value === "system" || isThemeMode(value);
}

export function parseThemePreference(value: string | null): ThemePreference {
	return isThemePreference(value) ? value : "system";
}

export function modeFromSystemPreference(prefersDark: boolean): ThemeMode {
	return prefersDark ? "dark" : "light";
}

export function resolveThemeMode(preference: ThemePreference, systemMode: ThemeMode): ThemeMode {
	return preference === "system" ? systemMode : preference;
}
