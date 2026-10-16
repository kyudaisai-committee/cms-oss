import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateSQLiteDrizzleJson } from "drizzle-kit/api";
import { compare } from "semver";

import { schema } from "@repo/core/db/schema";

import { bindPendingCmsReleaseHistory } from "../src/migration/release-history.ts";
import {
	cmsDatabaseReleases as generatedCmsDatabaseReleases,
	cmsPackageVersions as generatedCmsPackageVersions,
	cmsSchemaHistory as generatedCmsSchemaHistory,
} from "../src/migration/release-metadata.generated.ts";
import {
	assertCurrentCmsSchemaMatchesHistory,
	fingerprintCmsSchemaSnapshot,
	readProductSchemaHistory,
	validateCmsDatabaseHistory,
	writeProductSchemaHistory,
	type ProductSchemaHistory,
} from "./database-schema-history.ts";
import { collectProductReleaseVersions } from "./product-release-notes.ts";

interface CmsPackageManifest {
	version: string;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cliDirectory = join(repositoryRoot, "apps/cli");
const changelogPath = join(cliDirectory, "CHANGELOG.md");
const packageManifestPath = join(cliDirectory, "package.json");
const schemaHistoryPath = join(cliDirectory, "src/migration/schema-history.json");
const releaseMetadataPath = join(cliDirectory, "src/migration/release-metadata.generated.ts");
const baselineVersion = "0.0.0";

export async function generateCmsReleaseMetadata(): Promise<void> {
	const packageVersions = await readPackageVersions();
	const packageManifest = await readCmsPackageManifest();
	const history = await readProductSchemaHistory(schemaHistoryPath);
	const boundHistory = bindPendingCmsReleaseHistory(
		packageVersions,
		generatedCmsPackageVersions,
		packageManifest.version,
		history.databaseReleases,
		history.snapshots.map(({ version, snapshot }) => ({
			version,
			fingerprint: fingerprintCmsSchemaSnapshot(snapshot),
		})),
	);
	const resolvedHistory = resolveProductSchemaHistory(
		history,
		boundHistory.databaseReleases,
		boundHistory.schemaHistory,
	);
	validateCmsDatabaseHistory(
		packageVersions,
		boundHistory.databaseReleases,
		resolvedHistory.snapshots,
	);
	if (hasPendingRelease(history))
		await writeProductSchemaHistory(schemaHistoryPath, resolvedHistory);
	await writeFile(
		releaseMetadataPath,
		renderReleaseMetadata(
			packageVersions,
			boundHistory.databaseReleases,
			boundHistory.schemaHistory,
		),
		"utf8",
	);
}

export async function validateCmsReleaseMetadata(): Promise<void> {
	const packageVersions = await readPackageVersions();
	const history = await readProductSchemaHistory(schemaHistoryPath);
	validateCmsDatabaseHistory(packageVersions, history.databaseReleases, history.snapshots);
	const schemaHistory = history.snapshots.map(({ version, snapshot }) => ({
		version,
		fingerprint: fingerprintCmsSchemaSnapshot(snapshot),
	}));
	if (
		JSON.stringify(generatedCmsPackageVersions) !== JSON.stringify(packageVersions) ||
		JSON.stringify(generatedCmsDatabaseReleases) !== JSON.stringify(history.databaseReleases) ||
		JSON.stringify(generatedCmsSchemaHistory) !== JSON.stringify(schemaHistory)
	) {
		throw new Error(
			"The CMS release metadata is out of date. Run `pnpm changeset:version` before packing or releasing.",
		);
	}

	const packageManifest = await readCmsPackageManifest();
	const currentSnapshot = await generateSQLiteDrizzleJson(schema);
	assertCurrentCmsSchemaMatchesHistory(
		packageManifest.version,
		packageVersions.at(-1) ?? baselineVersion,
		fingerprintCmsSchemaSnapshot(currentSnapshot),
		history.snapshots,
	);
}

export async function recordCmsSchemaSnapshot(): Promise<void> {
	const packageVersions = await readPackageVersions();
	const history = await readProductSchemaHistory(schemaHistoryPath);
	validateCmsDatabaseHistory(packageVersions, history.databaseReleases, history.snapshots, {
		allowPending: true,
		allowIncompletePendingSchema: true,
	});
	const pendingRelease = history.databaseReleases.find((release) => release.version === "pending");
	if (!pendingRelease?.changes.some((change) => change.kind === "schema")) {
		throw new Error("Record a pending schema database change in schema-history.json first.");
	}
	if (history.snapshots.some((snapshot) => snapshot.version === "pending")) {
		throw new Error("The pending CMS schema snapshot has already been recorded.");
	}

	const previousSnapshot = history.snapshots.at(-1);
	if (!previousSnapshot)
		throw new Error("The CMS Drizzle schema history has no baseline snapshot.");
	const currentSnapshot = await generateSQLiteDrizzleJson(schema);
	const currentFingerprint = fingerprintCmsSchemaSnapshot(currentSnapshot);
	if (fingerprintCmsSchemaSnapshot(previousSnapshot.snapshot) === currentFingerprint) {
		throw new Error(`The CMS Drizzle schema has not changed since ${previousSnapshot.version}.`);
	}

	history.snapshots.push({
		version: "pending",
		snapshot: omitTransientSnapshotIds(currentSnapshot),
	});
	validateCmsDatabaseHistory(packageVersions, history.databaseReleases, history.snapshots, {
		allowPending: true,
	});
	await writeProductSchemaHistory(schemaHistoryPath, history);
}

async function readPackageVersions(): Promise<string[]> {
	const markdown = await readFile(changelogPath, "utf8");
	const versions = new Set([baselineVersion, ...collectProductReleaseVersions(markdown)]);
	const packageManifest = await readCmsPackageManifest();
	if (packageManifest.version !== baselineVersion && !versions.has(packageManifest.version)) {
		throw new Error(
			`The CMS package version ${packageManifest.version} is missing from apps/cli/CHANGELOG.md.`,
		);
	}
	return [...versions].sort(compare);
}

async function readCmsPackageManifest(): Promise<CmsPackageManifest> {
	const contents: unknown = JSON.parse(await readFile(packageManifestPath, "utf8"));
	if (!isRecord(contents) || typeof contents.version !== "string") {
		throw new Error(`The CMS package manifest has no version: ${packageManifestPath}`);
	}
	return { version: contents.version };
}

function renderReleaseMetadata(
	packageVersions: readonly string[],
	databaseReleases: ProductSchemaHistory["databaseReleases"],
	schemaHistory: readonly { version: string; fingerprint: string }[],
): string {
	return [
		`export const cmsPackageVersions = ${JSON.stringify(packageVersions, null, "\t")} as const;`,
		"",
		`export const cmsDatabaseReleases = ${JSON.stringify(databaseReleases, null, "\t")} as const;`,
		"",
		`export const cmsSchemaHistory = ${JSON.stringify(schemaHistory, null, "\t")} as const;`,
		"",
	].join("\n");
}

function resolveProductSchemaHistory(
	history: ProductSchemaHistory,
	databaseReleases: ProductSchemaHistory["databaseReleases"],
	schemaHistory: readonly { version: string; fingerprint: string }[],
): ProductSchemaHistory {
	return {
		formatVersion: 2,
		databaseReleases,
		snapshots: history.snapshots.map(({ version, snapshot }, index) => ({
			version: schemaHistory[index]?.version ?? version,
			snapshot,
		})),
	};
}

function hasPendingRelease(history: ProductSchemaHistory): boolean {
	return history.databaseReleases.some((release) => release.version === "pending");
}

function omitTransientSnapshotIds(snapshot: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(snapshot).filter(([key]) => key !== "id" && key !== "prevId"),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main(): Promise<void> {
	const [command, ...arguments_] = process.argv.slice(2);
	switch (command) {
		case "--generate":
			if (arguments_.length > 0) throw new Error("--generate does not accept arguments.");
			await generateCmsReleaseMetadata();
			return;
		case "--validate":
			if (arguments_.length > 0) throw new Error("--validate does not accept arguments.");
			await validateCmsReleaseMetadata();
			return;
		case "--record-schema":
			if (arguments_.length > 0) throw new Error("--record-schema does not accept a version.");
			await recordCmsSchemaSnapshot();
			return;
		default:
			throw new Error("Use --generate, --validate, or --record-schema.");
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
