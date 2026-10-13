"use client";

import { Button, Dialog, Input, Select, Text, useKumoToastManager } from "@cloudflare/kumo";
import { SaveIcon, SettingsIcon, XIcon } from "lucide-react";
import { useState } from "react";

import type { ScopeDto } from "@repo/core/types";

import { updateScope } from "../../scope-api";

function getLanguageLabel(language: string) {
	try {
		return new Intl.DisplayNames(["ja"], { type: "language" }).of(language) ?? language;
	} catch {
		return language;
	}
}

export function ScopeLanguageSettings({
	scope,
	onUpdated,
}: {
	scope: ScopeDto;
	onUpdated: (scope: ScopeDto) => void;
}) {
	const [open, setOpen] = useState(false);
	const [languages, setLanguages] = useState(scope.availableLanguages.join(", "));
	const [defaultLanguage, setDefaultLanguage] = useState(scope.defaultLanguage);
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const toast = useKumoToastManager();
	const languageOptions = languages
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
	const save = () => {
		setPending(true);
		setMessage(null);
		void updateScope(scope, {
			name: scope.name,
			availableLanguages: languages
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean),
			defaultLanguage: defaultLanguage.trim(),
		})
			.then((updated) => {
				onUpdated(updated);
				setLanguages(updated.availableLanguages.join(", "));
				setDefaultLanguage(updated.defaultLanguage);
				setOpen(false);
				toast.add({ title: "言語設定を更新しました。", variant: "success" });
			})
			.catch((cause: unknown) => {
				const nextMessage =
					cause instanceof Error ? cause.message : "言語設定を更新できませんでした。";
				setMessage(nextMessage);
			})
			.finally(() => setPending(false));
	};
	return (
		<>
			<Button
				aria-label={`${scope.name}の設定`}
				icon={<SettingsIcon aria-hidden="true" className="size-4" />}
				title={`${scope.name}の設定`}
				type="button"
				variant="secondary"
				shape="square"
				size="sm"
				onClick={() => setOpen(true)}
			/>
			<Dialog.Root open={open} onOpenChange={setOpen}>
				<Dialog className="grid gap-4 p-5">
					<Dialog.Title>スコープ設定</Dialog.Title>
					<Dialog.Description>
						このスコープで利用する言語と、langを省略した公開APIの既定言語を設定します。
					</Dialog.Description>
					<div className="grid gap-3">
						<Input
							aria-label={`${scope.name}の利用可能な言語`}
							label="利用可能な言語"
							value={languages}
							onChange={(event) => setLanguages(event.target.value)}
						/>
						<Select
							aria-label={`${scope.name}の既定の言語`}
							label="既定の言語"
							value={defaultLanguage}
							onValueChange={(value) => {
								if (typeof value === "string") setDefaultLanguage(value);
							}}
						>
							{languageOptions.map((language) => (
								<Select.Option key={language} value={language}>
									{getLanguageLabel(language)} ({language})
								</Select.Option>
							))}
						</Select>
					</div>
					{message ? (
						<Text variant="secondary" size="sm">
							{message}
						</Text>
					) : null}
					<div className="flex justify-end gap-2">
						<Button type="button" variant="secondary" onClick={() => setOpen(false)}>
							<XIcon aria-hidden="true" className="size-4" />
							キャンセル
						</Button>
						<Button
							disabled={pending}
							loading={pending}
							onClick={save}
							type="button"
							variant="primary"
						>
							<SaveIcon aria-hidden="true" className="size-4" />
							保存
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</>
	);
}
