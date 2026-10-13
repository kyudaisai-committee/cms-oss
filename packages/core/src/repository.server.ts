import "server-only";

import type { InferSelectModel } from "drizzle-orm";

import type { Database } from "#core/db.server";
import { assets, news, newsTranslations, scopes, tags } from "#core/db/schema";
import type { AuditEntry, ScopeRef } from "#core/types";

import { AssetRepository } from "./repository/asset.server";
import { AuditRepository } from "./repository/audit.server";
import { DataImportRepository } from "./repository/import.server";
import type { DataImportWriteSet } from "./repository/import.server";
import { NewsReadRepository } from "./repository/news/read.server";
import { NewsWriteRepository } from "./repository/news/write.server";
import { ScopeRepository } from "./repository/scope.server";
import { TagRepository } from "./repository/tag.server";

export type {
	NewsForExport,
	NewsPage,
	NewsWithTags,
	ScopeWithId,
	TagForExport,
} from "./repository/types";

type ScopeRecord = InferSelectModel<typeof scopes>;
type NewsRecord = InferSelectModel<typeof news>;
type NewsTranslationRecord = InferSelectModel<typeof newsTranslations>;
type TagRecord = InferSelectModel<typeof tags>;
type AssetRecord = InferSelectModel<typeof assets>;

export function isUniqueConstraintError(error: unknown) {
	return error instanceof Error && /unique constraint failed/i.test(error.message);
}

export class CmsRepository {
	private readonly audit: AuditRepository;
	private readonly assets: AssetRepository;
	private readonly dataImport: DataImportRepository;
	private readonly newsReader: NewsReadRepository;
	private readonly newsWriter: NewsWriteRepository;
	private readonly scopes: ScopeRepository;
	private readonly tags: TagRepository;

	constructor(database: Database) {
		this.audit = new AuditRepository(database);
		this.assets = new AssetRepository(database);
		this.dataImport = new DataImportRepository(database);
		this.newsReader = new NewsReadRepository(database);
		this.newsWriter = new NewsWriteRepository(database);
		this.scopes = new ScopeRepository(database);
		this.tags = new TagRepository(database);
	}

	async listScopes() {
		return this.scopes.listScopes();
	}

	async listForExport(scopeId?: string) {
		return this.newsReader.listForExport(scopeId);
	}

	async listTagsForExport(scopeId?: string) {
		return this.tags.listForExport(scopeId);
	}

	async readImportTarget(scopeId: string) {
		return this.dataImport.readTarget(scopeId);
	}

	async writeImport(writeSet: DataImportWriteSet) {
		return this.dataImport.writeImport(writeSet);
	}

	async findScope(scope: ScopeRef) {
		return this.scopes.findScope(scope);
	}

	async findScopeById(id: string) {
		return this.scopes.findScopeById(id);
	}

	async insertScope(scope: ScopeRecord, audit?: AuditEntry) {
		return this.scopes.insertScope(scope, audit);
	}

	async updateScope(id: string, values: Partial<ScopeRecord>, audit?: AuditEntry) {
		return this.scopes.updateScope(id, values, audit);
	}

	async countTranslationsByLanguage(scopeId: string, lang: string) {
		return this.scopes.countTranslationsByLanguage(scopeId, lang);
	}

	async findPublishedBySlug(scopeId: string, slug: string, lang = "ja", now = new Date()) {
		return this.newsReader.findPublishedBySlug(scopeId, slug, lang, now);
	}

	async findNewsBySlug(scopeId: string, slug: string, lang?: string) {
		return this.newsReader.findNewsBySlug(scopeId, slug, lang);
	}

	async findNewsParentBySlug(scopeId: string, slug: string) {
		return this.newsReader.findNewsParentBySlug(scopeId, slug);
	}

	async findNewsById(scopeId: string, id: string, lang?: string) {
		return this.newsReader.findNewsById(scopeId, id, lang);
	}

	async listPublished(
		scopeId: string,
		limit: number,
		cursor: import("./cursor").TimeCursor | null,
		tagSlug?: string,
		lang?: string,
	) {
		return this.newsReader.listPublished(scopeId, limit, cursor, tagSlug, lang);
	}

	async listAdmin(
		scopeId: string,
		limit: number,
		cursor: import("./cursor").TimeCursor | null,
		tagSlug?: string,
		lang?: string,
		search?: string,
		page?: number,
	) {
		return this.newsReader.listAdmin(scopeId, limit, cursor, tagSlug, lang, search, page);
	}

	async insertNewsWithTranslation(
		newsItem: NewsRecord,
		translation: NewsTranslationRecord,
		tagIds: string[],
		audits: AuditEntry[],
	) {
		return this.newsWriter.insertNewsWithTranslation(newsItem, translation, tagIds, audits);
	}

	async insertTranslationAndParent(
		translation: NewsTranslationRecord,
		newsId: string,
		parentValues: Partial<NewsRecord>,
		audit: AuditEntry,
	) {
		return this.newsWriter.insertTranslationAndParent(translation, newsId, parentValues, audit);
	}

	async findTranslation(newsId: string, lang: string) {
		return this.newsReader.findTranslation(newsId, lang);
	}

	async listTranslations(newsId: string) {
		return this.newsReader.listTranslations(newsId);
	}

	async updateTranslationAndParent(
		translationId: string,
		newsId: string,
		translationValues: Partial<NewsTranslationRecord>,
		parentValues: Partial<NewsRecord>,
		audit: AuditEntry,
	) {
		return this.newsWriter.updateTranslationAndParent(
			translationId,
			newsId,
			translationValues,
			parentValues,
			audit,
		);
	}

	async updateNews(
		id: string,
		values: Partial<NewsRecord>,
		tagIds: string[] | undefined,
		audit: AuditEntry,
	) {
		return this.newsWriter.updateNews(id, values, tagIds, audit);
	}

	async deleteNews(id: string, audit: AuditEntry) {
		return this.newsWriter.deleteNews(id, audit);
	}

	async listTags(scopeId: string) {
		return this.tags.listTags(scopeId);
	}

	async findTagById(scopeId: string, id: string) {
		return this.tags.findTagById(scopeId, id);
	}

	async insertTag(tag: TagRecord, audit: AuditEntry) {
		return this.tags.insertTag(tag, audit);
	}

	async updateTag(id: string, values: Partial<TagRecord>, audit: AuditEntry) {
		return this.tags.updateTag(id, values, audit);
	}

	async deleteTag(id: string, audit: AuditEntry) {
		return this.tags.deleteTag(id, audit);
	}

	async findTagsByIds(scopeId: string, ids: string[]) {
		return this.tags.findTagsByIds(scopeId, ids);
	}

	async findAssetById(scopeId: string, id: string) {
		return this.assets.findAssetById(scopeId, id);
	}

	async findAssetByObjectKey(scopeId: string, objectKey: string) {
		return this.assets.findAssetByObjectKey(scopeId, objectKey);
	}

	async listAssets(scopeId: string) {
		return this.assets.listAssets(scopeId);
	}

	async insertAsset(asset: AssetRecord, audit: AuditEntry) {
		return this.assets.insertAsset(asset, audit);
	}

	async deleteAsset(id: string, audit: AuditEntry) {
		return this.assets.deleteAsset(id, audit);
	}

	async listAuditLogs(scopeId: string, limit = 100) {
		return this.audit.listAuditLogs(scopeId, limit);
	}
}
