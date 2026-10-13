"use client";

import type { ReactNode } from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import {
	THEME_MEDIA_QUERY,
	THEME_STORAGE_KEY,
	modeFromSystemPreference,
	parseThemePreference,
	resolveThemeMode,
	type ThemeMode,
	type ThemePreference,
} from "./theme";

interface ThemeContextValue {
	mode: ThemeMode;
	preference: ThemePreference;
	setPreference: (preference: ThemePreference) => void;
}

interface ThemeProviderProps {
	children: ReactNode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference {
	try {
		return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
	} catch {
		return "system";
	}
}

function writeStoredPreference(preference: ThemePreference) {
	try {
		window.localStorage.setItem(THEME_STORAGE_KEY, preference);
	} catch {
		// Storage can be unavailable in private browsing or restricted documents.
	}
}

function readSystemMode(fallback: ThemeMode): ThemeMode {
	try {
		return modeFromSystemPreference(window.matchMedia(THEME_MEDIA_QUERY).matches);
	} catch {
		return fallback;
	}
}

function applyTheme(mode: ThemeMode) {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	root.dataset.theme = "kumo";
	root.dataset.mode = mode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
	const [preference, setPreferenceState] = useState<ThemePreference>("system");
	const [mode, setMode] = useState<ThemeMode>("light");
	const preferenceRef = useRef<ThemePreference>("system");

	useEffect(() => {
		const mediaQueryList = (() => {
			try {
				return window.matchMedia(THEME_MEDIA_QUERY);
			} catch {
				return null;
			}
		})();
		const initialPreference = readStoredPreference();
		const initialSystemMode = mediaQueryList
			? modeFromSystemPreference(mediaQueryList.matches)
			: "light";
		const initialMode = resolveThemeMode(initialPreference, initialSystemMode);

		preferenceRef.current = initialPreference;
		setPreferenceState(initialPreference);
		setMode(initialMode);
		applyTheme(initialMode);

		if (!mediaQueryList) return;
		const handleSystemModeChange = (event: MediaQueryListEvent) => {
			if (preferenceRef.current !== "system") return;
			const nextMode = modeFromSystemPreference(event.matches);
			setMode(nextMode);
			applyTheme(nextMode);
		};

		mediaQueryList.addEventListener("change", handleSystemModeChange);
		return () => mediaQueryList.removeEventListener("change", handleSystemModeChange);
	}, []);

	const setPreference = useCallback((nextPreference: ThemePreference) => {
		writeStoredPreference(nextPreference);
		preferenceRef.current = nextPreference;
		setPreferenceState(nextPreference);
		const nextMode = resolveThemeMode(nextPreference, readSystemMode("light"));
		setMode(nextMode);
		applyTheme(nextMode);
	}, []);

	const value = useMemo(
		() => ({ mode, preference, setPreference }),
		[mode, preference, setPreference],
	);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) throw new Error("useTheme must be used within ThemeProvider");
	return context;
}
