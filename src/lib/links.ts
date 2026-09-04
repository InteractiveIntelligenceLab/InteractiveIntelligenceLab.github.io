export function isExternalUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/** Spread onto an <a> to get target=_blank + rel=noopener noreferrer only for external links. */
export function externalAttrs(href: string): Record<string, string> {
  return isExternalUrl(href) ? { target: "_blank", rel: "noopener noreferrer" } : {};
}
