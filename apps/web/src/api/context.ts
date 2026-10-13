import type { AccessEnvironment } from "#web/api/access.server";
import type { CmsService } from "@repo/core/service.server";
import type { CmsActor, ScopeDto } from "@repo/core/types";

export type ApiBindings = Pick<Env, "DB" | "ASSETS"> & AccessEnvironment;
export type ApiAuthMethod = "access-header" | "service-binding" | "local";

export type ApiVariables = {
	actor: CmsActor;
	authMethod: ApiAuthMethod;
	scope?: ScopeDto;
	service?: CmsService;
};
