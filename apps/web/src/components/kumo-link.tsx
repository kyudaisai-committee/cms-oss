"use client";

import { type LinkComponentProps } from "@cloudflare/kumo";
import { forwardRef } from "react";
import { Link as WakuLink } from "waku";
import type { Unstable_RouteHref as WakuRouteHref } from "waku/router/client-core";

type LinkRoutingProps = Pick<LinkComponentProps, "download" | "href" | "target">;

/**
 * Returns whether a link can be handled by Waku's client router.
 *
 * Kumo's LinkProvider intentionally receives all anchor props, so routing
 * decisions need to happen at this boundary. Only same-origin app paths are
 * eligible; browser-managed downloads and links with an explicit browsing
 * context must remain regular anchors.
 */
export function shouldUseWakuLink({ href, target, download }: LinkRoutingProps) {
	const isInternalPath = typeof href === "string" && href.startsWith("/") && !href.startsWith("//");
	const usesCurrentBrowsingContext = target === undefined || target === "_self";

	return isInternalPath && usesCurrentBrowsingContext && download === undefined;
}

export const KumoLinkAdapter = forwardRef<HTMLAnchorElement, LinkComponentProps>(
	function KumoLinkAdapter({ download, href, target, ...props }, ref) {
		if (!shouldUseWakuLink({ download, href, target })) {
			return (
				<a
					{...props}
					{...(href === undefined ? {} : { href })}
					{...(download === undefined ? {} : { download })}
					{...(target === undefined ? {} : { target })}
					{...(target === "_blank" && props.rel === undefined
						? { rel: "noopener noreferrer" }
						: {})}
					ref={ref}
				/>
			);
		}

		const { children, ...linkProps } = props;
		return (
			<WakuLink {...linkProps} ref={ref} to={href as WakuRouteHref}>
				{children}
			</WakuLink>
		);
	},
);

KumoLinkAdapter.displayName = "KumoLinkAdapter";
