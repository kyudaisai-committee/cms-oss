"use client";

import { Input, LayerCard, Radio, Text } from "@cloudflare/kumo";

import type { NewsContentType, ScopeRef } from "@repo/core/types";
import { MarkdownEditor } from "@repo/editor";

import { AssetUploadPanel } from "../asset-upload-panel";
import { validateNewsContent } from "../news-form-model";
import type { NewsFormApi } from "./form";

export function NewsContentSection({
	form,
	scope,
	editorInstanceKey,
}: {
	form: NewsFormApi;
	scope: ScopeRef;
	editorInstanceKey: number;
}) {
	return (
		<>
			<LayerCard className="grid gap-4 p-5">
				<div className="flex flex-col gap-1">
					<Text as="h2" variant="heading" size="lg">
						コンテンツ
					</Text>
					<Text variant="secondary" size="base">
						Markdown本文またはリンク先を選択してください。
					</Text>
				</div>
				<form.Field name="contentType">
					{(field) => (
						<Radio.Group<NewsContentType>
							description="公開ページで表示する内容の種類です。"
							legend="内容種別"
							name="content-type"
							value={field.state.value}
							onValueChange={(value) => field.handleChange(value)}
						>
							<Radio.Item label="Markdown本文" value="markdown" />
							<Radio.Item label="リンク先" value="link" />
						</Radio.Group>
					)}
				</form.Field>
				<form.Subscribe
					selector={(state) => ({
						contentType: state.values.contentType,
						title: state.values.title,
					})}
				>
					{({ contentType, title }) =>
						contentType === "markdown" ? (
							<form.Field
								name="content"
								validators={{
									onChange: ({ value }) => validateNewsContent(contentType, value),
									onSubmit: ({ value }) => validateNewsContent(contentType, value),
								}}
							>
								{(field) => {
									const fieldError = field.state.meta.errors[0];
									return (
										<div className="grid gap-1">
											<MarkdownEditor
												key={editorInstanceKey}
												ariaLabel="お知らせ本文のMarkdownエディター"
												initialMarkdown={field.state.value}
												onMarkdownChange={field.handleChange}
												title={title}
											/>
											{fieldError ? (
												<Text as="p" size="base" variant="error">
													{fieldError}
												</Text>
											) : null}
										</div>
									);
								}}
							</form.Field>
						) : (
							<form.Field
								name="content"
								validators={{
									onChange: ({ value }) => validateNewsContent(contentType, value),
									onSubmit: ({ value }) => validateNewsContent(contentType, value),
								}}
							>
								{(field) => {
									const fieldError = field.state.meta.errors[0];
									return (
										<Input
											aria-invalid={fieldError !== undefined}
											description="公開先の http(s) URL を入力してください。"
											{...(fieldError ? { error: fieldError } : {})}
											label="リンク先"
											type="url"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) => field.handleChange(event.target.value)}
										/>
									);
								}}
							</form.Field>
						)
					}
				</form.Subscribe>
			</LayerCard>

			<form.Subscribe selector={(state) => state.values.contentType}>
				{(contentType) => (contentType === "markdown" ? <AssetUploadPanel scope={scope} /> : null)}
			</form.Subscribe>
		</>
	);
}
