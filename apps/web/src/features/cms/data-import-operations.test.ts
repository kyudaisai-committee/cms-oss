import { describe, expect, it } from "vitest";

import { DataImportOperationGate } from "./data-import-operations";

function deferred<T>() {
	let resolve: (value: T) => void = () => undefined;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

describe("data import async operation gate", () => {
	it("does not let a slower earlier file read replace the latest upload", async () => {
		const gate = new DataImportOperationGate();
		const firstRead = deferred<string>();
		const secondRead = deferred<string>();
		let displayedText: string | null = null;
		const firstRevision = gate.beginFileRead();
		const firstResult = firstRead.promise.then((text) => {
			if (gate.isCurrentFileRead(firstRevision)) displayedText = text;
		});
		const secondRevision = gate.beginFileRead();
		const secondResult = secondRead.promise.then((text) => {
			if (gate.isCurrentFileRead(secondRevision)) displayedText = text;
		});

		secondRead.resolve("new file");
		await secondResult;
		firstRead.resolve("old file");
		await firstResult;

		expect(displayedText).toBe("new file");
	});

	it("discards preview results after edits or switching to a different source", () => {
		const gate = new DataImportOperationGate();
		const pendingPreview = gate.beginPreview(1);
		gate.invalidatePreview();
		expect(gate.isCurrentPreview(pendingPreview, 1)).toBe(false);

		const sourcePreview = gate.beginPreview(1);
		expect(gate.isCurrentPreview(sourcePreview, 2)).toBe(false);
		const latestPreview = gate.beginPreview(2);
		expect(gate.isCurrentPreview(sourcePreview, 2)).toBe(false);
		expect(gate.isCurrentPreview(latestPreview, 2)).toBe(true);
	});

	it("invalidates pending previews when a new file is selected", () => {
		const gate = new DataImportOperationGate();
		const pendingPreview = gate.beginPreview(3);

		gate.beginFileRead();

		expect(gate.isCurrentPreview(pendingPreview, 3)).toBe(false);
	});
});
