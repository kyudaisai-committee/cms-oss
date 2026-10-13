export interface CmsEnvironment {
	VITE_CMS_NAME?: string;
	VITE_CMS_DESCRIPTION?: string;
	VITE_CMS_ICON_URL?: string;
	VITE_CMS_THEME_STORAGE_KEY?: string;
	VITE_CMS_NEWS_FORM_STORAGE_PREFIX?: string;
}

export interface CmsSettings {
	name: string;
	description: string;
	iconUrl: string | undefined;
	themeStorageKey: string;
	newsFormStoragePrefix: string;
}

function configuredValue(value: string | undefined, fallback: string): string {
	return value?.trim() || fallback;
}

function optionalValue(value: string | undefined): string | undefined {
	return value?.trim() || undefined;
}

export function createCmsSettings(environment: CmsEnvironment): CmsSettings {
	return {
		name: configuredValue(environment.VITE_CMS_NAME, "お知らせ CMS"),
		description: configuredValue(environment.VITE_CMS_DESCRIPTION, "お知らせを管理するCMS"),
		iconUrl: optionalValue(environment.VITE_CMS_ICON_URL),
		themeStorageKey: configuredValue(environment.VITE_CMS_THEME_STORAGE_KEY, "cms-theme"),
		newsFormStoragePrefix: configuredValue(
			environment.VITE_CMS_NEWS_FORM_STORAGE_PREFIX,
			"cms:news-form",
		),
	};
}

export const cmsSettings = Object.freeze(createCmsSettings(import.meta.env));
