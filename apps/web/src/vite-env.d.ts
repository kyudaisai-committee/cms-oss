/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_CMS_NAME?: string;
	readonly VITE_CMS_DESCRIPTION?: string;
	readonly VITE_CMS_ICON_URL?: string;
	readonly VITE_CMS_THEME_STORAGE_KEY?: string;
	readonly VITE_CMS_NEWS_FORM_STORAGE_PREFIX?: string;
}
