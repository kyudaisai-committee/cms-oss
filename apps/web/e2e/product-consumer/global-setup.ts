import { mkdtempDisposable } from "node:fs/promises";
import path from "node:path";

import type { TestProject } from "vitest/node";

import { prepareProductConsumer, type ProductConsumerAssets } from "./environment";

declare module "vitest" {
	interface ProvidedContext {
		productConsumerAssets: ProductConsumerAssets;
	}
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
	await using resources = new AsyncDisposableStack();
	const temporaryDirectory = await mkdtempDisposable(
		path.join(import.meta.dirname, ".product-consumer-"),
	);
	resources.use(temporaryDirectory);
	const repositoryRoot = path.resolve(import.meta.dirname, "../../../..");
	const assets = await prepareProductConsumer(temporaryDirectory.path, repositoryRoot);
	project.provide("productConsumerAssets", assets);
	const ownership = resources.move();
	return async function teardown() {
		await ownership.disposeAsync();
	};
}
