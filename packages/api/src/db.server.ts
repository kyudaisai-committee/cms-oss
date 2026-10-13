import "server-only";

import { createDb } from "@repo/core/db.server";

import type { ApiBindings } from "./context";

export function getDb(bindings: Pick<ApiBindings, "DB">) {
	return createDb(bindings.DB);
}
