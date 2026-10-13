import "server-only";

import type { ScopeRef } from "@repo/core/types";

export const publicNewsCacheControl = "public, max-age=60, stale-while-revalidate=300";

export function publicNewsCacheTag({ year, site }: ScopeRef) {
	return `cms-news-${year}-${site}`;
}

export function publicNewsCacheHeaders(scope: ScopeRef) {
	return {
		"Cache-Control": publicNewsCacheControl,
		"Cache-Tag": publicNewsCacheTag(scope),
	};
}

async function purgePublicNewsCacheTag(scope: ScopeRef) {
	const { cache } = await import("cloudflare:workers");
	const result = await cache.purge({ tags: [publicNewsCacheTag(scope)] });
	if (!result.success) {
		throw new Error(
			`Cloudflare rejected public news cache purge: ${JSON.stringify(result.errors)}`,
		);
	}
}

export async function invalidatePublicNewsCache(scope: ScopeRef) {
	try {
		await purgePublicNewsCacheTag(scope);
	} catch (error) {
		console.error("Failed to invalidate public news cache.", { scope, error });
	}
}

export async function withPublicNewsCacheInvalidation<T>(
	scope: ScopeRef,
	write: () => Promise<T>,
): Promise<T> {
	const result = await write();
	await invalidatePublicNewsCache(scope);
	return result;
}
