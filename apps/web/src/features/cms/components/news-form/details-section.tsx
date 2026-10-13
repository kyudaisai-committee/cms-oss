"use client";

import {
	Badge,
	Button,
	Checkbox,
	DatePicker,
	Field,
	Input,
	Label,
	LayerCard,
	Popover,
	Text,
	Textarea,
} from "@cloudflare/kumo";
import { format } from "date-fns";
import { ja } from "date-fns/locale/ja";
import { CalendarIcon, XIcon } from "lucide-react";
import { useState } from "react";

import type { TagDto } from "@repo/core/types";

import type { NewsFormApi } from "./form";
import { getLanguageLabel, toDatePickerDate } from "./formatting";

export function NewsDetailsSection({
	activeLang,
	form,
	tags,
}: {
	activeLang: string;
	form: NewsFormApi;
	tags: TagDto[];
}) {
	const [publishDateOpen, setPublishDateOpen] = useState(false);
	return (
		<LayerCard className="grid gap-5 p-5">
			<div className="flex flex-col gap-1">
				<Text as="h2" variant="heading" size="lg">
					基本情報
				</Text>
				<Text variant="secondary" size="base">
					一覧に表示する情報を入力してください。
				</Text>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<form.Field name="lang">
					{() => (
						<div className="grid gap-1.5 sm:col-span-2">
							<Label>編集中の言語</Label>
							<div>
								<Badge variant="secondary">{getLanguageLabel(activeLang)}</Badge>
							</div>
						</div>
					)}
				</form.Field>
				<form.Field
					name="title"
					validators={{
						onChange: ({ value }) =>
							value.trim().length > 0 ? undefined : "タイトルを入力してください。",
						onSubmit: ({ value }) =>
							value.trim().length > 0 ? undefined : "タイトルを入力してください。",
					}}
				>
					{(field) => {
						const fieldError = field.state.meta.errors[0];
						return (
							<Input
								autoComplete="off"
								aria-invalid={fieldError !== undefined}
								description="一覧や公開ページに表示されます。"
								{...(fieldError ? { error: fieldError } : {})}
								label="タイトル"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
							/>
						);
					}}
				</form.Field>
				<form.Field
					name="slug"
					validators={{
						onChange: ({ value }) =>
							/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.trim().toLowerCase())
								? undefined
								: "スラッグは半角英数字とハイフンで入力してください。",
						onSubmit: ({ value }) =>
							/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.trim().toLowerCase())
								? undefined
								: "スラッグは半角英数字とハイフンで入力してください。",
					}}
				>
					{(field) => {
						const fieldError = field.state.meta.errors[0];
						return (
							<Input
								autoComplete="off"
								aria-invalid={fieldError !== undefined}
								description="URLに使う半角英数字の識別子です。"
								{...(fieldError ? { error: fieldError } : {})}
								label="スラッグ"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
							/>
						);
					}}
				</form.Field>
				<form.Field name="summary">
					{(field) => (
						<Textarea
							autoComplete="off"
							className="sm:col-span-2"
							description="一覧に表示する短い説明です。"
							label="概要（任意）"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(event) => field.handleChange(event.target.value)}
						/>
					)}
				</form.Field>
				<form.Field
					name="publishedAt"
					validators={{
						onChange: ({ value }) =>
							!value || !Number.isNaN(new Date(value).getTime())
								? undefined
								: "公開日時を確認してください。",
						onSubmit: ({ value }) =>
							!value || !Number.isNaN(new Date(value).getTime())
								? undefined
								: "公開日時を確認してください。",
					}}
				>
					{(field) => {
						const fieldError = field.state.meta.errors[0];
						const datePart = field.state.value.slice(0, 10);
						const timePart = field.state.value.slice(11, 16);
						const selectedDate = toDatePickerDate(field.state.value);
						return (
							<div className="sm:col-span-2">
								<Field
									description="日本時間で入力します。空欄で公開すると即時公開されます。"
									{...(fieldError
										? {
												error: {
													message: fieldError,
													match: "customError" as const,
												},
											}
										: {})}
									hideLabel
									label="公開日時（任意）"
								>
									<div className="grid gap-1">
										<Label htmlFor="published-at-date">公開日時（任意）</Label>
										<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
											<Popover open={publishDateOpen} onOpenChange={setPublishDateOpen}>
												<Popover.Trigger
													render={
														<Button
															aria-controls="published-at-calendar"
															aria-expanded={publishDateOpen}
															className="w-full justify-start"
															id="published-at-date"
															type="button"
															variant="secondary"
														/>
													}
												>
													<CalendarIcon aria-hidden="true" className="size-4" />
													{selectedDate ? format(selectedDate, "yyyy/MM/dd") : "日付を選択"}
												</Popover.Trigger>
												<Popover.Content side="bottom">
													<div id="published-at-calendar">
														<Popover.Title>公開日を選択</Popover.Title>
														<Popover.Description>
															日本時間の日付を選択してください。
														</Popover.Description>
														<div className="mt-3">
															<DatePicker
																locale={ja}
																mode="single"
																selected={selectedDate}
																onChange={(date) => {
																	if (!date) return;
																	const nextDate = format(date, "yyyy-MM-dd");
																	const nextTime = /^\d{2}:\d{2}$/.test(timePart)
																		? timePart
																		: "00:00";
																	field.handleChange(`${nextDate}T${nextTime}`);
																	setPublishDateOpen(false);
																}}
															/>
														</div>
													</div>
												</Popover.Content>
											</Popover>
											<Input
												autoComplete="off"
												aria-invalid={fieldError !== undefined}
												disabled={!datePart}
												label="時刻（日本時間）"
												step={60}
												type="time"
												value={timePart}
												onBlur={field.handleBlur}
												onChange={(event) => {
													const nextTime = event.target.value;
													field.handleChange(nextTime ? `${datePart}T${nextTime}` : "");
												}}
											/>
											<Button
												className="w-full sm:w-auto"
												disabled={!field.state.value}
												type="button"
												variant="ghost"
												onClick={() => {
													field.handleChange("");
													setPublishDateOpen(false);
												}}
											>
												<XIcon aria-hidden="true" className="size-4" />
												クリア
											</Button>
										</div>
									</div>
								</Field>
							</div>
						);
					}}
				</form.Field>
			</div>
			<form.Field name="tagIds">
				{(field) => (
					<Checkbox.Group
						description="お知らせを分類するタグを選択してください。"
						{...(field.state.meta.errors[0] ? { error: field.state.meta.errors[0] } : {})}
						legend="タグ"
						value={field.state.value}
						onValueChange={field.handleChange}
					>
						{tags.length === 0 ? (
							<Text variant="secondary" size="base">
								利用できるタグはまだありません。
							</Text>
						) : (
							<div className="grid gap-2 sm:grid-cols-2">
								{tags.map((tag) => (
									<Checkbox.Item key={tag.id} label={tag.name} value={tag.id} />
								))}
							</div>
						)}
					</Checkbox.Group>
				)}
			</form.Field>
		</LayerCard>
	);
}
