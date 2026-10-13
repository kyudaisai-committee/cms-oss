import "server-only";

import type { InferSelectModel } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import type { Database } from "#core/db.server";
import { scopes } from "#core/db/schema";
import { toScopeDto } from "#core/dto";
import { canonicalizeStoredLanguage, normalizeScope, normalizeScopeLanguages } from "#core/input";
import { CmsRepository, isUniqueConstraintError } from "#core/repository.server";
import type { CmsActor, ScopeDto, ScopeRef } from "#core/types";

type ScopeRecord = InferSelectModel<typeof scopes>;

export class ScopeService {
	static async ensureScope(
		database: Database,
		actor: CmsActor,
		ref: ScopeRef,
		name?: string,
		availableLanguages?: string[],
		defaultLanguage?: string,
	): Promise<ScopeDto> {
		const repository = new CmsRepository(database);
		const normalized = normalizeScope(ref);
		const existing = await repository.findScope(normalized);
		if (existing) return toScopeDto(existing);
		const now = new Date();
		const normalizedLanguages = normalizeScopeLanguages(availableLanguages, defaultLanguage);
		const scope: ScopeRecord = {
			id: crypto.randomUUID(),
			year: normalized.year,
			site: normalized.site,
			name: name ?? `${normalized.year} ${normalized.site}`,
			availableLanguages: normalizedLanguages.availableLanguages,
			defaultLanguage: normalizedLanguages.defaultLanguage,
			createdAt: now,
			updatedAt: now,
		};
		try {
			await repository.insertScope(scope, {
				actor,
				action: "scope.ensure",
				entityType: "scope",
				entityId: scope.id,
				scopeId: scope.id,
				changes: {
					after: {
						year: scope.year,
						site: scope.site,
						name: scope.name,
						availableLanguages: scope.availableLanguages,
						defaultLanguage: scope.defaultLanguage,
					},
				},
				createdAt: now,
			});
		} catch (error) {
			if (!isUniqueConstraintError(error)) throw error;
			const raced = await repository.findScope(normalized);
			if (raced) return toScopeDto(raced);
			throw error;
		}
		return toScopeDto(scope);
	}

	static async listScopes(database: Database) {
		return (await new CmsRepository(database).listScopes()).map(toScopeDto);
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
		const repository = new CmsRepository(database);
		const scopeRef = normalizeScope(ref);
		const existing = await repository.findScope(scopeRef);
		if (!existing) throw new HTTPException(404, { message: "Scope was not found." });
		const languages = normalizeScopeLanguages(
			values.availableLanguages ?? existing.availableLanguages,
			values.defaultLanguage ?? existing.defaultLanguage,
		);
		const normalizedExistingLanguages = existing.availableLanguages
			.map(canonicalizeStoredLanguage)
			.filter((lang): lang is string => lang !== null);
		const removed = normalizedExistingLanguages.filter(
			(lang) => !languages.availableLanguages.includes(lang),
		);
		for (const lang of removed) {
			if ((await repository.countTranslationsByLanguage(existing.id, lang)) > 0) {
				throw new HTTPException(409, {
					message: `Language ${lang} cannot be removed while translations exist.`,
				});
			}
		}
		const now = new Date();
		const updated: Partial<ScopeRecord> = {
			name: values.name?.trim() || existing.name,
			availableLanguages: languages.availableLanguages,
			defaultLanguage: languages.defaultLanguage,
			updatedAt: now,
		};
		await repository.updateScope(existing.id, updated, {
			actor,
			action: "scope.update",
			entityType: "scope",
			entityId: existing.id,
			scopeId: existing.id,
			changes: { before: existing, after: { ...existing, ...updated } },
			createdAt: now,
		});
		return toScopeDto({ ...existing, ...updated });
	}
}
