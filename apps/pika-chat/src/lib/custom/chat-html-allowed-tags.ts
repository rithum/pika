/**
 * Sync-protected extension point for the chat/trace HTML sanitizer. Custom elements survive only if
 * listed in allowedCustomTags, keeping just the attributes named in allowedCustomAttrs; listing a
 * default-forbidden tag such as 'img' lifts that ban (img/source also regain srcset, video regains poster;
 * allowedCustomAttrs applies to custom elements only). Lifting 'svg' re-allows SVG image/feImage URL loads.
 * on* handlers are always stripped.
 */
export const allowedCustomTags: readonly string[] = [];

export const allowedCustomAttrs: Readonly<Record<string, readonly string[]>> = {};
