import {
	compareCmsReleaseVersions,
	type CmsDatabaseChange,
	type CmsReleaseCatalog,
} from "./release-registry.js";
import {
	validateVersionReference,
	type CmsMigrationState,
	type CmsVersionReference,
} from "./state.js";

export type CmsMigrationPlan =
	| { kind: "baseline-unknown"; currentVersion: string; reason?: string }
	| { kind: "no-changes"; fromVersion: string; toVersion: string }
	| {
			kind: "changes";
			from: CmsVersionReference;
			to: CmsVersionReference;
			changes: Array<{ version: string; change: CmsDatabaseChange }>;
	  };

export function createCmsMigrationPlan(
	state: CmsMigrationState,
	catalog: CmsReleaseCatalog,
): CmsMigrationPlan {
	if (!state.baseline) return { kind: "baseline-unknown", currentVersion: catalog.current.version };

	let baseline: CmsVersionReference;
	try {
		baseline = validateVersionReference(state.baseline, catalog, "baseline");
	} catch (error) {
		return {
			kind: "baseline-unknown",
			currentVersion: catalog.current.version,
			reason: getErrorMessage(error),
		};
	}

	let preparedThrough = state.preparedThrough;
	if (preparedThrough) {
		try {
			preparedThrough = validateVersionReference(preparedThrough, catalog, "prepared");
		} catch (error) {
			return {
				kind: "baseline-unknown",
				currentVersion: catalog.current.version,
				reason: getErrorMessage(error),
			};
		}
		if (compareCmsReleaseVersions(preparedThrough.version, baseline.version, catalog) < 0) {
			return {
				kind: "baseline-unknown",
				currentVersion: catalog.current.version,
				reason: "The prepared migration version is earlier than the recorded baseline.",
			};
		}
	}

	const from = preparedThrough ?? baseline;
	const to = { version: catalog.current.version, schemaId: catalog.current.schemaId };
	const releases = catalog.releases.filter(
		(release) => compareCmsReleaseVersions(release.version, from.version, catalog) > 0,
	);
	const changes = releases.flatMap((release) =>
		release.changes.map((change) => ({ version: release.version, change })),
	);
	if (changes.length === 0) {
		return { kind: "no-changes", fromVersion: from.version, toVersion: to.version };
	}
	return { kind: "changes", from, to, changes };
}

export function formatCmsMigrationPlan(plan: CmsMigrationPlan): string {
	if (plan.kind === "baseline-unknown") {
		const lines = [
			"Database baseline is unknown. The installed CMS schema is not assumed to be applied.",
		];
		if (plan.reason) lines.push(`Recorded state cannot be interpreted: ${plan.reason}`);
		lines.push(
			"For a new database, run `cms migrate init` to generate the initial SQL without applying it.",
			"For an existing database, verify its schema and record it with `cms migrate mark-baseline --version <version>`.",
		);
		return lines.join("\n");
	}
	if (plan.kind === "no-changes") {
		return `No database changes from CMS ${plan.fromVersion} to ${plan.toVersion}.`;
	}

	const lines = [`Database changes from CMS ${plan.from.version} to ${plan.to.version}:`];
	for (const { version, change } of plan.changes) {
		lines.push(`- CMS ${version} (${change.kind}): ${change.summary}`);
		for (const detail of change.details) lines.push(`  ${detail}`);
	}
	lines.push(
		"Run `cms migrate --codex` or `cms migrate --claude` to prepare consumer-owned migration files.",
		`After reviewing the migrations, record them with cms migrate mark-prepared --version ${plan.to.version}.`,
	);
	return lines.join("\n");
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
