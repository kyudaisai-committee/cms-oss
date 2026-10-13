import type { Locator } from "playwright-core";
import { expect } from "vitest";

interface ComparisonField {
	sourceLabel: string;
	currentLabel: string;
}

const comparisonFields: readonly ComparisonField[] = [
	{ sourceLabel: "取り込み先言語", currentLabel: "比較対象言語" },
	{ sourceLabel: "公開状態・公開日時", currentLabel: "公開状態・公開日時" },
	{ sourceLabel: "タイトル", currentLabel: "タイトル" },
	{ sourceLabel: "概要", currentLabel: "概要" },
	{ sourceLabel: "タグ", currentLabel: "タグ" },
	{ sourceLabel: "本文またはリンク", currentLabel: "本文またはリンク" },
];

async function waitForStableComparisonLayout(comparison: Locator): Promise<void> {
	await comparison.evaluate(async (section) => {
		const dialog = section.closest('[role="dialog"]');
		const animations = dialog?.getAnimations({ subtree: true }) ?? [];
		await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	});
}

export async function assertComparisonFieldsAligned(comparison: Locator): Promise<void> {
	await waitForStableComparisonLayout(comparison);
	for (const { sourceLabel, currentLabel } of comparisonFields) {
		const positions = await comparison.evaluate(
			(section, labels) => {
				function getY(label: string): number | null {
					const group = Array.from(section.querySelectorAll<HTMLElement>('[role="group"]')).find(
						(element) => element.getAttribute("aria-label") === label,
					);
					return group?.getBoundingClientRect().y ?? null;
				}

				return {
					sourceY: getY(labels.sourceLabel),
					currentY: getY(labels.currentLabel),
				};
			},
			{
				sourceLabel: `取り込む側: ${sourceLabel}`,
				currentLabel: `現在の内容: ${currentLabel}`,
			},
		);
		if (positions.sourceY === null || positions.currentY === null)
			throw new Error(`${sourceLabel} comparison fields must be measurable`);
		expect(
			Math.abs(positions.sourceY - positions.currentY),
			`${sourceLabel} comparison fields must start at the same y coordinate (${positions.sourceY} vs ${positions.currentY})`,
		).toBeLessThanOrEqual(1);
	}
}

export async function assertComparisonValueStartsAligned(
	comparison: Locator,
	sourceLabel: string,
	currentLabel: string,
	sourceValue: string,
	currentValue: string,
): Promise<void> {
	await waitForStableComparisonLayout(comparison);
	const positions = await comparison.evaluate(
		(section, values) => {
			function getGroup(label: string): HTMLElement | undefined {
				return Array.from(section.querySelectorAll<HTMLElement>('[role="group"]')).find(
					(element) => element.getAttribute("aria-label") === label,
				);
			}

			function getTextY(group: HTMLElement | undefined, text: string): number | null {
				if (!group) return null;
				const matchingElements = Array.from(group.querySelectorAll<HTMLElement>("*")).filter(
					(element) => element.textContent?.trim() === text,
				);
				return matchingElements.at(-1)?.getBoundingClientRect().y ?? null;
			}

			return {
				sourceY: getTextY(getGroup(values.sourceLabel), values.sourceValue),
				currentY: getTextY(getGroup(values.currentLabel), values.currentValue),
			};
		},
		{
			sourceLabel: `取り込む側: ${sourceLabel}`,
			currentLabel: `現在の内容: ${currentLabel}`,
			sourceValue,
			currentValue,
		},
	);
	if (positions.sourceY === null || positions.currentY === null)
		throw new Error(`${sourceLabel} comparison values must be measurable`);
	expect(
		Math.abs(positions.sourceY - positions.currentY),
		`${sourceLabel} comparison values must start at the same y coordinate (${positions.sourceY} vs ${positions.currentY})`,
	).toBeLessThanOrEqual(1);
}

export async function assertComparisonColumnsStacked(comparison: Locator): Promise<void> {
	await waitForStableComparisonLayout(comparison);
	const positions = await comparison.evaluate((section) => {
		function getBounds(label: string) {
			const group = Array.from(section.querySelectorAll<HTMLElement>('[role="group"]')).find(
				(element) => element.getAttribute("aria-label") === label,
			);
			if (!group) return null;
			const bounds = group.getBoundingClientRect();
			return { top: bounds.top, bottom: bounds.bottom };
		}

		return {
			source: getBounds("取り込む側: タイトル"),
			current: getBounds("現在の内容: タイトル"),
		};
	});
	if (!positions.source || !positions.current)
		throw new Error("comparison columns must be measurable on narrow screens");
	expect(
		positions.source.bottom <= positions.current.top ||
			positions.current.bottom <= positions.source.top,
		"comparison columns must stack without overlap on a narrow viewport",
	).toBe(true);
}
