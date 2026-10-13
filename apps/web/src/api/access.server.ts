import "server-only";

import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyResult } from "jose";

import { actorSchema, type CmsActor } from "@repo/core/types";

export type AccessEnvironment = {
	ACCESS_TEAM_DOMAIN?: string;
	ACCESS_AUDIENCE?: string;
};
type AccessJwks = ReturnType<typeof createRemoteJWKSet>;
export type AccessJwtVerifier = (
	assertion: string,
	environment: AccessEnvironment,
) => Promise<CmsActor>;

const remoteJwks = new Map<string, AccessJwks>();

export const localActor = actorSchema.parse({
	type: "local",
	id: "local",
	email: null,
	label: "local development",
});

function requiredEnvironmentValue(value: string | undefined) {
	const trimmed = value?.trim();
	if (!trimmed) throw new Error("Cloudflare Access configuration is missing.");
	return trimmed;
}

function jwksFor(teamDomain: string) {
	const cached = remoteJwks.get(teamDomain);
	if (cached) return cached;
	const jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
	remoteJwks.set(teamDomain, jwks);
	return jwks;
}

function stringClaim(payload: JWTPayload, name: string) {
	const value = payload[name];
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Creates an audit actor from claims after jose has verified the JWT. */
export function actorFromVerifiedClaims(payload: JWTPayload): CmsActor {
	const subject = stringClaim(payload, "sub");
	const commonName = stringClaim(payload, "common_name");
	const email = stringClaim(payload, "email");

	if (subject) {
		if (!email) throw new Error("Cloudflare Access user JWT has no email claim.");
		return actorSchema.parse({
			type: "user",
			id: subject,
			email,
			label: email,
		});
	}
	if (commonName) {
		return actorSchema.parse({
			type: "service",
			id: commonName,
			email: null,
			label: commonName,
		});
	}
	throw new Error("Cloudflare Access JWT does not identify an actor.");
}

export async function verifyAccessJwt(
	assertion: Parameters<AccessJwtVerifier>[0],
	environment: Parameters<AccessJwtVerifier>[1],
): ReturnType<AccessJwtVerifier> {
	const teamDomain = requiredEnvironmentValue(environment.ACCESS_TEAM_DOMAIN);
	const audience = requiredEnvironmentValue(environment.ACCESS_AUDIENCE);
	const result: JWTVerifyResult = await jwtVerify(assertion, jwksFor(teamDomain), {
		issuer: `https://${teamDomain}`,
		audience,
		algorithms: ["RS256"],
	});
	return actorFromVerifiedClaims(result.payload);
}
