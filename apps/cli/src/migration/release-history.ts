import { compare, valid } from "semver";

import type { CmsDatabaseChange, CmsDatabaseRelease } from "./database-changes.js";

export interface CmsSchemaHistoryEntry {
	version: string;
	fingerprint: string;
}

export interface CmsReleaseHistory {
	packageVersions: string[];
	databaseReleases: CmsDatabaseRelease[];
	schemaHistory: CmsSchemaHistoryEntry[];
}

export interface CmsPendingReleaseValidationOptions {
	allowIncompletePendingSchema?: boolean;
}

const schemaFingerprintPattern = /^sha256:[a-f0-9]{64}$/;

export function validateCmsReleaseHistory(
	packageVersions: readonly string[],
	databaseReleases: readonly CmsDatabaseRelease[],
	schemaHistory: readonly CmsSchemaHistoryEntry[],
): CmsReleaseHistory {
	if (
		databaseReleases.some((release) => release.version === "pending") ||
		schemaHistory.some((entry) => entry.version === "pending")
	) {
		throw new Error(
			"The CMS release history contains unresolved pending changes. Run `pnpm changeset:version` before packing or releasing.",
		);
	}
	const validatedPackageVersions = validateOrderedVersions(
		packageVersions,
		"package release history",
	);
	const validatedDatabaseReleases = validateDatabaseReleases(
		databaseReleases,
		validatedPackageVersions,
	);
	const validatedSchemaHistory = validateSchemaHistory(
		schemaHistory,
		validatedPackageVersions,
		validatedDatabaseReleases,
	);

	return {
		packageVersions: validatedPackageVersions,
		databaseReleases: validatedDatabaseReleases,
		schemaHistory: validatedSchemaHistory,
	};
}

export function validateCmsReleaseHistorySource(
	packageVersions: readonly string[],
	databaseReleases: readonly CmsDatabaseRelease[],
	schemaHistory: readonly CmsSchemaHistoryEntry[],
	options: CmsPendingReleaseValidationOptions = {},
): void {
	const pendingReleaseIndexes = databaseReleases.flatMap((release, index) =>
		release.version === "pending" ? [index] : [],
	);
	const pendingSchemaIndexes = schemaHistory.flatMap((entry, index) =>
		entry.version === "pending" ? [index] : [],
	);
	if (pendingReleaseIndexes.length > 1 || pendingSchemaIndexes.length > 1) {
		throw new Error("The CMS release history can contain only one pending database release.");
	}
	const pendingReleaseIndex = pendingReleaseIndexes[0];
	const pendingSchemaIndex = pendingSchemaIndexes[0];
	if (pendingReleaseIndex === undefined && pendingSchemaIndex === undefined) {
		validateCmsReleaseHistory(packageVersions, databaseReleases, schemaHistory);
		return;
	}
	if (pendingReleaseIndex === undefined || pendingReleaseIndex !== databaseReleases.length - 1) {
		throw new Error(
			"The CMS release history has a pending schema snapshot without a final database event.",
		);
	}

	const pendingRelease = databaseReleases[pendingReleaseIndex];
	if (!pendingRelease) throw new Error("The pending CMS database release is missing.");
	validateDatabaseRelease(pendingRelease);

	const hasSchemaChange = pendingRelease.changes.some((change) => change.kind === "schema");
	if (hasSchemaChange !== (pendingSchemaIndex !== undefined)) {
		if (
			!(hasSchemaChange && pendingSchemaIndex === undefined && options.allowIncompletePendingSchema)
		) {
			throw new Error(
				"The pending CMS database release must have a schema snapshot exactly when it records a schema change.",
			);
		}
	}
	if (pendingSchemaIndex !== undefined) {
		if (pendingSchemaIndex !== schemaHistory.length - 1) {
			throw new Error("The CMS release history must append its pending schema snapshot last.");
		}
		const pendingSchema = schemaHistory[pendingSchemaIndex];
		if (!pendingSchema || !schemaFingerprintPattern.test(pendingSchema.fingerprint)) {
			throw new Error("The pending CMS schema snapshot has an invalid fingerprint.");
		}
		const previousSchema = schemaHistory[pendingSchemaIndex - 1];
		if (previousSchema?.fingerprint === pendingSchema.fingerprint) {
			throw new Error("The pending CMS schema snapshot does not change the schema.");
		}
	}

	validateCmsReleaseHistory(
		packageVersions,
		databaseReleases.filter((_, index) => index !== pendingReleaseIndex),
		schemaHistory.filter((_, index) => index !== pendingSchemaIndex),
	);
}

