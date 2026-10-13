import "server-only";

import type { InferSelectModel } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { scopes } from "#core/db/schema";
import { CmsRepository, isUniqueConstraintError } from "#core/repository.server";
import type { DataImportTargetState } from "#core/repository/import.server";
import { dataImportCommitRequestSchema, dataImportRequestSchema } from "#core/types";
import type {
	DataImportCommitRequest,
	DataImportRequest,
	DataImportResult,
	CmsActor,
} from "#core/types";
import { buildTargetCurrent, planDataImport } from "@repo/core/import-plan";
import type { ImportPlanTarget } from "@repo/core/import-plan";

import { createImportPreviewToken, toImportPlanTarget } from "./import/snapshot.server";
import { makeDataImportWriteSet } from "./import/write-set.server";

type ScopeRecord = InferSelectModel<typeof scopes>;

function targetForPlan(state: DataImportTargetState): ImportPlanTarget {
	return toImportPlanTarget(state);
}

export class DataImportService {
	constructor(
		private readonly repository: CmsRepository,
		private readonly actor: CmsActor,
		private readonly scope: ScopeRecord,
	) {}

	private async readTarget() {
		const target = await this.repository.readImportTarget(this.scope.id);
		if (!target) throw new HTTPException(404, { message: "Scope was not found." });
		return target;
	}

	async preview(input: DataImportRequest) {
		const request = dataImportRequestSchema.parse(input);
		const state = await this.readTarget();
		const planned = planDataImport(request, targetForPlan(state));
		return {
			targetCurrent: planned.targetCurrent,
			previewToken: await createImportPreviewToken(state, request, planned.plan),
			plan: planned.plan,
		};
	}

	async import(input: DataImportCommitRequest): Promise<DataImportResult> {
		const commitRequest = dataImportCommitRequestSchema.parse(input);
		const { expectedPreviewToken, ...request } = commitRequest;
		const state = await this.readTarget();
		const planned = planDataImport(request, targetForPlan(state));
		const currentToken = await createImportPreviewToken(state, request, planned.plan);
		if (currentToken !== expectedPreviewToken) {
			throw new HTTPException(409, {
				message: "Import data changed after preview. Review the current data and preview again.",
			});
		}
		if (!planned.plan.ready) {
			throw new HTTPException(400, {
				message: planned.plan.errors[0] ?? "Import choices are incomplete. Review the preview.",
			});
		}

		const writeSet = makeDataImportWriteSet(state, planned, this.actor);
		try {
			const written = await this.repository.writeImport(writeSet);
			if (!written) {
				throw new HTTPException(409, {
					message: "Target scope changed during import. Review the current data and preview again.",
				});
			}
		} catch (error) {
			if (error instanceof HTTPException) throw error;
			if (
				isUniqueConstraintError(error) ||
				(error instanceof Error && /NOT NULL constraint failed: scopes\.id/i.test(error.message))
			) {
				throw new HTTPException(409, {
					message: "Target data changed during import. Review the current data and preview again.",
				});
			}
			throw error;
		}

		const updatedState = await this.readTarget();
		const updatedTarget = buildTargetCurrent(toImportPlanTarget(updatedState));
		return {
			createdNews: writeSet.news.length,
			skippedNews: planned.plan.summary.newsToSkip,
			createdTranslations: writeSet.news.reduce(
				(count, item) => count + item.translations.length,
				0,
			),
			createdTags: writeSet.tags.length,
			reusedTags: planned.plan.summary.tagsToReuse,
			addedLanguages: planned.plan.languagesToAdd,
			newsSlugs: planned.plan.news.flatMap((item) =>
				item.action === "create" && item.targetSlug !== null
					? [{ sourceSlug: item.sourceSlug, targetSlug: item.targetSlug }]
					: [],
			),
			targetCurrent: updatedTarget,
		};
	}
}
