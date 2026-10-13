import { HTTPException } from "hono/http-exception";
import { z } from "zod";

export const timeCursorSchema = z.object({
	timestamp: z.iso.datetime(),
	id: z.string().min(1),
});
export type TimeCursor = z.infer<typeof timeCursorSchema>;

export function encodeCursor(cursor: TimeCursor) {
	const validated = timeCursorSchema.safeParse(cursor);
	if (!validated.success) throw new HTTPException(400, { message: "Cursor has an invalid shape." });
	const encoded = new TextEncoder().encode(JSON.stringify(validated.data));
	let binary = "";
	for (const byte of encoded) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeCursor(value: string | undefined): TimeCursor | null {
	if (!value) return null;
	try {
		const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
		const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
		const binary = atob(padded);
		const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
		return timeCursorSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
	} catch {
		throw new HTTPException(400, { message: "Cursor is invalid." });
	}
}
