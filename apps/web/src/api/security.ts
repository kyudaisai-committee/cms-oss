export type ApiSecurityRequirement = Record<string, string[]>;

/** Browser cookie OR the two headers used by a Cloudflare Access service token. */
export const cloudflareAccessSecurity: ApiSecurityRequirement[] = [
	{ cloudflareAccessCookie: [] },
	{ cloudflareAccessClientId: [], cloudflareAccessClientSecret: [] },
];

export const cloudflareAccessSecuritySchemes = {
	cloudflareAccessCookie: {
		type: "apiKey",
		in: "cookie",
		name: "CF_Authorization",
		description: "Cloudflare Access browser session cookie.",
	},
	cloudflareAccessClientId: {
		type: "apiKey",
		in: "header",
		name: "CF-Access-Client-Id",
		description: "Cloudflare Access service token client ID.",
	},
	cloudflareAccessClientSecret: {
		type: "apiKey",
		in: "header",
		name: "CF-Access-Client-Secret",
		description: "Cloudflare Access service token client secret.",
	},
} as const;
