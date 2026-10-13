import type { DataImportPlan } from "#core/types";

import type { PreparedTag } from "./types";

export function summarizeImportPlan(
	news: DataImportPlan["news"],
	tags: PreparedTag[],
	languagesToAdd: string[],
): DataImportPlan["summary"] {
	return {
		newsToCreate: news.filter((item) => item.action === "create").length,
		newsToSkip: news.filter((item) => item.action === "skip").length,
		translationsToCreate: news
			.filter((item) => item.action === "create")
			.reduce((count, item) => count + item.translations.length, 0),
		tagsToCreate: tags.filter((tag) => tag.action === "create").length,
		tagsToReuse: tags.filter((tag) => tag.action === "reuse").length,
		languagesToAdd: languagesToAdd.length,
	};
}
