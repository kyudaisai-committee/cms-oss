import "server-only";

import { canonicalizeStoredLanguage } from "#core/input";
import type { DataImportTargetState } from "#core/repository/import.server";
import type { DataImportPlan, DataImportRequest } from "#core/types";
import type { ImportPlanTarget } from "@repo/core/import-plan";

export function toImportPlanTarget(state: DataImportTargetState): ImportPlanTarget {
	return {
		scope: {
			id: state.scope.id,
			year: state.scope.year,
			site: state.scope.site,
			name: state.scope.name,
			availableLanguages: [...state.scope.availableLanguages],
			defaultLanguage: state.scope.defaultLanguage,
		},
		news: state.news.map(({ parent, translations, tags }) => ({
			id: parent.id,
			slug: parent.slug,
			tags: tags.map(({ id, name, slug }) => ({ id, name, slug })),
			translations: translations.map((translation) => ({
				id: translation.id,
				lang: canonicalizeStoredLanguage(translation.lang) ?? translation.lang,
				title: translation.title,
				summary: translation.summary,
				contentType: translation.contentType,
				content: translation.content,
				status: translation.status,
				publishedAt: translation.publishedAt?.toISOString() ?? null,
			})),
		})),
		tags: state.tags.map(({ id, name, slug }) => ({ id, name, slug })),
	};
}

function targetFingerprint(state: DataImportTargetState) {
	return {
		scope: {
			id: state.scope.id,
			year: state.scope.year,
			site: state.scope.site,
			name: state.scope.name,
			availableLanguages: state.scope.availableLanguages,
			defaultLanguage: state.scope.defaultLanguage,
		},
		news: state.news.map(({ parent, translations, tags }) => ({
			id: parent.id,
			slug: parent.slug,
			tags: tags.map(({ id, name, slug }) => ({ id, name, slug })),
			translations: translations.map((translation) => ({
				id: translation.id,
				lang: translation.lang,
				title: translation.title,
				summary: translation.summary,
				content: translation.content,
				contentType: translation.contentType,
				status: translation.status,
				publishedAt: translation.publishedAt?.toISOString() ?? null,
			})),
		})),
		tags: state.tags.map(({ id, name, slug }) => ({ id, name, slug })),
	};
}

export async function createImportPreviewToken(
	state: DataImportTargetState,
	request: DataImportRequest,
	plan: DataImportPlan,
) {
	const input = JSON.stringify({ target: targetFingerprint(state), request, plan });
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
