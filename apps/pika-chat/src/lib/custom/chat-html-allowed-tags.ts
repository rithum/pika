/**
 * Sync-protected extension point for the chat/trace HTML sanitizer. Custom elements survive only if
 * listed in allowedCustomTags, keeping just the attributes named in allowedCustomAttrs; listing a
 * default-forbidden tag such as 'img' lifts that ban (with DOMPurify's default attributes for that tag; allowedCustomAttrs
 * applies to custom elements only). on* handlers are always stripped.
 */
export const allowedCustomTags: readonly string[] = [];

export const allowedCustomAttrs: Readonly<Record<string, readonly string[]>> = {};
