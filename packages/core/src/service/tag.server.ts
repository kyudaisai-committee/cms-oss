import "server-only";

import type { InferSelectModel } from "drizzle-orm";

import { tags } from "#core/db/schema";
import { toTagDto } from "#core/dto";
import { CmsError } from "#core/errors";
import { normalizeCreateTagInput, normalizeUpdateTagInput } from "#core/input";
import { CmsRepository, isUniqueConstraintError } from "#core/repository.server";
import type { CmsActor, CreateTagInput, TagDto, UpdateTagInput } from "#core/types";

type TagRecord = InferSelectModel<typeof tags>;

function changesForTag(record: TagRecord) {
	return {
		scopeId: record.scopeId,
		name: record.name,
		slug: record.slug,
	};
}

export class TagService {
	constructor(
		private readonly repository: CmsRepository,
		private readonly actor: CmsActor,
		private readonly scope: { id: string },
	) {}

	async listTags(): Promise<TagDto[]> {
		return this.repository.listTags(this.scope.id);
	}

	async createTag(input: CreateTagInput): Promise<TagDto> {
		const normalized = normalizeCreateTagInput(input);
		const tag: TagRecord = {
			id: crypto.randomUUID(),
			scopeId: this.scope.id,
			...normalized,
			deletedAt: null,
		};
		try {
			await this.repository.insertTag(tag, {
				actor: this.actor,
				action: "tag.create",
				entityType: "tag",
				entityId: tag.id,
				scopeId: this.scope.id,
				changes: { after: changesForTag(tag) },
				createdAt: new Date(),
			});
		} catch (error) {
			if (isUniqueConstraintError(error))
				throw new CmsError("conflict", "Tag name or slug is already in use in this scope.");
			throw error;
		}
		return toTagDto(tag);
	}

	async updateTag(id: string, input: UpdateTagInput): Promise<TagDto> {
		const existing = await this.repository.findTagById(this.scope.id, id);
		if (!existing) throw new CmsError("not_found", "Tag was not found.");
		const normalized = normalizeUpdateTagInput(input);
		const values: Partial<TagRecord> = normalized;
		try {
			await this.repository.updateTag(id, values, {
				actor: this.actor,
				action: "tag.update",
				entityType: "tag",
				entityId: id,
				scopeId: this.scope.id,
				changes: {
					before: changesForTag(existing),
					after: { ...changesForTag(existing), ...values },
				},
				createdAt: new Date(),
			});
		} catch (error) {
			if (isUniqueConstraintError(error))
				throw new CmsError("conflict", "Tag name or slug is already in use in this scope.");
			throw error;
		}
		return toTagDto({ ...existing, ...values });
	}

	async deleteTag(id: string) {
		const existing = await this.repository.findTagById(this.scope.id, id);
		if (!existing) throw new CmsError("not_found", "Tag was not found.");
		await this.repository.deleteTag(id, {
			actor: this.actor,
			action: "tag.delete",
			entityType: "tag",
			entityId: id,
			scopeId: this.scope.id,
			changes: { before: changesForTag(existing) },
			createdAt: new Date(),
		});
	}
}
