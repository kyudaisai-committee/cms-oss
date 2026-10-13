"use client";

import {
	Autocomplete,
	Button,
	Input,
	LayerCard,
	Text,
	useKumoToastManager,
} from "@cloudflare/kumo";
import { useForm } from "@tanstack/react-form";
import { useAtom, useSetAtom } from "jotai";
import { PlusIcon } from "lucide-react";
import { useRouter } from "waku";

import { StatusMessage } from "#web/components/status-message";
import { scopePath } from "#web/features/cms/site";

import { ensureScope } from "../../scope-api";
import { availableScopesAtom, cmsErrorAtom, cmsPendingAtom, selectedScopeAtom } from "../../store";

export function CreateScopeCard({ siteCandidates }: { siteCandidates: string[] }) {
	const router = useRouter();
	const [pending, setPending] = useAtom(cmsPendingAtom);
	const [error, setError] = useAtom(cmsErrorAtom);
	const setAvailableScopes = useSetAtom(availableScopesAtom);
	const setSelectedScope = useSetAtom(selectedScopeAtom);
	const toast = useKumoToastManager();
	const form = useForm({
		defaultValues: {
			year: "",
			site: "",
			name: "",
			availableLanguages: "ja, en",
			defaultLanguage: "ja",
		},
		onSubmit: async ({ value }) => {
			const input = {
				year: Number(value.year),
				site: value.site.trim(),
				name: value.name.trim() || undefined,
				availableLanguages: value.availableLanguages
					.split(",")
					.map((language) => language.trim())
					.filter(Boolean),
				defaultLanguage: value.defaultLanguage.trim() || undefined,
			};
			setPending(true);
			setError(null);
			try {
				const scope = await ensureScope(input);
				setAvailableScopes((current) => [...current.filter((item) => item.id !== scope.id), scope]);
				setSelectedScope(scope);
				form.reset();
				toast.add({ title: "スコープを作成しました。", variant: "success" });
				void router.push(scopePath(scope));
			} catch (cause) {
				const nextMessage =
					cause instanceof Error ? cause.message : "スコープを作成できませんでした。";
				setError(nextMessage);
				toast.add({
					description: nextMessage,
					title: "スコープを作成できませんでした。",
					variant: "error",
				});
			} finally {
				setPending(false);
			}
		},
	});

	return (
		<>
			{error ? (
				<StatusMessage className="mb-5" tone="error">
					{error}
				</StatusMessage>
			) : null}

			<LayerCard className="mb-6 grid gap-4 p-5">
				<div className="flex flex-col gap-1">
					<Text as="h2" variant="heading" size="lg">
						スコープを作成
					</Text>
					<Text variant="secondary" size="base">
						年度とサイトを登録すると、そのスコープのお知らせを管理できます。
					</Text>
				</div>
				<form
					autoComplete="off"
					className="grid w-full gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<div className="grid max-w-3xl items-start gap-4 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
						<form.Field
							name="year"
							validators={{
								onChange: ({ value }) =>
									/^\d{4}$/.test(value) && Number(value) > 0
										? undefined
										: "年度は1〜9999の4桁で入力してください。",
								onSubmit: ({ value }) =>
									/^\d{4}$/.test(value) && Number(value) > 0
										? undefined
										: "年度は1〜9999の4桁で入力してください。",
							}}
						>
							{(field) => {
								const fieldError = field.state.meta.errors[0];
								return (
									<Input
										autoComplete="off"
										id={field.name}
										aria-invalid={fieldError !== undefined}
										aria-label="年度"
										{...(fieldError ? { error: fieldError } : {})}
										inputMode="numeric"
										label="年度"
										maxLength={4}
										placeholder="2026"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
								);
							}}
						</form.Field>

						<form.Field
							name="site"
							validators={{
								onChange: ({ value }) => (value.trim() ? undefined : "サイトを入力してください。"),
								onSubmit: ({ value }) => (value.trim() ? undefined : "サイトを入力してください。"),
							}}
						>
							{(field) => {
								const fieldError = field.state.meta.errors[0];
								return (
									<div onBlur={field.handleBlur}>
										<Autocomplete
											items={siteCandidates}
											value={field.state.value}
											onValueChange={(value) => field.handleChange(value)}
											label="サイト"
											description="管理画面のURLに使うサイト識別子です。"
											{...(fieldError ? { error: fieldError } : {})}
										>
											<Autocomplete.InputGroup />
											<Autocomplete.Content>
												<Autocomplete.List>
													{(item) => (
														<Autocomplete.Item key={item} value={item}>
															{item}
														</Autocomplete.Item>
													)}
												</Autocomplete.List>
											</Autocomplete.Content>
										</Autocomplete>
									</div>
								);
							}}
						</form.Field>

						<div className="sm:col-span-2">
							<form.Field name="name">
								{(field) => (
									<Input
										aria-label="スコープ名"
										description="任意。未入力の場合はサイト名が使われます。"
										label="名前（任意）"
										autoComplete="off"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
								)}
							</form.Field>
						</div>

						<div className="grid gap-4 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
							<form.Field name="availableLanguages">
								{(field) => (
									<Input
										aria-label="利用可能な言語"
										description="BCP 47言語タグをカンマ区切りで入力します。"
										label="利用可能な言語"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
								)}
							</form.Field>

							<form.Field name="defaultLanguage">
								{(field) => (
									<Input
										aria-label="既定の言語"
										description="langを省略した公開APIで使います。"
										label="既定の言語"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
								)}
							</form.Field>
						</div>
					</div>
					<div className="flex justify-end">
						<Button disabled={pending} loading={pending} type="submit" variant="primary">
							<PlusIcon aria-hidden="true" className="size-4" />
							作成して管理を開始
						</Button>
					</div>
				</form>
			</LayerCard>
		</>
	);
}
