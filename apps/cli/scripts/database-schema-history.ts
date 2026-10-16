import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { compare } from "semver";

import type { CmsDatabaseChange, CmsDatabaseRelease } from "../src/migration/database-changes.ts";
import {
	validateCmsReleaseHistory,
	validateCmsReleaseHistorySource,
} from "../src/migration/release-history.ts";

export interface ProductSchemaSnapshot {
	version: string;
	snapshot: Record<string, unknown>;
}

export interface ProductSchemaHistory {
	formatVersion: 2;
	databaseReleases: CmsDatabaseRelease[];
	snapshots: ProductSchemaSnapshot[];
}

export async function readProductSchemaHistory(path: string): Promise<ProductSchemaHistory> {
	const contents: unknown = JSON.parse(await readFile(path, "utf8"));
	if (
		!isRecord(contents) ||
		contents.formatVersion !== 2 ||
		!Array.isArray(contents.databaseReleases) ||
		!Array.isArray(contents.snapshots)
	) {
		throw new Error(`The CMS schema history is invalid: ${path}`);
	}
	const databaseReleases = contents.databaseReleases.map((entry): CmsDatabaseRelease => {
		if (!isRecord(entry) || typeof entry.version !== "string" || !Array.isArray(entry.changes)) {
			throw new Error(`The CMS schema history has an invalid database release: ${path}`);
		}
		const changes = entry.changes.map((change) => {
			if (
				!isRecord(change) ||
				(change.kind !== "schema" && change.kind !== "data") ||
				typeof change.summary !== "string" ||
				!Array.isArray(change.details)
			) {
				throw new Error(`The CMS schema history has an invalid database change: ${path}`);
			}
			const details = change.details.map((detail) => {
				if (typeof detail !== "string") {
					throw new Error(`The CMS schema history has an invalid database change: ${path}`);
				}
				return detail;
			});
			const kind: CmsDatabaseChange["kind"] = change.kind;
			return {
				kind,
				summary: change.summary,
				details,
			};
		});
		return { version: entry.version, changes };
	});
	const snapshots = contents.snapshots.map((entry): ProductSchemaSnapshot => {
		if (!isRecord(entry) || typeof entry.version !== "string" || !isRecord(entry.snapshot)) {
			throw new Error(`The CMS schema history has an invalid snapshot: ${path}`);
		}
		return { version: entry.version, snapshot: entry.snapshot };
	});
	return { formatVersion: 2, databaseReleases, snapshots };
}

export async function writeProductSchemaHistory(
	path: string,
	history: ProductSchemaHistory,
): Promise<void> {
	await writeFile(path, `${JSON.stringify(history, null, "\t")}\n`, "utf8");
}

export function fingerprintCmsSchemaSnapshot(snapshot: unknown): string {
	if (!isRecord(snapshot))
		throw new Error("The CMS schema history contains a non-object snapshot.");
	const stableSnapshot = Object.fromEntries(
		Object.entries(snapshot).filter(([key]) => key !== "id" && key !== "prevId"),
	);
	return `sha256:${createHash("sha256")
		.update(JSON.stringify(canonicalize(stableSnapshot)))
		.digest("hex")}`;
}

export function validateCmsDatabaseHistory(
	packageVersions: readonly string[],
	databaseReleases: readonly CmsDatabaseRelease[],
	snapshots: readonly ProductSchemaSnapshot[],
	options: { allowPending?: boolean; allowIncompletePendingSchema?: boolean } = {},
): void {
	const schemaHistory = snapshots.map(({ version, snapshot }) => ({
		version,
		fingerprint: fingerprintCmsSchemaSnapshot(snapshot),
	}));
	if (options.allowPending) {
		validateCmsReleaseHistorySource(packageVersions, databaseReleases, schemaHistory, {
			allowIncompletePendingSchema: options.allowIncompletePendingSchema === true,
		});
		return;
	}
	validateCmsReleaseHistory(packageVersions, databaseReleases, schemaHistory);
}

export function assertCurrentCmsSchemaMatchesHistory(
	packageVersion: string,
	latestPackageVersion: string,
	currentFingerprint: string,
	snapshots: readonly ProductSchemaSnapshot[],
): void {
	if (packageVersion !== "0.0.0" && packageVersion !== latestPackageVersion) {
		throw new Error(
			`CMS ${packageVersion} is not the latest known package release ${latestPackageVersion}; refusing to pack an outdated release.`,
		);
	}
	const applicableSnapshot = snapshots
		.filter((snapshot) => compare(snapshot.version, packageVersion) <= 0)
		.at(-1);
	if (!applicableSnapshot) {
		throw new Error(
			"The CMS Drizzle schema history has no baseline snapshot for this package version.",
		);
	}
	const recordedFingerprint = fingerprintCmsSchemaSnapshot(applicableSnapshot.snapshot);
	if (currentFingerprint !== recordedFingerprint) {
		throw new Error(
			`The current Drizzle schema differs from the applicable schema snapshot (${applicableSnapshot.version}). Record a schema database change for CMS ${packageVersion} and update its snapshot before packing or releasing.`,
		);
	}
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, canonicalize(value[key])]),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
