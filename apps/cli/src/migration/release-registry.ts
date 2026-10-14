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
		version: "0.1.0",
		schemaId: "core-schema-v1",
		schemaExport: "@repo/cli/db/schema",
		changes: [],
	},
] satisfies CmsSchemaRelease[];

export function createCmsReleaseCatalog(
	packageVersion: string,
	releases: CmsSchemaRelease[] = cmsSchemaReleases,
): CmsReleaseCatalog {
	const currentVersion = parseStableVersion(packageVersion);
	if (!currentVersion) throw new Error(`The CMS package has an invalid version: ${packageVersion}`);

	let previousVersion: number[] | undefined;
	let previousRelease: CmsSchemaRelease | undefined;
	for (const release of releases) {
		const version = parseStableVersion(release.version);
		if (!version || (previousVersion && compareVersionParts(version, previousVersion) <= 0)) {
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
	const parsedVersion = parseStableVersion(version);
	if (!parsedVersion) throw new Error(`Invalid CMS version: ${version}`);
	if (compareVersionParts(parsedVersion, parseStableVersion(catalog.current.version)!) > 0) {
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
	return compareVersionParts(parseStableVersion(left.version)!, parseStableVersion(right.version)!);
}

function parseStableVersion(version: string): number[] | undefined {
	const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
	if (!match) return undefined;
	return match.slice(1).map(Number);
}

function compareVersionParts(left: number[], right: number[]): number {
	for (let index = 0; index < left.length; index += 1) {
		const difference = (left[index] ?? 0) - (right[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}
