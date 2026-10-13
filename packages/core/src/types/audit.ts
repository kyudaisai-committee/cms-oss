import { z } from "zod";

import { actorSchema } from "./common";

export const auditChangesSchema = z.record(z.string(), z.unknown());
export const auditEntrySchema = z.object({
	actor: actorSchema,
	action: z.string().min(1),
	entityType: z.string().min(1),
	entityId: z.string().min(1),
	changes: auditChangesSchema,
	scopeId: z.string().nullable().optional(),
	createdAt: z.date(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export const auditDtoSchema = z.object({
	id: z.string(),
	scopeId: z.string().nullable(),
	actor: actorSchema,
	action: z.string(),
	entityType: z.string(),
	entityId: z.string(),
	changes: auditChangesSchema.nullable(),
	createdAt: z.iso.datetime(),
});
export type AuditDto = z.infer<typeof auditDtoSchema>;
