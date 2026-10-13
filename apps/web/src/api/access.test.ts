import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { actorFromVerifiedClaims, verifyAccessJwt } from "./access.server";

const teamDomain = "tests.cloudflareaccess.example";
const audience = "test-audience";
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let alternatePrivateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

beforeAll(async () => {
	const keys = await generateKeyPair("RS256");
	const alternateKeys = await generateKeyPair("ES256");
	privateKey = keys.privateKey;
	alternatePrivateKey = alternateKeys.privateKey;
	const jwk = await exportJWK(keys.publicKey);
	const alternateJwk = await exportJWK(alternateKeys.publicKey);
	const response = new Response(
		JSON.stringify({
			keys: [
				{ ...jwk, kid: "test-key", alg: "RS256" },
				{ ...alternateJwk, kid: "alternate-test-key", alg: "ES256" },
			],
		}),
		{
			headers: { "Content-Type": "application/json" },
		},
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => response.clone()),
	);
});

afterEach(() => {
	vi.clearAllMocks();
});

function signedToken(
	payload: Record<string, string>,
	options: {
		issuer?: string;
		audience?: string;
		expirationTime?: string | number;
		algorithm?: "RS256" | "ES256";
		keyId?: string;
		key?: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
	} = {},
) {
	return new SignJWT(payload)
		.setProtectedHeader({ alg: options.algorithm ?? "RS256", kid: options.keyId ?? "test-key" })
		.setIssuer(options.issuer ?? `https://${teamDomain}`)
		.setAudience(options.audience ?? audience)
		.setIssuedAt()
		.setExpirationTime(options.expirationTime ?? "5m")
		.sign(options.key ?? privateKey);
}

describe("Cloudflare Access JWT verification", () => {
	it("creates a user actor from verified sub and email claims", async () => {
		const actor = await verifyAccessJwt(
			await signedToken({ sub: "user-123", email: "editor@example.com" }),
			{ ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUDIENCE: audience },
		);
		expect(actor).toEqual({
			type: "user",
			id: "user-123",
			email: "editor@example.com",
			label: "editor@example.com",
		});
	});

	it("creates a service actor from common_name when sub is absent", async () => {
		const actor = await verifyAccessJwt(await signedToken({ common_name: "cms-deployer" }), {
			ACCESS_TEAM_DOMAIN: teamDomain,
			ACCESS_AUDIENCE: audience,
		});
		expect(actor).toEqual({
			type: "service",
			id: "cms-deployer",
			email: null,
			label: "cms-deployer",
		});
	});

	it("prioritizes a user actor when common_name and a valid sub are both present", async () => {
		const actor = await verifyAccessJwt(
			await signedToken({
				sub: "user-123",
				email: "editor@example.com",
				common_name: "spoofed-service-name",
			}),
			{ ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUDIENCE: audience },
		);
		expect(actor).toEqual({
			type: "user",
			id: "user-123",
			email: "editor@example.com",
			label: "editor@example.com",
		});
	});

	it("rejects a verified JWT without an actor claim", async () => {
		await expect(
			verifyAccessJwt(await signedToken({}), {
				ACCESS_TEAM_DOMAIN: teamDomain,
				ACCESS_AUDIENCE: audience,
			}),
		).rejects.toThrow();
	});

	it("rejects a user token without an email claim", async () => {
		await expect(
			verifyAccessJwt(await signedToken({ sub: "user-without-email" }), {
				ACCESS_TEAM_DOMAIN: teamDomain,
				ACCESS_AUDIENCE: audience,
			}),
		).rejects.toThrow();
	});

	it("does not turn unsigned identity headers into an actor", () => {
		expect(() => actorFromVerifiedClaims({})).toThrow();
	});

	it("requires configured team domain and audience", async () => {
		await expect(verifyAccessJwt("not-a-jwt", {})).rejects.toThrow();
	});

	it("rejects a token with an invalid signature", async () => {
		const token = await signedToken({ sub: "user-123", email: "editor@example.com" });
		const [header = "", payload = "", signature = ""] = token.split(".");
		const tampered = `${header}.${payload}.${signature.slice(0, -10)}abcdefghij`;
		await expect(
			verifyAccessJwt(tampered, { ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUDIENCE: audience }),
		).rejects.toThrow();
	});

	it("rejects a token with an invalid issuer or audience", async () => {
		await expect(
			verifyAccessJwt(
				await signedToken(
					{ sub: "user-123", email: "editor@example.com" },
					{ issuer: "https://other.example" },
				),
				{ ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUDIENCE: audience },
			),
		).rejects.toThrow();
		await expect(
			verifyAccessJwt(
				await signedToken(
					{ sub: "user-123", email: "editor@example.com" },
					{ audience: "other-audience" },
				),
				{ ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUDIENCE: audience },
			),
		).rejects.toThrow();
	});

	it("rejects an expired token", async () => {
		await expect(
			verifyAccessJwt(
				await signedToken(
					{ sub: "user-123", email: "editor@example.com" },
					{ expirationTime: Math.floor(Date.now() / 1000) - 1 },
				),
				{ ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUDIENCE: audience },
			),
		).rejects.toThrow();
	});

	it("rejects a correctly signed non-RS256 token", async () => {
		await expect(
			verifyAccessJwt(
				await signedToken(
					{ sub: "user-123", email: "editor@example.com" },
					{ algorithm: "ES256", keyId: "alternate-test-key", key: alternatePrivateKey },
				),
				{ ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUDIENCE: audience },
			),
		).rejects.toThrow();
	});
});
