import { compare, valid } from "semver";

export interface CmsDatabaseChange {
	kind: "schema" | "data";
	summary: string;
	details: string[];
}

export interface CmsSchemaRelease {
	version: string;
	schemaId: string;
	schemaExport: string;
	changes: CmsDatabaseChange[];
}

export interface CmsReleaseCatalog {
	current: CmsSchemaRelease;
	releases: CmsSchemaRelease[];
}

export const cmsSchemaReleases = [
	{
		version: "0.0.0",
		schemaId: "core-schema-v1",
		schemaExport: "@repo/cli/db/schema",
		changes: [],
	},
	{
		version: "0.1.0-alpha.0",
		schemaId: "core-schema-v1",
		schemaExport: "@repo/cli/db/schema",
		changes: [],
	},
] satisfies CmsSchemaRelease[];

export function createCmsReleaseCatalog(
	packageVersion: string,
	releases: CmsSchemaRelease[] = cmsSchemaReleases,
): CmsReleaseCatalog {
	const currentVersion = parseVersion(packageVersion);
	if (!currentVersion) throw new Error(`The CMS package has an invalid version: ${packageVersion}`);

	let previousVersion: string | undefined;
	let previousRelease: CmsSchemaRelease | undefined;
	for (const release of releases) {
		const version = parseVersion(release.version);
		if (!version || (previousVersion && compare(version, previousVersion) <= 0)) {
			throw new Error("The CMS schema release registry contains an invalid or unordered version.");
		}
		if (!release.schemaId || !release.schemaExport.startsWith("@repo/cli/")) {
			throw new Error(`The CMS schema release ${release.version} has an invalid schema reference.`);
		}
		if (
			previousRelease &&
			previousRelease.schemaId !== release.schemaId &&
			release.changes.length === 0
		) {
			throw new Error(
				`CMS schema release ${release.version} changes schema identity without recording a database change.`,
			);
		}
		previousVersion = version;
		previousRelease = release;
	}

	const currentIndex = releases.findIndex((release) => release.version === packageVersion);
	if (currentIndex === -1) {
		throw new Error(
			`CMS version ${packageVersion} is missing from the database schema release registry.`,
		);
	}

	return {
		current: releases[currentIndex]!,
		releases: releases.slice(0, currentIndex + 1),
	};
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
		throw new Error(`CMS version ${version} is not present in the installed schema history.`);
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
