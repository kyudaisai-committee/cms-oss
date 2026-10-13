import type { InferSelectModel } from "drizzle-orm";

import type { news, newsTranslations, assets, auditLogs, scopes, tags } from "#core/db/schema";
import { canonicalizeStoredLanguage } from "#core/input";
import {
	adminNewsDtoSchema,
	newsSummaryDtoSchema,
	assetDtoSchema,
	auditDtoSchema,
	publishedNewsDtoSchema,
	scopeDtoSchema,
	tagDtoSchema,
	type ScopeRef,
} from "#core/types";

type ScopeRecord = InferSelectModel<typeof scopes>;
type NewsRecord = InferSelectModel<typeof news>;
type NewsTranslationRecord = InferSelectModel<typeof newsTranslations>;
type TagRecord = InferSelectModel<typeof tags>;
type AssetRecord = InferSelectModel<typeof assets>;
type AuditRecord = InferSelectModel<typeof auditLogs>;

function iso(value: Date | null) {
	return value ? value.toISOString() : null;
}
function scopeRef(scope: Pick<ScopeRecord, "year" | "site">): ScopeRef {
	return {
		year: scope.year,
		site: scope.site,
	};
}

export function toScopeDto(record: ScopeRecord) {
	const availableLanguages = (record.availableLanguages ?? ["ja", "en"])
		.map(canonicalizeStoredLanguage)
		.filter((lang): lang is string => lang !== null);
	const defaultLanguage =
		canonicalizeStoredLanguage(record.defaultLanguage) ?? availableLanguages[0] ?? "ja";
	return scopeDtoSchema.parse({
		id: record.id,
		year: record.year,
		site: record.site,
		name: record.name,
		availableLanguages,
		defaultLanguage,
		createdAt: record.createdAt.toISOString(),
		updatedAt: record.updatedAt.toISOString(),
	});
}

export function toTagDto(record: TagRecord) {
	return tagDtoSchema.parse({ id: record.id, name: record.name, slug: record.slug });
}

export function toNewsSummaryDto(
	parent: NewsRecord,
	translation: NewsTranslationRecord,
	tagRecords: TagRecord[],
	scope: Pick<ScopeRecord, "year" | "site">,
) {
	return newsSummaryDtoSchema.parse({
		id: parent.id,
		scope: scopeRef(scope),
		slug: parent.slug,
		title: translation.title,
		summary: translation.summary,
		contentType: translation.contentType,
		content: translation.contentType === "link" ? translation.content : null,
		status: translation.status,
		publishedAt: iso(translation.publishedAt),
		lang: canonicalizeStoredLanguage(translation.lang) ?? translation.lang,
		createdAt: translation.createdAt.toISOString(),
		updatedAt: translation.updatedAt.toISOString(),
		tags: tagRecords.map(toTagDto),
	});
}

export function toPublishedNewsDto(
	parent: NewsRecord,
	translation: NewsTranslationRecord,
	tagRecords: TagRecord[],
	scope: Pick<ScopeRecord, "year" | "site">,
) {
	return publishedNewsDtoSchema.parse({
		id: parent.id,
		scope: scopeRef(scope),
		slug: parent.slug,
		title: translation.title,
		summary: translation.summary,
		contentType: translation.contentType,
		content: translation.content,
		status: translation.status,
		publishedAt: iso(translation.publishedAt),
		lang: canonicalizeStoredLanguage(translation.lang) ?? translation.lang,
		createdAt: translation.createdAt.toISOString(),
		updatedAt: translation.updatedAt.toISOString(),
		tags: tagRecords.map(toTagDto),
	});
}

export function toAdminNewsDto(
	parent: NewsRecord,
	translation: NewsTranslationRecord,
	tagRecords: TagRecord[],
	scope: Pick<ScopeRecord, "year" | "site">,
	translations: Array<{
		id: string;
		lang: string;
		title: string;
		status: "draft" | "published";
		publishedAt: Date | null;
	}> = [],
) {
	return adminNewsDtoSchema.parse({
		...toPublishedNewsDto(parent, translation, tagRecords, scope),
		createdBy: parent.createdBy,
		updatedBy: parent.updatedBy,
		translations: translations.map((item) => ({
			id: item.id,
			lang: canonicalizeStoredLanguage(item.lang) ?? item.lang,
			title: item.title,
			status: item.status,
			publishedAt: iso(item.publishedAt),
		})),
	});
}

export function toAssetDto(record: AssetRecord, scope: Pick<ScopeRecord, "year" | "site">) {
	return assetDtoSchema.parse({
		id: record.id,
		scope: scopeRef(scope),
		objectKey: record.objectKey,
		filename: record.filename,
		mimeType: record.mimeType,
		size: record.size,
		uploaderActor: record.uploaderActor,
		createdAt: record.createdAt.toISOString(),
	});
}

export function toAuditDto(record: AuditRecord) {
	return auditDtoSchema.parse({
		id: record.id,
		scopeId: record.scopeId,
		actor: {
			type: record.actorType,
			id: record.actorId,
			email: record.actorEmail,
			label: record.actorLabel,
		},
		action: record.action,
		entityType: record.entityType,
		entityId: record.entityId,
		changes: record.changes,
		createdAt: record.createdAt.toISOString(),
	});
}
