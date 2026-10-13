import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NewsFormSyncStatus } from "./news-form-status";

const state = {
	title: "お知らせ",
	slug: "notice",
	summary: "概要",
	contentType: "markdown" as const,
	content: "本文",
	lang: "ja",
	tagIds: ["tag-1"],
	publishedAt: "",
};

function renderStatus(props: { draftBaseFingerprint: string | null; values: typeof state }) {
	return renderToStaticMarkup(
		createElement(NewsFormSyncStatus, {
			...props,
			serverBaseState: state,
			serverFingerprint: "server-fingerprint",
		}),
	);
}

describe("NewsFormSyncStatus", () => {
	it("does not show a warning when the form matches the server", () => {
		expect(renderStatus({ draftBaseFingerprint: "server-fingerprint", values: state })).toBe("");
	});

	it("shows the unsaved state when form values differ from the server", () => {
		const markup = renderStatus({
			draftBaseFingerprint: "server-fingerprint",
			values: { ...state, title: "変更後のお知らせ" },
		});

		expect(markup).toContain("未保存の変更あり");
		expect(markup).not.toContain("サーバー側で別の更新が検出されました");
	});

	it("shows a conflict warning when the draft server base is stale", () => {
		const markup = renderStatus({
			draftBaseFingerprint: "stale-server-fingerprint",
			values: state,
		});

		expect(markup).toContain("サーバー側で別の更新が検出されました");
		expect(markup).toContain('role="alert"');
	});
});
