import "server-only";

import type { InferSelectModel } from "drizzle-orm";

import { decodeCursor } from "#core/cursor";
import { news, newsTranslations, scopes } from "#core/db/schema";
import { toAdminNewsDto, toNewsSummaryDto, toPublishedNewsDto } from "#core/dto";
import { CmsError } from "#core/errors";
import {
	normalizeCreateNewsInput,
	normalizeCreateNewsTranslationInput,
	canonicalizeStoredLanguage,
	normalizeLimit,
	normalizeSlug,
	normalizeUpdateNewsInput,
	normalizeUpdateNewsTranslationInput,
} from "#core/input";
import { CmsRepository, isUniqueConstraintError, type NewsWithTags } from "#core/repository.server";
import type {
	AdminNewsDto,
	AdminNewsListOptions,
	AdminNewsPage,
	NewsListOptions,
	CmsActor,
	CreateNewsInput,
	CreateNewsTranslationInput,
	PublishedNewsDto,
	PublishedNewsPage,
	PublishNewsInput,
	UpdateNewsInput,
	UpdateNewsTranslationInput,
	AuditEntry,
} from "#core/types";

import {
	actorValue,
	changesForNews,
	requireNews,
	scopeLanguage,
	scopeValue,
	tagIdsFromRows,
	translationSummary,
} from "./news-shared.server";

type ScopeRecord = InferSelectModel<typeof scopes>;
type NewsRecord = InferSelectModel<typeof news>;
type NewsTranslationRecord = InferSelectModel<typeof newsTranslations>;
export class NewsService {
	constructor(
		private readonly repository: CmsRepository,
		private readonly actor: CmsActor,
		private readonly scope: ScopeRecord,
	) {}

	async listPublishedNews(options: NewsListOptions = {}): Promise<PublishedNewsPage> {
		const limit = normalizeLimit(options.limit);
		const tagSlug = options.tagSlug ? normalizeSlug(options.tagSlug, "tag") : undefined;
		const lang = scopeLanguage(this.scope, options.lang);
		const page = await this.repository.listPublished(
			this.scope.id,
			limit,
			decodeCursor(options.cursor),
			tagSlug,
			lang,
		);
		return {
			items: page.items.map(({ parent, translation, tags, scope }) =>
				toNewsSummaryDto(parent, translation, tags, scopeValue(scope)),
			),
			nextCursor: page.nextCursor,
		};
	}

	async getPublishedNews(slug: string, lang?: string): Promise<PublishedNewsDto> {
		const normalizedLang = scopeLanguage(this.scope, lang);
		const result = await this.repository.findPublishedBySlug(
			this.scope.id,
			normalizeSlug(slug),
			normalizedLang,
		);
		if (!result) throw new CmsError("not_found", "News was not found.");
		return toPublishedNewsDto(
			result.parent,
			result.translation,
			result.tags,
			scopeValue(result.scope),
		);
	}

	async listAdminNews(options: AdminNewsListOptions = {}): Promise<AdminNewsPage> {
		const limit = normalizeLimit(options.limit);
		const pageNumber = options.page;
		if (pageNumber !== undefined && (!Number.isSafeInteger(pageNumber) || pageNumber < 1)) {
			throw new CmsError("validation", "page must be a positive integer.");
		}
		const tagSlug = options.tagSlug ? normalizeSlug(options.tagSlug, "tag") : undefined;
		const lang = options.lang ? scopeLanguage(this.scope, options.lang) : undefined;
		const search = options.search?.trim() || undefined;
		const page = await this.repository.listAdmin(
			this.scope.id,
			limit,
			decodeCursor(pageNumber === undefined ? options.cursor : undefined),
			tagSlug,
			lang,
			search,
			pageNumber,
		);
		return {
			items: page.items.map(({ parent, translation, tags, scope, translations }) =>
				toAdminNewsDto(
					parent,
					translation,
					tags,
					scopeValue(scope),
					translationSummary(translations),
				),
			),
			nextCursor: page.nextCursor,
			...(page.totalCount === undefined ? {} : { totalCount: page.totalCount }),
		};
	}

	async getAdminNews(id: string, lang?: string): Promise<AdminNewsDto> {
		const normalizedLang = lang === undefined ? undefined : scopeLanguage(this.scope, lang);
		const result = await requireNews(this.repository, this.scope.id, id, normalizedLang);
		return toAdminNewsDto(
			result.parent,
			result.translation,
			result.tags,
			scopeValue(result.scope),
			translationSummary(result.translations),
		);
	}

