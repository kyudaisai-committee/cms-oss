import type { InferSelectModel } from "drizzle-orm";

import { news, newsTranslations, scopes, tags } from "#core/db/schema";

type ScopeRecord = InferSelectModel<typeof scopes>;
type NewsRecord = InferSelectModel<typeof news>;
type NewsTranslationRecord = InferSelectModel<typeof newsTranslations>;
type TagRecord = InferSelectModel<typeof tags>;

export type NewsWithTags = {
	parent: NewsRecord;
	translation: NewsTranslationRecord;
	tags: TagRecord[];
	scope: ScopeRecord;
	translations: NewsTranslationRecord[];
};

export type ScopeWithId = ScopeRecord;

export type NewsForExport = {
	parent: NewsRecord;
	scope: ScopeRecord;
	translations: NewsTranslationRecord[];
	tags: TagRecord[];
};

export type TagForExport = {
	scopeId: string;
	tag: TagRecord;
};

export type NewsPage = {
	items: NewsWithTags[];
	nextCursor: string | null;
	totalCount?: number;
};
