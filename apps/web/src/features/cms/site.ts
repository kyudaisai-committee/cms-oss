import type { ScopeRef } from "@repo/core/types";

export function getScopeFallbackLabel(scope: ScopeRef): string {
	return `${scope.year} · ${scope.site}`;
}

export function scopePath(scope: Pick<ScopeRef, "year" | "site">): `/${number}/${string}` {
	return `/${scope.year}/${encodeURIComponent(scope.site)}`;
}
