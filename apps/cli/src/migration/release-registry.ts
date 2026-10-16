import { compare, valid } from "semver";

import type { CmsDatabaseChange, CmsDatabaseRelease } from "./database-changes.js";
import { validateCmsReleaseHistory, type CmsSchemaHistoryEntry } from "./release-history.js";
import {
	cmsDatabaseReleases,
	cmsPackageVersions,
	cmsSchemaHistory,
} from "./release-metadata.generated.js";

export type { CmsDatabaseChange, CmsDatabaseRelease } from "./database-changes.js";
export { cmsDatabaseReleases } from "./release-metadata.generated.js";
export type { CmsSchemaHistoryEntry } from "./release-history.js";

export interface CmsSchemaRelease {
	version: string;
	schemaId: string;
	schemaExport: string;
	changes: readonly CmsDatabaseChange[];
}

export interface CmsReleaseCatalog {
	current: CmsSchemaRelease;
	releases: CmsSchemaRelease[];
}

export interface CmsReleaseCatalogOptions {
	packageVersions?: readonly string[];
	databaseReleases?: readonly CmsDatabaseRelease[];
	schemaHistory?: readonly CmsSchemaHistoryEntry[];
}

const publicSchemaExport = "@kyudaisai/cms/db/schema";
const legacySchemaId = "core-schema-v1";

export function createCmsReleaseCatalog(
	packageVersion: string,
	options: CmsReleaseCatalogOptions = {},
): CmsReleaseCatalog {
	const currentVersion = parseVersion(packageVersion);
	if (!currentVersion) throw new Error(`The CMS package has an invalid version: ${packageVersion}`);

	const history = validateCmsReleaseHistory(
		options.packageVersions ?? cmsPackageVersions,
		options.databaseReleases ?? cmsDatabaseReleases,
		options.schemaHistory ?? cmsSchemaHistory,
	);
	const { packageVersions, databaseReleases, schemaHistory } = history;

	if (!packageVersions.includes(packageVersion)) {
		throw new Error(
			`CMS version ${packageVersion} is missing from the package release history generated from the CLI changelog.`,
		);
	}

	const databaseReleaseByVersion = new Map(
		databaseReleases.map((release) => [release.version, release]),
	);
	let historyIndex = 0;
	let activeSchema = schemaHistory[0];
	const releases: CmsSchemaRelease[] = [];

	for (const version of packageVersions) {
		if (compare(version, currentVersion) > 0) break;

		while (
			historyIndex + 1 < schemaHistory.length &&
			compare(schemaHistory[historyIndex + 1]!.version, version) <= 0
		) {
			historyIndex += 1;
			activeSchema = schemaHistory[historyIndex];
		}

		if (!activeSchema) throw new Error("The CMS schema history has no initial baseline.");
		releases.push({
			version,
			schemaId: activeSchema.version === "0.0.0" ? legacySchemaId : activeSchema.fingerprint,
			schemaExport: publicSchemaExport,
			changes: databaseReleaseByVersion.get(version)?.changes ?? [],
		});
	}

	const current = releases.at(-1);
	if (!current || current.version !== packageVersion) {
		throw new Error(
			`CMS version ${packageVersion} is not present in the installed release history.`,
		);
	}

	return { current, releases };
}

export function resolveCmsSchemaRelease(
	version: string,
	catalog: CmsReleaseCatalog,
): CmsSchemaRelease {
	const parsedVersion = parseVersion(version);
	if (!parsedVersion) throw new Error(`Invalid CMS version: ${version}`);
	if (compare(parsedVersion, catalog.current.version) > 0) {
		throw new Error(
			`CMS version ${version} is newer than the installed version ${catalog.current.version}.`,
		);
	}
	const release = catalog.releases.find((entry) => entry.version === version);
	if (!release) {
		throw new Error(
			`CMS version ${version} is not present in the installed package release history.`,
		);
	}
	return release;
}

export function compareCmsReleaseVersions(
	leftVersion: string,
	rightVersion: string,
	catalog: CmsReleaseCatalog,
): number {
	const left = resolveCmsSchemaRelease(leftVersion, catalog);
	const right = resolveCmsSchemaRelease(rightVersion, catalog);
	return compare(left.version, right.version);
}

function parseVersion(version: string): string | undefined {
	const parsed = valid(version);
	return parsed === version ? version : undefined;
}
