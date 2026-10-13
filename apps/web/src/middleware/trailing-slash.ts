import { trimTrailingSlash } from "hono/trailing-slash";

export default function trailingSlash() {
	return trimTrailingSlash({ alwaysRedirect: true });
}
