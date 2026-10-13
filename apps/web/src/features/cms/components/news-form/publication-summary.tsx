"use client";

import { Badge, Button, LayerCard, Text } from "@cloudflare/kumo";
import { Undo2Icon } from "lucide-react";

import type { AdminNewsDto } from "@repo/core/types";

import { formatNewsDate } from "./formatting";

const statusLabels = {
	draft: "下書き",
	published: "公開中",
} as const;

export function NewsPublicationSummary({
	news,
	pending,
	onUnpublish,
}: {
	news: AdminNewsDto;
	pending: boolean;
	onUnpublish: () => void;
}) {
	return (
		<LayerCard className="grid gap-3 p-5">
			<Text as="h2" variant="heading" size="lg">
				公開情報
			</Text>
			<div className="grid gap-3 sm:grid-cols-2">
				<div>
					<Text as="p" variant="secondary" size="base">
						ステータス
					</Text>
					<Badge className="mt-1" variant={news.status === "published" ? "success" : "secondary"}>
						{statusLabels[news.status]}
					</Badge>
				</div>
				<div>
					<Text as="p" variant="secondary" size="base">
						最終更新
					</Text>
					<Text as="p" size="base">
						{formatNewsDate(news.updatedAt)}（{news.updatedBy}）
					</Text>
				</div>
			</div>
			{news.status === "published" ? (
				<div>
					<Button disabled={pending} type="button" variant="secondary" onClick={onUnpublish}>
						<Undo2Icon aria-hidden="true" className="size-4" />
						公開を取り消す
					</Button>
				</div>
			) : null}
		</LayerCard>
	);
}
