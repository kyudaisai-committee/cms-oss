import { normalizeLang, normalizeSlug } from "#core/input";

function addError(errors: string[], message: string) {
	if (!errors.includes(message)) errors.push(message);
}

function normalizeOrReport(value: string, errors: string[], context: string) {
	try {
		return normalizeSlug(value);
	} catch {
		addError(
			errors,
			`${context}のslugが不正です。英小文字と数字をハイフンでつないだ形式を指定してください。`,
		);
		return null;
	}
}

function normalizeLanguageOrReport(value: string, errors: string[], context: string) {
	try {
		return normalizeLang(value);
	} catch {
		addError(errors, `${context}の言語コードが不正です。`);
		return null;
	}
}

export { addError, normalizeLanguageOrReport, normalizeOrReport };
