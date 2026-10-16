export interface CmsDatabaseChange {
	kind: "schema" | "data";
	summary: string;
	details: readonly string[];
}

export interface CmsDatabaseRelease {
	version: string;
	changes: readonly CmsDatabaseChange[];
}
