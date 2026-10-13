export type CmsErrorCode = "validation" | "not_found" | "conflict";

export class CmsError extends Error {
	readonly name = "CmsError";

	constructor(
		readonly code: CmsErrorCode,
		message: string,
	) {
		super(message);
	}
}
