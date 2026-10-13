import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

import type { Database } from "#core/db.server";
import { scopes, tags } from "#core/db/schema";
import { toTagDto } from "#core/dto";
import type { AuditEntry } from "#core/types";

import { createAuditStatement, executeBatch } from "./shared.server";
import type { TagForExport } from "./types";

type TagRecord = InferSelectModel<typeof tags>;

export class TagRepository {
	constructor(private readonly database: Database) {}

	async listTags(scopeId: string) {
		const rows = await this.database
			.select()
			.from(tags)
			.where(and(eq(tags.scopeId, scopeId), isNull(tags.deletedAt)))
			.orderBy(asc(tags.name));
		return rows.map(toTagDto);
	}

	async listForExport(scopeId?: string): Promise<TagForExport[]> {
		const activeScope = scopeId ? eq(tags.scopeId, scopeId) : undefined;
		return this.database
			.select({ scopeId: tags.scopeId, tag: tags })
			.from(tags)
			.innerJoin(scopes, eq(tags.scopeId, scopes.id))
			.where(and(isNull(tags.deletedAt), activeScope))
			.orderBy(asc(scopes.year), asc(scopes.site), asc(tags.slug), asc(tags.id));
	}

	async findTagById(scopeId: string, id: string) {
		const [row] = await this.database
			.select()
			.from(tags)
			.where(and(eq(tags.scopeId, scopeId), eq(tags.id, id), isNull(tags.deletedAt)))
			.limit(1);
		return row ?? null;
	}

	async insertTag(tag: TagRecord, audit: AuditEntry) {
		await executeBatch(this.database, [
			this.database.insert(tags).values(tag),
			createAuditStatement(this.database, audit),
		]);
	}

	async updateTag(id: string, values: Partial<TagRecord>, audit: AuditEntry) {
		await executeBatch(this.database, [
			this.database
				.update(tags)
				.set(values)
				.where(and(eq(tags.id, id), isNull(tags.deletedAt))),
			createAuditStatement(this.database, audit),
		]);
	}

	async deleteTag(id: string, audit: AuditEntry) {
		await executeBatch(this.database, [
			this.database
				.update(tags)
				.set({ deletedAt: new Date() })
				.where(and(eq(tags.id, id), isNull(tags.deletedAt))),
			createAuditStatement(this.database, audit),
		]);
	}

	async findTagsByIds(scopeId: string, ids: string[]) {
		if (ids.length === 0) return [];
		return this.database
			.select()
			.from(tags)
			.where(and(eq(tags.scopeId, scopeId), inArray(tags.id, ids), isNull(tags.deletedAt)));
	}
}
