import { compareCmsReleaseVersions, type CmsReleaseCatalog } from "./release-registry.js";
import {
	resolveVersionReference,
	validateVersionReference,
	type CmsMigrationState,
} from "./state.js";

export function recordCmsBaseline(
	state: CmsMigrationState,
	version: string,
	catalog: CmsReleaseCatalog,
): CmsMigrationState {
	const baseline = resolveVersionReference(version, catalog);
	if (state.baseline) {
		validateVersionReference(state.baseline, catalog, "baseline");
		if (compareCmsReleaseVersions(version, state.baseline.version, catalog) < 0) {
			throw new Error("The baseline version cannot move backwards.");
		}
	}
	if (state.preparedThrough) {
		validateVersionReference(state.preparedThrough, catalog, "prepared");
		if (compareCmsReleaseVersions(version, state.preparedThrough.version, catalog) > 0) {
			throw new Error(
				"Prepare migration files through this version before advancing the baseline.",
			);
		}
	}
	return { ...state, baseline };
}

export function recordCmsPreparedThrough(
	state: CmsMigrationState,
	version: string,
	catalog: CmsReleaseCatalog,
): CmsMigrationState {
	if (!state.baseline) {
		throw new Error("A verified baseline is required before recording prepared migrations.");
	}
	validateVersionReference(state.baseline, catalog, "baseline");
	const preparedThrough = resolveVersionReference(version, catalog);
	if (compareCmsReleaseVersions(version, state.baseline.version, catalog) < 0) {
		throw new Error("Prepared migrations cannot move behind the recorded baseline.");
	}
	if (state.preparedThrough) {
		validateVersionReference(state.preparedThrough, catalog, "prepared");
		if (compareCmsReleaseVersions(version, state.preparedThrough.version, catalog) < 0) {
			throw new Error("The prepared migration version cannot move backwards.");
		}
	}
	return { ...state, preparedThrough };
}
