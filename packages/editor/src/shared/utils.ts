export function cn(...values: Array<string | false | null | undefined>) {
	return values
		.filter((value): value is string => typeof value === "string" && value.length > 0)
		.join(" ");
}

export function tw<const T>(value: T) {
	return value;
}
