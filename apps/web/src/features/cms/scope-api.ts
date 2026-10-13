import { createApiClient } from "@repo/api/client";
import { apiEnvelopeSchema, apiErrorEnvelopeSchema } from "@repo/api/contracts";
import {
	scopeDtoSchema,
	scopeEnsureInputSchema,
	ensureScopeInputSchema,
	type ScopeDto,
	type ScopeEnsureInput,
	type EnsureScopeInput,
} from "@repo/core/types";

import { CmsApiError } from "./api";

const api = createApiClient();

function getErrorMessage(payload: unknown) {
	const parsed = apiErrorEnvelopeSchema.safeParse(payload);
	return parsed.success ? parsed.data.error.message : "APIリクエストに失敗しました。";
}

export async function ensureScope(input: ScopeEnsureInput): Promise<ScopeDto> {
	const response = await api.admin.scopes.ensure.$post({
		json: scopeEnsureInputSchema.parse(input),
	});
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new CmsApiError(response.status, "APIの応答を読み取れませんでした。");
	}
	if (!response.ok) throw new CmsApiError(response.status, getErrorMessage(payload));
	const parsed = apiEnvelopeSchema(scopeDtoSchema).safeParse(payload);
	if (!parsed.success) throw new CmsApiError(response.status, "APIの応答形式が不正です。");
	return parsed.data.data;
}

export async function updateScope(scope: ScopeDto, input: EnsureScopeInput): Promise<ScopeDto> {
	const response = await api.admin.scopes[":year"][":site"].$patch({
		param: { year: String(scope.year), site: scope.site },
		json: ensureScopeInputSchema.parse(input),
	});
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new CmsApiError(response.status, "APIの応答を読み取れませんでした。");
	}
	if (!response.ok) throw new CmsApiError(response.status, getErrorMessage(payload));
	const parsed = apiEnvelopeSchema(scopeDtoSchema).safeParse(payload);
	if (!parsed.success) throw new CmsApiError(response.status, "APIの応答形式が不正です。");
	return parsed.data.data;
}
