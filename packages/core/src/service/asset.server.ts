import "server-only";

import type { InferSelectModel } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { assets, scopes } from "#core/db/schema";
import { toAssetDto } from "#core/dto";
import { normalizeCreateAssetInput } from "#core/input";
import { CmsRepository, isUniqueConstraintError } from "#core/repository.server";
import type { CmsActor, AssetDto, CreateAssetInput } from "#core/types";

import { actorValue, scopeValue } from "./news-shared.server";

type AssetRecord = InferSelectModel<typeof assets>;
type ScopeRecord = InferSelectModel<typeof scopes>;

function changesForAsset(record: AssetRecord) {
	return {
		scopeId: record.scopeId,
		objectKey: record.objectKey,
		filename: record.filename,
		mimeType: record.mimeType,
		size: record.size,
		uploaderActor: record.uploaderActor,
	};
}

export class AssetService {
	constructor(
		private readonly repository: CmsRepository,
		private readonly actor: CmsActor,
		private readonly scope: ScopeRecord,
	) {}

	async listAssets(): Promise<AssetDto[]> {
		return (await this.repository.listAssets(this.scope.id)).map((asset) =>
			toAssetDto(asset, scopeValue(this.scope)),
		);
	}

	async createAsset(input: CreateAssetInput): Promise<AssetDto> {
		const normalized = normalizeCreateAssetInput(input);
		if (await this.repository.findAssetByObjectKey(this.scope.id, normalized.objectKey)) {
			throw new HTTPException(409, {
				message: "Asset object key is already in use in this scope.",
			});
		}
		const asset: AssetRecord = {
			id: crypto.randomUUID(),
			scopeId: this.scope.id,
			...normalized,
			uploaderActor: actorValue(this.actor),
			createdAt: new Date(),
			deletedAt: null,
		};
		try {
			await this.repository.insertAsset(asset, {
				actor: this.actor,
				action: "asset.metadata.create",
				entityType: "asset",
				entityId: asset.id,
				scopeId: this.scope.id,
				changes: { after: changesForAsset(asset) },
				createdAt: asset.createdAt,
			});
		} catch (error) {
			if (isUniqueConstraintError(error))
				throw new HTTPException(409, {
					message: "Asset object key is already in use in this scope.",
				});
			throw error;
		}
		return toAssetDto(asset, scopeValue(this.scope));
	}

	async getAsset(id: string): Promise<AssetDto> {
		const asset = await this.repository.findAssetById(this.scope.id, id);
		if (!asset) throw new HTTPException(404, { message: "Asset was not found." });
		return toAssetDto(asset, scopeValue(this.scope));
	}

	async deleteAsset(id: string) {
		const asset = await this.repository.findAssetById(this.scope.id, id);
		if (!asset) throw new HTTPException(404, { message: "Asset was not found." });
		await this.repository.deleteAsset(id, {
			actor: this.actor,
			action: "asset.delete",
			entityType: "asset",
			entityId: id,
			scopeId: this.scope.id,
			changes: { before: changesForAsset(asset) },
			createdAt: new Date(),
		});
		return toAssetDto(asset, scopeValue(this.scope));
	}
}
