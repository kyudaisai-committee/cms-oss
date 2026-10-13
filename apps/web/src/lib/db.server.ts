import "server-only";

import { createDb } from "@repo/core/db.server";

export function getDb(environment: Pick<Env, "DB">) {
	return createDb(environment.DB);
}
