import type { ClientResponse } from "hono/client";
import { z } from "zod";

import { apiBasePath, createApiClient } from "@repo/api/client";
import {
	apiEnvelopeSchema,
	apiErrorEnvelopeSchema,
	assetUploadInputSchema,
} from "@repo/api/contracts";
import type { AdminNewsQuery } from "@repo/api/contracts";
import {
	adminNewsDtoSchema,
	adminNewsPageSchema,
	assetDtoSchema,
	createNewsInputSchema,
	createNewsTranslationInputSchema,
	createTagInputSchema,
	dataImportCommitRequestSchema,
	dataImportPreviewResponseSchema,
	dataImportRequestSchema,
	dataImportResultSchema,
	publishNewsInputSchema,
	scopeDtoSchema,
	tagDtoSchema,
	updateNewsInputSchema,
	updateNewsTranslationInputSchema,
	updateTagInputSchema,
} from "@repo/core/types";
import type {
	AdminNewsDto,
	AdminNewsPage,
	AssetDto,
	CreateNewsInput,
	CreateNewsTranslationInput,
	CreateTagInput,
	DataImportCommitRequest,
	DataImportPreviewResponse,
	DataImportRequest,
	DataImportResult,
	ScopeRef,
	ScopeDto,
	TagDto,
	UpdateNewsInput,
	UpdateNewsTranslationInput,
	UpdateTagInput,
} from "@repo/core/types";

const api = createApiClient();

function scopedApi() {
	return api.admin[":year"][":site"];
}

function rootScopedApi() {
	return api[":year"][":site"];
}

export class CmsApiError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "CmsApiError";
		this.status = status;
	}
}

function getErrorMessage(payload: unknown) {
	const parsed = apiErrorEnvelopeSchema.safeParse(payload);
	return parsed.success ? parsed.data.error.message : "APIリクエストに失敗しました。";
}

async function readEnvelope<T>(
	response: ClientResponse<unknown>,
	schema: z.ZodType<T>,
): Promise<T> {
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new CmsApiError(response.status, "APIの応答を読み取れませんでした。");
	}
	if (!response.ok) throw new CmsApiError(response.status, getErrorMessage(payload));
	const parsed = apiEnvelopeSchema(schema).safeParse(payload);
	if (!parsed.success) throw new CmsApiError(response.status, "APIの応答形式が不正です。");
	return parsed.data.data;
}

function scopeParams(scope: ScopeRef) {
	return {
		year: String(scope.year),
		site: scope.site,
	};
}

export async function fetchScopes(): Promise<ScopeDto[]> {
	return readEnvelope(await api.scopes.$get(), scopeDtoSchema.array());
}

export async function downloadDataExport(scope?: ScopeRef): Promise<Blob> {
	const response = scope
		? await scopedApi().export.$get({ param: scopeParams(scope) })
		: await api.admin.export.$get();
	if (!response.ok) {
		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			throw new CmsApiError(response.status, "APIの応答を読み取れませんでした。");
		}
		throw new CmsApiError(response.status, getErrorMessage(payload));
	}
	return response.blob();
}

export async function previewDataImport(
	scope: ScopeRef,
	input: DataImportRequest,
): Promise<DataImportPreviewResponse> {
	return readEnvelope(
		await scopedApi().import.preview.$post({
			param: scopeParams(scope),
			json: dataImportRequestSchema.parse(input),
		}),
		dataImportPreviewResponseSchema,
	);
}

export async function executeDataImport(
	scope: ScopeRef,
	input: DataImportCommitRequest,
): Promise<DataImportResult> {
	return readEnvelope(
		await scopedApi().import.$post({
			param: scopeParams(scope),
			json: dataImportCommitRequestSchema.parse(input),
		}),
		dataImportResultSchema,
	);
}

export async function fetchNewsList(
	scope: ScopeRef,
	options: AdminNewsQuery = {},
): Promise<AdminNewsPage> {
	return readEnvelope(
		await scopedApi().news.$get({
			param: scopeParams(scope),
			query: {
				cursor: options.cursor,
				lang: options.lang,
				limit: options.limit === undefined ? undefined : String(options.limit),
				search: options.search?.trim() || undefined,
				tag: options.tag,
			},
		}),
		adminNewsPageSchema,
	);
}

export async function fetchTags(scope: ScopeRef): Promise<TagDto[]> {
	return readEnvelope(
		await scopedApi().tags.$get({ param: scopeParams(scope) }),
		tagDtoSchema.array(),
	);
}