export function bindPendingCmsReleaseHistory(
	packageVersions: readonly string[],
	previouslyGeneratedPackageVersions: readonly string[],
	currentPackageVersion: string,
	databaseReleases: readonly CmsDatabaseRelease[],
	schemaHistory: readonly CmsSchemaHistoryEntry[],
): CmsReleaseHistory {
	validateCmsReleaseHistorySource(packageVersions, databaseReleases, schemaHistory);
	const hasPending = databaseReleases.some((release) => release.version === "pending");
	if (!hasPending) {
		return validateCmsReleaseHistory(packageVersions, databaseReleases, schemaHistory);
	}

	const currentVersion = parseVersion(currentPackageVersion);
	const previousVersion = previouslyGeneratedPackageVersions.at(-1);
	const latestPackageVersion = packageVersions.at(-1);
	if (
		!currentVersion ||
		!packageVersions.includes(currentPackageVersion) ||
		currentPackageVersion !== latestPackageVersion ||
		(previousVersion !== undefined && compare(currentVersion, previousVersion) <= 0)
	) {
		throw new Error(
			"A pending CMS database release can only be bound after Changesets creates a new known package version.",
		);
	}

	return validateCmsReleaseHistory(
		packageVersions,
		databaseReleases.map((release) =>
			release.version === "pending" ? { ...release, version: currentPackageVersion } : release,
		),
		schemaHistory.map((entry) =>
			entry.version === "pending" ? { ...entry, version: currentPackageVersion } : entry,
		),
	);
}

function validateOrderedVersions(versions: readonly string[], label: string): string[] {
	const parsedVersions = versions.map((version) => parseVersion(version));
	if (
		parsedVersions.some(
			(version, index) =>
				!version || (index > 0 && compare(version, parsedVersions[index - 1]!) <= 0),
		)
	) {
		throw new Error(`The CMS ${label} contains an invalid or unordered version.`);
	}
	return [...versions];
}

function validateDatabaseReleases(
	releases: readonly CmsDatabaseRelease[],
	packageVersions: readonly string[],
): CmsDatabaseRelease[] {
	let previousVersion: string | undefined;
	for (const release of releases) {
		const version = parseVersion(release.version);
		if (
			!version ||
			(previousVersion && compare(version, previousVersion) <= 0) ||
			!packageVersions.includes(release.version)
		) {
			throw new Error(
				"The CMS database change history contains an invalid, unordered, or unknown version.",
			);
		}
		validateDatabaseRelease(release);
		previousVersion = version;
	}
	return [...releases];
}

function validateDatabaseRelease(release: CmsDatabaseRelease): void {
	if (!Array.isArray(release.changes) || release.changes.length === 0) {
		throw new Error(`CMS database release ${release.version} must record at least one change.`);
	}
	for (const change of release.changes) validateDatabaseChange(change, release.version);
}

function validateDatabaseChange(change: CmsDatabaseChange, version: string): void {
	if (
		(change.kind !== "schema" && change.kind !== "data") ||
		typeof change.summary !== "string" ||
		!change.summary.trim() ||
		!Array.isArray(change.details) ||
		change.details.some((detail) => typeof detail !== "string" || !detail.trim())
	) {
		throw new Error(`CMS database release ${version} contains an invalid change record.`);
	}
}

function validateSchemaHistory(
	history: readonly CmsSchemaHistoryEntry[],
	packageVersions: readonly string[],
	databaseReleases: readonly CmsDatabaseRelease[],
): CmsSchemaHistoryEntry[] {
	if (history.length === 0 || history[0]?.version !== "0.0.0") {
		throw new Error("The CMS schema history must begin with the 0.0.0 schema baseline.");
	}
	let previousVersion: string | undefined;
	for (const [index, entry] of history.entries()) {
		const version = parseVersion(entry.version);
		if (
			!version ||
			(previousVersion && compare(version, previousVersion) <= 0) ||
			!packageVersions.includes(entry.version) ||
			!schemaFingerprintPattern.test(entry.fingerprint)
		) {
			throw new Error("The CMS schema history contains an invalid, unordered, or unknown entry.");
		}
		if (entry.version !== "0.0.0") {
			const release = databaseReleases.find((candidate) => candidate.version === entry.version);
			if (!release?.changes.some((change) => change.kind === "schema")) {
				throw new Error(
					`CMS schema snapshot ${entry.version} has no matching schema change event.`,
				);
			}
			const previous = history[index - 1];
			if (previous?.fingerprint === entry.fingerprint) {
				throw new Error(`CMS schema release ${entry.version} does not change the schema snapshot.`);
			}
		}
		previousVersion = version;
	}

	for (const release of databaseReleases) {
		const requiresSnapshot = release.changes.some((change) => change.kind === "schema");
		const hasSnapshot = history.some((entry) => entry.version === release.version);
		if (requiresSnapshot !== hasSnapshot) {
			throw new Error(
				`CMS database release ${release.version} must record changes and a schema snapshot exactly when its changes include schema.`,
			);
		}
	}
	return [...history];
}

function parseVersion(version: string): string | undefined {
	const parsed = valid(version);
	return parsed === version ? version : undefined;
}
