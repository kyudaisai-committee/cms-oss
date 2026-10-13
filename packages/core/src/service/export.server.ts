import "server-only";

import type { InferSelectModel } from "drizzle-orm";

import { scopes } from "#core/db/schema";
import { toPublishedNewsDto, toScopeDto, toTagDto } from "#core/dto";
import { CmsError } from "#core/errors";
import { CmsRepository } from "#core/repository.server";
import {
	dataExportSchema,
	dataExportScopeSchema,
	dataExportTagSchema,
	dataExportTranslationSchema,
	type DataExport,
} from "#core/types";

type ScopeRecord = InferSelectModel<typeof scopes>;

export class DataExportService {
	constructor(private readonly repository: CmsRepository) {}

	async exportAll(): Promise<DataExport> {
		return this.createExport(await this.repository.listScopes());
	}

	async exportScope(scopeId: string): Promise<DataExport> {
		const scope = await this.repository.findScopeById(scopeId);
		if (!scope) throw new CmsError("not_found", "Scope was not found.");
		return this.createExport([scope], scopeId);
	}

	private async createExport(scopes: ScopeRecord[], scopeId?: string): Promise<DataExport> {
		const [news, tags] = await Promise.all([
			this.repository.listForExport(scopeId),
			this.repository.listTagsForExport(scopeId),
		]);
		const tagsByScope = new Map<string, typeof tags>();
		for (const item of tags) {
			const scopeTags = tagsByScope.get(item.scopeId);
			if (scopeTags) scopeTags.push(item);
			else tagsByScope.set(item.scopeId, [item]);
		}
		const newsByScope = new Map<string, typeof news>();
		for (const item of news) {
			const scopeNews = newsByScope.get(item.scope.id);
			if (scopeNews) scopeNews.push(item);
			else newsByScope.set(item.scope.id, [item]);
		}
		const exportedAt = new Date().toISOString();

		return dataExportSchema.parse(
			[...scopes]
				.sort((left, right) => left.year - right.year || left.site.localeCompare(right.site))
				.map((scope) => {
					const scopeDto = toScopeDto(scope);
					return {
						version: 1,
						exportedAt,
						scope: dataExportScopeSchema.parse({
							year: scopeDto.year,
							site: scopeDto.site,
							name: scopeDto.name,
							availableLanguages: scopeDto.availableLanguages,
							defaultLanguage: scopeDto.defaultLanguage,
						}),
						tags: (tagsByScope.get(scope.id) ?? []).map(({ tag }) => {
							const tagDto = toTagDto(tag);
							return dataExportTagSchema.parse({ name: tagDto.name, slug: tagDto.slug });
						}),
						news: (newsByScope.get(scope.id) ?? []).map((item) => ({
							slug: item.parent.slug,
							tags: item.tags.map((tag) => tag.slug),
							translations: item.translations.map((translation) => {
								const translationDto = toPublishedNewsDto(
									item.parent,
									translation,
									item.tags,
									item.scope,
								);
								return dataExportTranslationSchema.parse({
									lang: translationDto.lang,
									title: translationDto.title,
									summary: translationDto.summary,
									contentType: translationDto.contentType,
									content: translationDto.content,
									status: translationDto.status,
									publishedAt: translationDto.publishedAt,
								});
							}),
						})),
					};
				}),
		);
	}
}