	async createNews(input: CreateNewsInput): Promise<AdminNewsDto> {
		const normalized = normalizeCreateNewsInput(input, this.scope.defaultLanguage);
		if (
			!this.scope.availableLanguages.some(
				(lang) => canonicalizeStoredLanguage(lang) === normalized.lang,
			)
		) {
			throw new CmsError("validation", "lang is not available in this scope.");
		}
		const tagRows = await this.repository.findTagsByIds(this.scope.id, normalized.tagIds);
		tagIdsFromRows(tagRows, normalized.tagIds);
		const existingParent = await this.repository.findNewsParentBySlug(
			this.scope.id,
			normalized.slug,
		);
		if (existingParent)
			throw new CmsError("conflict", "News slug is already in use in this scope.");
		const now = new Date();
		const newsItem: NewsRecord = {
			id: crypto.randomUUID(),
			scopeId: this.scope.id,
			slug: normalized.slug,
			createdAt: now,
			updatedAt: now,
			deletedAt: null,
			createdBy: actorValue(this.actor),
			updatedBy: actorValue(this.actor),
		};
		const translation: NewsTranslationRecord = {
			id: crypto.randomUUID(),
			newsId: newsItem.id,
			lang: normalized.lang,
			title: normalized.title,
			summary: normalized.summary,
			content: normalized.content,
			contentType: normalized.contentType,
			status: "draft",
			publishedAt: normalized.publishedAt,
			createdAt: now,
			updatedAt: now,
			deletedAt: null,
			createdBy: actorValue(this.actor),
			updatedBy: actorValue(this.actor),
		};
		try {
			await this.repository.insertNewsWithTranslation(newsItem, translation, normalized.tagIds, [
				{
					actor: this.actor,
					action: "news.create",
					entityType: "news",
					entityId: newsItem.id,
					scopeId: this.scope.id,
					changes: { after: changesForNews(newsItem) },
					createdAt: now,
				},
				{
					actor: this.actor,
					action: "news.translation.create",
					entityType: "news_translation",
					entityId: translation.id,
					scopeId: this.scope.id,
					changes: { after: translationSummary([translation]) },
					createdAt: now,
				},
			]);
		} catch (error) {
			if (isUniqueConstraintError(error))
				throw new CmsError("conflict", "News slug is already in use in this scope.");
			throw error;
		}
		return this.getAdminNews(newsItem.id);
	}

	async updateNews(id: string, input: UpdateNewsInput): Promise<AdminNewsDto> {
		const existing = await requireNews(this.repository, this.scope.id, id);
		const normalized = normalizeUpdateNewsInput(input);
		let updatedTranslationLang: string | undefined;
		if (normalized.tagIds !== undefined) {
			const tagRows = await this.repository.findTagsByIds(this.scope.id, normalized.tagIds);
			tagIdsFromRows(tagRows, normalized.tagIds);
		}
		const targetSlug = normalized.slug ?? existing.parent.slug;
		if (normalized.slug !== undefined) {
			const conflict = await this.repository.findNewsParentBySlug(this.scope.id, targetSlug);
			if (conflict && conflict.parent.id !== existing.parent.id) {
				throw new CmsError("conflict", "News slug is already in use in this scope.");
			}
		}
		const now = new Date();
		const parentValues: Partial<NewsRecord> = {
			updatedAt: now,
			updatedBy: actorValue(this.actor),
		};
		if (normalized.slug !== undefined) parentValues.slug = normalized.slug;
		const hasTranslationChanges =
			normalized.title !== undefined ||
			normalized.summary !== undefined ||
			normalized.content !== undefined ||
			normalized.contentType !== undefined ||
			normalized.publishedAt !== undefined ||
			normalized.lang !== undefined;
		if (hasTranslationChanges) {
			const targetLang =
				normalized.lang ??
				canonicalizeStoredLanguage(existing.translation.lang) ??
				existing.translation.lang;
			updatedTranslationLang = targetLang;
			if (
				!this.scope.availableLanguages.some(
					(lang) => canonicalizeStoredLanguage(lang) === targetLang,
				)
			) {
				throw new CmsError("validation", "lang is not available in this scope.");
			}
			const translation = await this.repository.findTranslation(existing.parent.id, targetLang);
			if (!translation) throw new CmsError("not_found", "News translation was not found.");
			if (normalized.lang && normalized.lang !== canonicalizeStoredLanguage(translation.lang)) {
				const targetTranslation = await this.repository.findTranslation(
					existing.parent.id,
					normalized.lang,
				);
				if (targetTranslation) throw new CmsError("conflict", "News translation already exists.");
			}
			const translationValues: Partial<NewsTranslationRecord> = {
				updatedAt: now,
				updatedBy: actorValue(this.actor),
			};
			if (normalized.title !== undefined) translationValues.title = normalized.title;
			if (normalized.summary !== undefined) translationValues.summary = normalized.summary;
			if (normalized.content !== undefined) translationValues.content = normalized.content;
			if (normalized.contentType !== undefined)
				translationValues.contentType = normalized.contentType;
			if (normalized.publishedAt !== undefined)
				translationValues.publishedAt = normalized.publishedAt;
			if (normalized.lang !== undefined) translationValues.lang = normalized.lang;
			await this.repository.updateTranslationAndParent(
				translation.id,
				existing.parent.id,
				translationValues,
				parentValues,
				{
					actor: this.actor,
					action: "news.translation.update",
					entityType: "news_translation",
					entityId: translation.id,
					scopeId: this.scope.id,
					changes: {
						before: changesForNews(existing.parent, translation),
						after: translationValues,
					},
					createdAt: now,
				},
			);
		}
		if (normalized.slug !== undefined || normalized.tagIds !== undefined) {
			const parentAudit: AuditEntry = {
				actor: this.actor,
				action: "news.update",
				entityType: "news",
				entityId: existing.parent.id,
				scopeId: this.scope.id,
				changes: {
					before: changesForNews(existing.parent),
					after: parentValues,
				},
				createdAt: now,
			};
			await this.repository.updateNews(
				existing.parent.id,
				hasTranslationChanges ? {} : parentValues,
				normalized.tagIds,
				parentAudit,
			);
		}
		return this.getAdminNews(id, updatedTranslationLang);
	}

