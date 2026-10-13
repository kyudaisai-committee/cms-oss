import { fsRouter } from "waku";
import adapter from "waku/adapters/cloudflare";

const handlers = fsRouter(import.meta.glob("./pages/**/*.{tsx,ts}"));

export default adapter(handlers, {
	middlewareModules: import.meta.glob(["./middleware/*.ts", "!./middleware/*.test.ts"]),
});
