import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
	createCmsReleaseCatalog,
	resolveCmsSchemaRelease,
	type CmsReleaseCatalog,
} from "./release-registry.js";

export const migrationStateFileName = "cms-state.json";

export interface CmsVersionReference {
	version: string;
	schemaId: string;
}

export interface CmsMigrationState {
	formatVersion: 1;
	baseline: CmsVersionReference | null;
	preparedThrough: CmsVersionReference | null;
}

export interface CmsMigrationContext {
	catalog: CmsReleaseCatalog;
	state: CmsMigrationState;
	statePath: string;
}

export async function createCmsMigrationContext(
	packageRoot: string,
	projectRoot: string,
): Promise<CmsMigrationContext> {
	const packageManifestPath = join(packageRoot, "package.json");
	const packageManifest: unknown = JSON.parse(await readFile(packageManifestPath, "utf8"));
	if (!isRecord(packageManifest) || typeof packageManifest.version !== "string") {
		throw new Error(`The CMS package manifest has no version: ${packageManifestPath}`);
	}
	const statePath = join(projectRoot, "drizzle", migrationStateFileName);
	return {
		catalog: createCmsReleaseCatalog(packageManifest.version),
		state: await readCmsMigrationState(statePath),
		statePath,
	};
}

export async function readCmsMigrationState(statePath: string): Promise<CmsMigrationState> {
	const contents = await readFile(statePath, "utf8").catch((error: unknown) => {
		if (hasErrorCode(error, "ENOENT")) return undefined;
		throw error;
	});
	if (contents === undefined) return createEmptyCmsMigrationState();

	let parsed: unknown;
	try {
		parsed = JSON.parse(contents);
	} catch (error) {
		throw new Error(`The CMS migration state is not valid JSON: ${statePath}`, { cause: error });
	}
	if (
		!isRecord(parsed) ||
		parsed.formatVersion !== 1 ||
		!("baseline" in parsed) ||
		!("preparedThrough" in parsed)
	) {
		throw new Error(`The CMS migration state has an unsupported format: ${statePath}`);
	}
	return {
		formatVersion: 1,
		baseline: parseVersionReference(parsed.baseline, statePath),
		preparedThrough: parseVersionReference(parsed.preparedThrough, statePath),
	};
}

export async function writeCmsMigrationState(
	statePath: string,
	state: CmsMigrationState,
): Promise<void> {
	await mkdir(dirname(statePath), { recursive: true });
	const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { flag: "wx" });
	await rename(temporaryPath, statePath);
}

export function createEmptyCmsMigrationState(): CmsMigrationState {
	return { formatVersion: 1, baseline: null, preparedThrough: null };
}

export function resolveVersionReference(
	version: string,
	catalog: CmsReleaseCatalog,
): CmsVersionReference {
	const release = resolveCmsSchemaRelease(version, catalog);
	return { version: release.version, schemaId: release.schemaId };
}

export function validateVersionReference(
	reference: CmsVersionReference,
	catalog: CmsReleaseCatalog,
	label: string,
): CmsVersionReference {
	const release = resolveCmsSchemaRelease(reference.version, catalog);
	if (release.schemaId !== reference.schemaId) {
		throw new Error(
			`The recorded ${label} schema ${reference.schemaId} does not match CMS ${reference.version} (${release.schemaId}).`,
		);
	}
	return reference;
}

function parseVersionReference(value: unknown, statePath: string): CmsVersionReference | null {
	if (value === null) return null;
	if (
		typeof value !== "object" ||
		value === null ||
		!("version" in value) ||
		typeof value.version !== "string" ||
		!("schemaId" in value) ||
		typeof value.schemaId !== "string"
	) {
		throw new Error(`The CMS migration state contains an invalid version reference: ${statePath}`);
	}
	return { version: value.version, schemaId: value.schemaId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
