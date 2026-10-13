import { $, createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";

import {
	apiEnvelopeSchema,
	apiErrorEnvelopeSchema,
	assetUploadInputSchema,
	assetUploadMaxBytes,
} from "#api/contracts";
import { assetDtoSchema, scopeRefSchema } from "@repo/core/types";

import { apiErrorResponses, methodNotAllowed, noStoreHeaders } from "../errors";
import type { ApiEnv } from "../utils";
import { envelope, requireService } from "../utils";

function parseRange(value: string | undefined, size: number) {
	if (!value) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(value);
	if (!match || (!match[1] && !match[2])) return "invalid" as const;
	const startValue = match[1];
	const endValue = match[2];
	if (!startValue) {
		const suffixLength = Number(endValue);
		if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) return "invalid" as const;
		const offset = Math.max(size - suffixLength, 0);
		return { offset, length: size - offset };
	}
	const offset = Number(startValue);
	if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size) return "invalid" as const;
	const requestedEnd = endValue ? Number(endValue) : size - 1;
	if (!Number.isSafeInteger(requestedEnd) || requestedEnd < offset) return "invalid" as const;
	const end = Math.min(requestedEnd, size - 1);
	return { offset, length: end - offset + 1 };
}

function disposition(filename: string) {
	const fallback = filename.replace(/["\r\n]/g, "_") || "asset";
	return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function safeExtension(filename: string) {
	const extension = filename.includes(".") ? (filename.split(".").at(-1) ?? "") : "";
	return /^[A-Za-z0-9]{1,16}$/.test(extension) ? `.${extension.toLowerCase()}` : "";
}

const objectRoute = createRoute({
	method: "get",
	path: "/{year}/{site}/assets/{id}",
	request: { params: scopeRefSchema.extend({ id: assetDtoSchema.shape.id }) },
	responses: {
		...apiErrorResponses,
		200: {
			description: "Asset object",
			content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
		},
		206: {
			description: "Partial asset object",
			content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
		},
		304: {
			description: "Asset has not changed",
			headers: { ETag: { schema: { type: "string" } } },
		},
		404: {
			description: "Asset not found",
			content: { "application/json": { schema: apiErrorEnvelopeSchema } },
		},
		416: {
			description: "Requested range is not satisfiable",
			headers: { "Content-Range": { schema: { type: "string" } } },
		},
	},
});

const list = createRoute({
	method: "get",
	path: "/{year}/{site}/assets",
	request: { params: scopeRefSchema },
	responses: {
		...apiErrorResponses,
		200: {
			description: "Assets",
			content: { "application/json": { schema: apiEnvelopeSchema(assetDtoSchema.array()) } },
		},
	},
});

const adminDetail = createRoute({
	method: "get",
	path: "/{year}/{site}/assets/{id}",
	request: { params: scopeRefSchema.extend({ id: assetDtoSchema.shape.id }) },
	responses: {
		...apiErrorResponses,
		200: {
			description: "Asset metadata",
			content: { "application/json": { schema: apiEnvelopeSchema(assetDtoSchema) } },
		},
	},
});

const upload = createRoute({
	method: "post",
	path: "/{year}/{site}/assets",
	request: {
		params: scopeRefSchema,
		body: {
			required: true,
			content: { "multipart/form-data": { schema: assetUploadInputSchema } },
		},
	},
	responses: {
		...apiErrorResponses,
		201: {
			description: "Created asset metadata",
			content: { "application/json": { schema: apiEnvelopeSchema(assetDtoSchema) } },
		},
		409: {
			description: "Asset conflict",
			content: { "application/json": { schema: apiErrorEnvelopeSchema } },
		},
	},
});

const remove = createRoute({
	method: "delete",
	path: "/{year}/{site}/assets/{id}",
	request: { params: scopeRefSchema.extend({ id: assetDtoSchema.shape.id }) },
	responses: { ...apiErrorResponses, 204: { description: "Deleted asset" } },
});

export const publicAssetRoutes = new OpenAPIHono<ApiEnv>().openapi(objectRoute, async (c) => {
	const metadata = await requireService(c).getAsset(c.req.valid("param").id);
	const current = await c.env.ASSETS.get(metadata.objectKey);
	if (!current) return c.json({ error: { message: "Asset object was not found." } }, 404);
	if (c.req.header("if-none-match") === current.httpEtag) {
		return new Response(null, { status: 304, headers: { ETag: current.httpEtag } });
	}
	const range = parseRange(c.req.header("range"), current.size);
	if (range === "invalid")
		return new Response(null, {
			status: 416,
			headers: { "Content-Range": `bytes */${current.size}` },
		});
	const object = range ? await c.env.ASSETS.get(metadata.objectKey, { range }) : current;
	if (!object)
		return new Response(null, {
			status: 416,
			headers: { "Content-Range": `bytes */${current.size}` },
		});
	const headers = new Headers({
		"Accept-Ranges": "bytes",
		"Cache-Control": "public, max-age=300, must-revalidate",
		"Content-Disposition": disposition(metadata.filename),
		"Content-Length": String(range?.length ?? object.size),
		"Content-Type": current.httpMetadata?.contentType ?? metadata.mimeType,
		ETag: current.httpEtag,
	});
	if (range)
		headers.set(
			"Content-Range",
			`bytes ${range.offset}-${range.offset + range.length - 1}/${current.size}`,
		);
	return new Response(c.req.method === "HEAD" ? null : object.body, {
		status: range ? 206 : 200,
		headers,
	});
});

publicAssetRoutes.on(
	["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"],
	"/:year/:site/assets/:id",
	(c) => methodNotAllowed(c, ["GET"]),
);

export const adminAssetRoutes = $(
	new OpenAPIHono<ApiEnv>().use(
		"/:year/:site/assets",
		bodyLimit({ maxSize: assetUploadMaxBytes + 64 * 1024 }),
	),
)
	.openapi(list, async (c) =>
		c.json(envelope(await requireService(c).listAssets()), 200, noStoreHeaders),
	)
	.openapi(adminDetail, async (c) =>
		c.json(
			envelope(await requireService(c).getAsset(c.req.valid("param").id)),
			200,
			noStoreHeaders,
		),
	)
	.openapi(upload, async (c) => {
		const { file } = c.req.valid("form");
		const objectKey = `assets/${crypto.randomUUID()}${safeExtension(file.name)}`;
		const mimeType = file.type || "application/octet-stream";
		await c.env.ASSETS.put(objectKey, file.stream(), {
			httpMetadata: { contentType: mimeType, contentDisposition: disposition(file.name) },
		});
		try {
			const metadata = await requireService(c).createAsset({
				objectKey,
				filename: file.name,
				mimeType,
				size: file.size,
			});
			return c.json(envelope(metadata), 201, noStoreHeaders);
		} catch (error) {
			await c.env.ASSETS.delete(objectKey);
			throw error;
		}
	})
	.openapi(remove, async (c) => {
		const metadata = await requireService(c).deleteAsset(c.req.valid("param").id);
		await c.env.ASSETS.delete(metadata.objectKey);
		return new Response(null, { status: 204, headers: noStoreHeaders });
	});

adminAssetRoutes.on(["PUT", "PATCH", "DELETE", "OPTIONS", "QUERY"], "/:year/:site/assets", (c) =>
	methodNotAllowed(c, ["GET", "POST"]),
);
adminAssetRoutes.on(["GET", "POST", "OPTIONS", "QUERY"], "/:year/:site/assets/:id", (c) =>
	methodNotAllowed(c, ["DELETE"]),
);
