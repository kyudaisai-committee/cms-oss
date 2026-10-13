import "server-only";

import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import type { Database } from "#core/db.server";
import { scopes } from "#core/db/schema";
import { toScopeDto } from "#core/dto";
import { CmsRepository } from "#core/repository.server";
import type {
	AdminNewsDto,
	AdminNewsListOptions,
	AdminNewsPage,
	AssetDto,
	AuditDto,
	CmsActor,
	CreateAssetInput,
	CreateNewsInput,
	CreateNewsTranslationInput,
	CreateTagInput,
	DataImportCommitRequest,
	DataImportRequest,
	DataImportResult,
	DataImportPreviewResponse,
	NewsListOptions,
	PublishedNewsDto,
	PublishedNewsPage,
	PublishNewsInput,
	ScopeDto,
	ScopeRef,
	TagDto,
	UpdateNewsInput,
	UpdateNewsTranslationInput,
	UpdateTagInput,
} from "#core/types";

import { AssetService } from "./service/asset.server";
import { AuditService } from "./service/audit.server";
import { DataExportService } from "./service/export.server";
import { DataImportService } from "./service/import.server";
import { NewsService } from "./service/news.server";
import { ScopeService } from "./service/scope.server";
import { TagService } from "./service/tag.server";

type ScopeRecord = InferSelectModel<typeof scopes>;

export class CmsService {
	private readonly dataExport: DataExportService;
	private readonly dataImport: DataImportService;
	private readonly news: NewsService;
	private readonly tags: TagService;
	private readonly assets: AssetService;
	private readonly audit: AuditService;

	constructor(
		database: Database,
		actor: CmsActor,
		private readonly scope: ScopeRecord,
	) {
		const repository = new CmsRepository(database);
		this.dataExport = new DataExportService(repository);
		this.dataImport = new DataImportService(repository, actor, scope);
		this.news = new NewsService(repository, actor, scope);
		this.tags = new TagService(repository, actor, scope);
		this.assets = new AssetService(repository, actor, scope);
		this.audit = new AuditService(repository, scope);
	}

	static async exportAll(database: Database) {
		return new DataExportService(new CmsRepository(database)).exportAll();
	}

	async exportScope() {
		return this.dataExport.exportScope(this.scope.id);
	}

	async previewDataImport(input: DataImportRequest): Promise<DataImportPreviewResponse> {
		return this.dataImport.preview(input);
	}

	async importData(input: DataImportCommitRequest): Promise<DataImportResult> {
		return this.dataImport.import(input);
	}

	static async ensureScope(
		database: Database,
		actor: CmsActor,
		ref: ScopeRef,
		name?: string,
		availableLanguages?: string[],
		defaultLanguage?: string,
	): Promise<ScopeDto> {
		return ScopeService.ensureScope(
			database,
			actor,
			ref,
			name,
			availableLanguages,
			defaultLanguage,
		);
	}

	static async listScopes(database: Database) {
		return ScopeService.listScopes(database);
	}

	static async updateScope(
		database: Database,
		actor: CmsActor,
		ref: ScopeRef,
		values: {
			name?: string | undefined;
			availableLanguages?: string[] | undefined;
			defaultLanguage?: string | undefined;
		},
	): Promise<ScopeDto> {
		return ScopeService.updateScope(database, actor, ref, values);
	}

	get scopeDto() {
		return toScopeDto(this.scope);
	}

	async listPublishedNews(options: NewsListOptions = {}): Promise<PublishedNewsPage> {
		return this.news.listPublishedNews(options);
	}

	async getPublishedNews(slug: string, lang?: string): Promise<PublishedNewsDto> {
		return this.news.getPublishedNews(slug, lang);
	}

	async listAdminNews(options: AdminNewsListOptions = {}): Promise<AdminNewsPage> {
		return this.news.listAdminNews(options);
	}

	async getAdminNews(id: string, lang?: string): Promise<AdminNewsDto> {
		return this.news.getAdminNews(id, lang);
	}

	async createNews(input: CreateNewsInput): Promise<AdminNewsDto> {
		return this.news.createNews(input);
	}

	async updateNews(id: string, input: UpdateNewsInput): Promise<AdminNewsDto> {
		return this.news.updateNews(id, input);
	}

	async createNewsTranslation(
		id: string,
		lang: string,
		input: CreateNewsTranslationInput,
	): Promise<AdminNewsDto> {
		return this.news.createNewsTranslation(id, lang, input);
	}

	async updateNewsTranslation(
		id: string,
		lang: string,
		input: UpdateNewsTranslationInput,
	): Promise<AdminNewsDto> {
		return this.news.updateNewsTranslation(id, lang, input);
	}

	async publishNewsTranslation(id: string, lang: string, input: PublishNewsInput = {}) {
		return this.news.publishNewsTranslation(id, lang, input);
	}

	async unpublishNewsTranslation(id: string, lang: string) {
		return this.news.unpublishNewsTranslation(id, lang);
	}

	async deleteNews(id: string) {
		return this.news.deleteNews(id);
	}

	async publishNews(id: string, input: PublishNewsInput = {}) {
		return this.news.publishNews(id, input);
	}

	async unpublishNews(id: string) {
		return this.news.unpublishNews(id);
	}

	async listTags(): Promise<TagDto[]> {
		return this.tags.listTags();
	}

	async createTag(input: CreateTagInput): Promise<TagDto> {
		return this.tags.createTag(input);
	}

	async updateTag(id: string, input: UpdateTagInput): Promise<TagDto> {
		return this.tags.updateTag(id, input);
	}

	async deleteTag(id: string) {
		return this.tags.deleteTag(id);
	}

	async listAssets(): Promise<AssetDto[]> {
		return this.assets.listAssets();
	}

	async createAsset(input: CreateAssetInput): Promise<AssetDto> {
		return this.assets.createAsset(input);
	}

	async getAsset(id: string): Promise<AssetDto> {
		return this.assets.getAsset(id);
	}

	async deleteAsset(id: string) {
		return this.assets.deleteAsset(id);
	}

	async listAuditLogs(): Promise<AuditDto[]> {
		return this.audit.listAuditLogs();
	}
}

export function getCmsService(database: Database, actor: CmsActor, scope: ScopeRecord) {
	return new CmsService(database, actor, scope);
}

export type CmsScopeInsert = InferInsertModel<typeof scopes>;
