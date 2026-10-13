import type { AccessEnvironment } from "#api/access.server";
import type { CmsService } from "@repo/core/service.server";
import type { CmsActor, ScopeDto } from "@repo/core/types";

export type ApiBindings = {
	DB: D1Database;
	ASSETS: R2Bucket;
} & AccessEnvironment;
export type ApiAuthMethod = "access-header" | "service-binding" | "local";

export type ApiVariables = {
	actor: CmsActor;
	authMethod: ApiAuthMethod;
	scope?: ScopeDto;
	service?: CmsService;
};
