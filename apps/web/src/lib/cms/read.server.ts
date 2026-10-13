import "server-only";

import { env } from "cloudflare:workers";

import { localActor } from "@repo/api/access.server";
import { getDb } from "@repo/api/db.server";
import { CmsService } from "@repo/core/service.server";
import type {
	AdminNewsDto,
	AdminNewsListOptions,
	AdminNewsPage,
	NewsListOptions,
	PublishedNewsDto,
	PublishedNewsPage,
	ScopeDto,
	ScopeRef,
	TagDto,
} from "@repo/core/types";
import { scopeRefSchema } from "@repo/core/types";

type CmsEnvironment = Pick<Env, "DB">;

function environment(value?: CmsEnvironment) {
	return value ?? env;
}

function scopeFromRef(scope: ScopeRef, available: ScopeDto[]) {
	const found = available.find(
		(candidate) => candidate.year === scope.year && candidate.site === scope.site,
	);
	if (!found) throw new Error("Scope was not found.");
	return found;
}
function scopeRecord(scope: ScopeDto) {
	return {
		...scope,
		createdAt: new Date(scope.createdAt),
		updatedAt: new Date(scope.updatedAt),
	};
}

export async function listScopes(bindings?: CmsEnvironment): Promise<ScopeDto[]> {
	return CmsService.listScopes(getDb(environment(bindings)));
}

export async function getScope(scope: ScopeRef, bindings?: CmsEnvironment): Promise<ScopeDto> {
	const env = environment(bindings);
	const scopes = await listScopes(env);
	return scopeFromRef(scopeRefSchema.parse(scope), scopes);
}

export async function listPublishedNews(
	scope: ScopeRef,
	options: NewsListOptions = {},
	bindings?: CmsEnvironment,
): Promise<PublishedNewsPage> {
	const env = environment(bindings);
	const scopes = await listScopes(env);
	const selected = scopeFromRef(scopeRefSchema.parse(scope), scopes);
	return new CmsService(getDb(env), localActor, scopeRecord(selected)).listPublishedNews(options);
}

export async function getPublishedNews(
	scope: ScopeRef,
	slug: string,
	lang?: string,
	bindings?: CmsEnvironment,
): Promise<PublishedNewsDto> {
	const env = environment(bindings);
	const scopes = await listScopes(env);
	const selected = scopeFromRef(scopeRefSchema.parse(scope), scopes);
	return new CmsService(getDb(env), localActor, scopeRecord(selected)).getPublishedNews(slug, lang);
}

export async function listAdminNews(
	scope: ScopeRef,
	options: AdminNewsListOptions = {},
	bindings?: CmsEnvironment,
): Promise<AdminNewsPage> {
	const env = environment(bindings);
	const scopes = await listScopes(env);
	const selected = scopeFromRef(scopeRefSchema.parse(scope), scopes);
	return new CmsService(getDb(env), localActor, scopeRecord(selected)).listAdminNews(options);
}

export async function getAdminNews(
	scope: ScopeRef,
	id: string,
	lang?: string,
	bindings?: CmsEnvironment,
): Promise<AdminNewsDto> {
	const env = environment(bindings);
	const scopes = await listScopes(env);
	const selected = scopeFromRef(scopeRefSchema.parse(scope), scopes);
	return new CmsService(getDb(env), localActor, scopeRecord(selected)).getAdminNews(id, lang);
}

export async function listTags(scope: ScopeRef, bindings?: CmsEnvironment): Promise<TagDto[]> {
	const env = environment(bindings);
	const scopes = await listScopes(env);
	const selected = scopeFromRef(scopeRefSchema.parse(scope), scopes);
	return new CmsService(getDb(env), localActor, scopeRecord(selected)).listTags();
}
