import { tz } from "@date-fns/tz";
import { format, isValid, parseISO } from "date-fns";

const japanTimeZoneContext = tz("Asia/Tokyo");

export function getLanguageLabel(language: string) {
	try {
		return new Intl.DisplayNames(["ja"], { type: "language" }).of(language) ?? language;
	} catch {
		return language;
	}
}

export function formatNewsDate(value: string) {
	const date = parseISO(value);
	return isValid(date)
		? format(date, "yyyy/MM/dd HH:mm", { in: japanTimeZoneContext })
		: "日時不明";
}

export function toDatePickerDate(value: string) {
	const datePart = value.slice(0, 10);
	const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
	if (!dateMatch) return undefined;
	const year = Number(dateMatch[1]);
	const month = Number(dateMatch[2]);
	const day = Number(dateMatch[3]);
	const date = new Date(year, month - 1, day);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
		? date
		: undefined;
}