	async createNewsTranslation(
		id: string,
		lang: string,
		input: CreateNewsTranslationInput,
	): Promise<AdminNewsDto> {
		const existing = await requireNews(this.repository, this.scope.id, id);
		const normalizedLang = scopeLanguage(this.scope, lang);
		if (await this.repository.findTranslation(existing.parent.id, normalizedLang)) {
			throw new CmsError("conflict", "News translation already exists.");
		}
		const normalized = normalizeCreateNewsTranslationInput(input);
		const now = new Date();
		const translation: NewsTranslationRecord = {
			id: crypto.randomUUID(),
			newsId: existing.parent.id,
			lang: normalizedLang,
			title: normalized.title,
			summary: normalized.summary,
			content: normalized.content,
			contentType: normalized.contentType,
			status: "draft",
			publishedAt: normalized.publishedAt,
			createdAt: now,
			updatedAt: now,
			deletedAt: null,
			createdBy: actorValue(this.actor),
			updatedBy: actorValue(this.actor),
		};
		try {
			await this.repository.insertTranslationAndParent(
				translation,
				existing.parent.id,
				{
					updatedAt: now,
					updatedBy: actorValue(this.actor),
				},
				{
					actor: this.actor,
					action: "news.translation.create",
					entityType: "news_translation",
					entityId: translation.id,
					scopeId: this.scope.id,
					changes: { after: translationSummary([translation]) },
					createdAt: now,
				},
			);
		} catch (error) {
			if (isUniqueConstraintError(error))
				throw new CmsError("conflict", "News translation already exists.");
			throw error;
		}
		return this.getAdminNews(existing.parent.id, normalizedLang);
	}

	async updateNewsTranslation(
		id: string,
		lang: string,
		input: UpdateNewsTranslationInput,
	): Promise<AdminNewsDto> {
		const existing = await requireNews(this.repository, this.scope.id, id);
		const normalizedLang = scopeLanguage(this.scope, lang);
		const translation = await this.repository.findTranslation(existing.parent.id, normalizedLang);
		if (!translation) throw new CmsError("not_found", "News translation was not found.");
		const normalized = normalizeUpdateNewsTranslationInput(input);
		const now = new Date();
		const values: Partial<NewsTranslationRecord> = {
			updatedAt: now,
			updatedBy: actorValue(this.actor),
		};
		if (normalized.title !== undefined) values.title = normalized.title;
		if (normalized.summary !== undefined) values.summary = normalized.summary;
		if (normalized.content !== undefined) values.content = normalized.content;
		if (normalized.contentType !== undefined) values.contentType = normalized.contentType;
		if (normalized.publishedAt !== undefined) values.publishedAt = normalized.publishedAt;
		await this.repository.updateTranslationAndParent(
			translation.id,
			existing.parent.id,
			values,
			{
				updatedAt: now,
				updatedBy: actorValue(this.actor),
			},
			{
				actor: this.actor,
				action: "news.translation.update",
				entityType: "news_translation",
				entityId: translation.id,
				scopeId: this.scope.id,
				changes: { before: translation, after: { ...translation, ...values } },
				createdAt: now,
			},
		);
		return this.getAdminNews(existing.parent.id, normalizedLang);
	}

