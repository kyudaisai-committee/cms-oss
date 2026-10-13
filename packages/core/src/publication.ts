import type { NewsStatus } from "#core/types";

export type NewsDisplayStatus = NewsStatus | "scheduled" | "unpublished";

export function getNewsDisplayStatus(
	status: NewsStatus,
	publishedAt: string | null,
	now: Date = new Date(),
): NewsDisplayStatus {
	if (status === "draft") return "draft";
	if (!publishedAt) return "unpublished";
	return new Date(publishedAt).getTime() > now.getTime() ? "scheduled" : "published";
}

export function isNewsPublicAt(status: NewsStatus, publishedAt: Date | null, now: Date) {
	return status === "published" && publishedAt !== null && publishedAt.getTime() <= now.getTime();
}
