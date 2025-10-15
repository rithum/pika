const iconCache: Record<string, string> = {};

/**
 * This is useful when you need to dynamically retrieve the SVG for an icon.
 * It will cache the icon SVG so that it doesn't need to be fetched multiple times.
 * It will also return the same SVG for the same icon name and collection.
 *
 * @param iconName - The name of the icon to retrieve.
 * @param collection - The collection of the icon to retrieve. Today we only support lucide.
 * @returns The SVG for the icon.
 */
export async function getIconSvg(iconName: string, collection = 'lucide'): Promise<string> {
    // Today we only support lucide
    if (collection !== 'lucide') {
        throw new Error(`Unsupported collection: ${collection}`);
    }

    // Lucide icon names must be lower case and they are all hyphen based, not camel case
    // If the icon name isn't all lower case then throw an error so the developer knows to use the correct icon name
    if (iconName !== iconName.toLowerCase()) {
        throw new Error(`Icon name must be all lower case and hyphen based: ${iconName}`);
    }

    const iconKey = `${collection}:${iconName}`;
    if (iconCache[iconKey]) {
        return iconCache[iconKey];
    }

    const lucideIconUrl = `https://cdn.jsdelivr.net/npm/lucide-static@0/icons/${iconName}.svg`;

    // Use fetch to get the icon SVG
    const response = await fetch(lucideIconUrl);
    let iconSvg = await response.text();

    // Replace the width and height attributes with width="24" and height="24"
    iconSvg = iconSvg.replace(/width="\d+" height="\d+"/, 'width="24" height="24"');

    iconCache[iconKey] = iconSvg;
    return iconSvg;
}