	async publishNewsTranslation(id: string, lang: string, input: PublishNewsInput = {}) {
		const existing = await requireNews(this.repository, this.scope.id, id);
		const normalizedLang = scopeLanguage(this.scope, lang);
		const translation = await this.repository.findTranslation(existing.parent.id, normalizedLang);
		if (!translation) throw new CmsError("not_found", "News translation was not found.");
		return this.publishTranslation({ ...existing, translation }, input);
	}

	async unpublishNewsTranslation(id: string, lang: string) {
		const existing = await requireNews(this.repository, this.scope.id, id);
		const normalizedLang = scopeLanguage(this.scope, lang);
		const translation = await this.repository.findTranslation(existing.parent.id, normalizedLang);
		if (!translation) throw new CmsError("not_found", "News translation was not found.");
		return this.unpublishTranslation({ ...existing, translation });
	}

	async deleteNews(id: string) {
		const existing = await requireNews(this.repository, this.scope.id, id);
		await this.repository.deleteNews(existing.parent.id, {
			actor: this.actor,
			action: "news.delete",
			entityType: "news",
			entityId: existing.parent.id,
			scopeId: this.scope.id,
			changes: { before: changesForNews(existing.parent, existing.translation) },
			createdAt: new Date(),
		});
	}

	async publishNews(id: string, input: PublishNewsInput = {}) {
		const existing = await requireNews(this.repository, this.scope.id, id);
		return this.publishTranslation(existing, input);
	}

	private async publishTranslation(existing: NewsWithTags, input: PublishNewsInput) {
		const translation = existing.translation;
		const publishedAt =
			input.publishedAt === undefined
				? (translation.publishedAt ?? new Date())
				: new Date(input.publishedAt);
		if (Number.isNaN(publishedAt.getTime()))
			throw new CmsError("validation", "publishedAt must be a valid ISO date.");
		const now = new Date();
		const after = {
			...changesForNews(existing.parent, translation),
			status: "published",
			publishedAt: publishedAt.toISOString(),
			updatedAt: now.toISOString(),
			updatedBy: actorValue(this.actor),
		};
		await this.repository.updateTranslationAndParent(
			translation.id,
			existing.parent.id,
			{ status: "published", publishedAt, updatedAt: now, updatedBy: actorValue(this.actor) },
			{ updatedAt: now, updatedBy: actorValue(this.actor) },
			{
				actor: this.actor,
				action: "news.translation.publish",
				entityType: "news_translation",
				entityId: translation.id,
				scopeId: this.scope.id,
				changes: { before: changesForNews(existing.parent, translation), after },
				createdAt: now,
			},
		);
		return this.getAdminNews(
			existing.parent.id,
			canonicalizeStoredLanguage(translation.lang) ?? translation.lang,
		);
	}

	async unpublishNews(id: string) {
		const existing = await requireNews(this.repository, this.scope.id, id);
		return this.unpublishTranslation(existing);
	}

	private async unpublishTranslation(existing: NewsWithTags) {
		const translation = existing.translation;
		const now = new Date();
		const changes = {
			before: changesForNews(existing.parent, translation),
			after: {
				...changesForNews(existing.parent, translation),
				status: "draft",
				publishedAt: null,
				updatedAt: now.toISOString(),
				updatedBy: actorValue(this.actor),
			},
		};
		await this.repository.updateTranslationAndParent(
			translation.id,
			existing.parent.id,
			{ status: "draft", publishedAt: null, updatedAt: now, updatedBy: actorValue(this.actor) },
			{ updatedAt: now, updatedBy: actorValue(this.actor) },
			{
				actor: this.actor,
				action: "news.translation.unpublish",
				entityType: "news_translation",
				entityId: translation.id,
				scopeId: this.scope.id,
				changes,
				createdAt: now,
			},
		);
		return this.getAdminNews(
			existing.parent.id,
			canonicalizeStoredLanguage(translation.lang) ?? translation.lang,
		);
	}
}
