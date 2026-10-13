import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

import type { Database } from "#core/db.server";
import { assets } from "#core/db/schema";
import type { AuditEntry } from "#core/types";

import { createAuditStatement, executeBatch } from "./shared.server";

type AssetRecord = InferSelectModel<typeof assets>;

export class AssetRepository {
	constructor(private readonly database: Database) {}

	async findAssetById(scopeId: string, id: string) {
		const [row] = await this.database
			.select()
			.from(assets)
			.where(and(eq(assets.scopeId, scopeId), eq(assets.id, id), isNull(assets.deletedAt)))
			.limit(1);
		return row ?? null;
	}

	async findAssetByObjectKey(scopeId: string, objectKey: string) {
		const [row] = await this.database
			.select()
			.from(assets)
			.where(
				and(eq(assets.scopeId, scopeId), eq(assets.objectKey, objectKey), isNull(assets.deletedAt)),
			)
			.limit(1);
		return row ?? null;
	}

	async listAssets(scopeId: string) {
		return this.database
			.select()
			.from(assets)
			.where(and(eq(assets.scopeId, scopeId), isNull(assets.deletedAt)))
			.orderBy(desc(assets.createdAt), desc(assets.id));
	}

	async insertAsset(asset: AssetRecord, audit: AuditEntry) {
		await executeBatch(this.database, [
			this.database.insert(assets).values(asset),
			createAuditStatement(this.database, audit),
		]);
	}

	async deleteAsset(id: string, audit: AuditEntry) {
		await executeBatch(this.database, [
			this.database
				.update(assets)
				.set({ deletedAt: new Date() })
				.where(and(eq(assets.id, id), isNull(assets.deletedAt))),
			createAuditStatement(this.database, audit),
		]);
	}
}
