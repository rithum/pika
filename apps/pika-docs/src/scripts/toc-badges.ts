/**
 * Client-side script to ensure badges appear in the table of contents
 * This runs after the page loads to inject badge elements into TOC links
 * Works with both default Starlight TOC and custom TOC overrides
 */

function ensureBadgesInTOC() {
    // Find all headings with badges
    const headingsWithBadges = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

    headingsWithBadges.forEach((heading) => {
        const badge = heading.querySelector('.sl-badge');
        if (!badge) return;

        const headingId = heading.getAttribute('id');
        if (!headingId) return;

        // Try multiple selectors to support both default and custom TOC
        const selectors = [
            `starlight-toc a[href="#${headingId}"] span`, // Default Starlight TOC
            `.toc-link[href="#${headingId}"] span`, // Custom desktop TOC
            `.mobile-toc-link[href="#${headingId}"] span` // Custom mobile TOC
        ];

        selectors.forEach((selector) => {
            const tocLink = document.querySelector(selector);
            if (!tocLink) return;

            // Clone the badge and append it to the TOC link
            const badgeClone = badge.cloneNode(true) as HTMLElement;
            badgeClone.style.fontSize = '0.6875rem';
            badgeClone.style.padding = '0.125rem 0.4375rem';
            badgeClone.style.marginLeft = '0.375rem';

            // Only add if not already present
            if (!tocLink.querySelector('.sl-badge')) {
                tocLink.appendChild(badgeClone);
            }
        });
    });
}

// Run on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureBadgesInTOC);
} else {
    ensureBadgesInTOC();
}

// Re-run when navigating with View Transitions
document.addEventListener('astro:page-load', ensureBadgesInTOC);
