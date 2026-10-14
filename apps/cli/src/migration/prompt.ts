import type { CmsMigrationPlan } from "./plan.js";

type ChangePlan = Extract<CmsMigrationPlan, { kind: "changes" }>;

export interface CmsMigrationPromptInput {
	plan: ChangePlan;
	schemaExport: string;
	configPath: string;
	drizzleConfigPath: string;
	migrationsDirectory: string;
}

export function createCmsMigrationPrompt(input: CmsMigrationPromptInput): string {
	const lines = [
		"Prepare the consumer-owned database migration for this CMS update.",
		"",
		`Update range: CMS ${input.plan.from.version} (${input.plan.from.schemaId}) to CMS ${input.plan.to.version} (${input.plan.to.schemaId}).`,
		"",
		"Registered database changes:",
	];
	for (const { version, change } of input.plan.changes) {
		lines.push(`- CMS ${version} (${change.kind}): ${change.summary}`);
		for (const detail of change.details) lines.push(`  - ${detail}`);
	}
	lines.push(
		"",
		"Consumer-owned inputs:",
		`- CMS configuration: ${input.configPath}`,
		`- Drizzle configuration: ${input.drizzleConfigPath}`,
		`- Migration output directory: ${input.migrationsDirectory}`,
		`- Installed current schema export: ${input.schemaExport}`,
		"",
		"Requirements:",
		"- Inspect the existing SQL, snapshot, journal, and relevant consumer data before editing.",
		"- Generate or update only consumer-owned migration SQL, Drizzle snapshot, and journal files.",
		"- Preserve existing IDs, data, and foreign-key relationships; implement every registered data transformation and ordering detail above.",
		"- Use the consumer's installed Drizzle Kit and configuration. Do not install tools or configure credentials.",
		"- Do not apply migrations to any D1 database, and do not update cms-state.json or claim a migration is prepared.",
		"- Summarize the generated files, the review and validation still needed, and any assumption that could not be verified.",
	);
	return lines.join("\n");
}