export async function fetchNews(scope: ScopeRef, id: string, lang?: string): Promise<AdminNewsDto> {
	return readEnvelope(
		await scopedApi().news[":id"].$get({
			param: { ...scopeParams(scope), id },
			query: lang ? { lang } : {},
		}),
		adminNewsDtoSchema,
	);
}

export async function createNews(scope: ScopeRef, input: CreateNewsInput): Promise<AdminNewsDto> {
	return readEnvelope(
		await scopedApi().news.$post({
			param: scopeParams(scope),
			json: createNewsInputSchema.parse(input),
		}),
		adminNewsDtoSchema,
	);
}

export async function updateNewsParent(
	scope: ScopeRef,
	id: string,
	input: Pick<UpdateNewsInput, "slug" | "tagIds">,
): Promise<AdminNewsDto> {
	return readEnvelope(
		await scopedApi().news[":id"].$patch({
			param: { ...scopeParams(scope), id },
			json: updateNewsInputSchema.parse(input),
		}),
		adminNewsDtoSchema,
	);
}

export async function createNewsTranslation(
	scope: ScopeRef,
	id: string,
	lang: string,
	input: CreateNewsTranslationInput,
): Promise<AdminNewsDto> {
	return readEnvelope(
		await scopedApi().news[":id"].translations[":lang"].$put({
			param: { ...scopeParams(scope), id, lang },
			json: createNewsTranslationInputSchema.parse(input),
		}),
		adminNewsDtoSchema,
	);
}

export async function updateNewsTranslation(
	scope: ScopeRef,
	id: string,
	lang: string,
	input: UpdateNewsTranslationInput,
): Promise<AdminNewsDto> {
	return readEnvelope(
		await scopedApi().news[":id"].translations[":lang"].$patch({
			param: { ...scopeParams(scope), id, lang },
			json: updateNewsTranslationInputSchema.parse(input),
		}),
		adminNewsDtoSchema,
	);
}

export async function publishNewsTranslation(
	scope: ScopeRef,
	id: string,
	lang: string,
	publishedAt?: string,
): Promise<AdminNewsDto> {
	return readEnvelope(
		await scopedApi().news[":id"].translations[":lang"].publish.$post({
			param: { ...scopeParams(scope), id, lang },
			json: publishNewsInputSchema.parse(publishedAt ? { publishedAt } : {}),
		}),
		adminNewsDtoSchema,
	);
}

export async function unpublishNewsTranslation(
	scope: ScopeRef,
	id: string,
	lang: string,
): Promise<AdminNewsDto> {
	return readEnvelope(
		await scopedApi().news[":id"].translations[":lang"].unpublish.$post({
			param: { ...scopeParams(scope), id, lang },
		}),
		adminNewsDtoSchema,
	);
}

export async function deleteNews(scope: ScopeRef, id: string): Promise<void> {
	const response = await scopedApi().news[":id"].$delete({
		param: { ...scopeParams(scope), id },
	});
	if (!response.ok) {
		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			throw new CmsApiError(response.status, "お知らせを削除できませんでした。");
		}
		throw new CmsApiError(response.status, getErrorMessage(payload));
	}
}

export async function createTag(scope: ScopeRef, input: CreateTagInput): Promise<TagDto> {
	return readEnvelope(
		await scopedApi().tags.$post({
			param: scopeParams(scope),
			json: createTagInputSchema.parse(input),
		}),
		tagDtoSchema,
	);
}

export async function updateTag(
	scope: ScopeRef,
	id: string,
	input: UpdateTagInput,
): Promise<TagDto> {
	return readEnvelope(
		await scopedApi().tags[":id"].$patch({
			param: { ...scopeParams(scope), id },
			json: updateTagInputSchema.parse(input),
		}),
		tagDtoSchema,
	);
}

export async function deleteTag(scope: ScopeRef, id: string): Promise<void> {
	const response = await scopedApi().tags[":id"].$delete({
		param: { ...scopeParams(scope), id },
	});
	if (!response.ok) throw new CmsApiError(response.status, "タグを削除できませんでした。");
}

export async function uploadAsset(scope: ScopeRef, file: File): Promise<AssetDto> {
	return readEnvelope(
		await scopedApi().assets.$post({
			param: scopeParams(scope),
			form: assetUploadInputSchema.parse({ file }),
		}),
		assetDtoSchema,
	);
}

export function getAssetPath(scope: ScopeRef, id: string) {
	return (
		apiBasePath + rootScopedApi().assets[":id"].$path({ param: { ...scopeParams(scope), id } })
	);
}
