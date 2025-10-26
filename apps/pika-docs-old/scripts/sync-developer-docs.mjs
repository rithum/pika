import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve paths relative to this script's location to avoid CWD issues
const repoRoot = path.resolve(__dirname, '../../..'); // .../pika
const appRoot = path.resolve(__dirname, '..'); // .../pika/apps/pika-docs
const sourceDir = path.join(repoRoot, 'docs', 'developer');
const destRoot = path.join(appRoot, 'src', 'routes', 'docs', 'developer');

/** Convert a filename (without extension) into a route slug (keep as-is) */
function toSlug(basename) {
    return basename;
}

/** Humanize a filename to a Title */
function toTitleFromBasename(basename) {
    return basename
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build mapping of filename -> route path */
async function buildFilenameToRouteMap() {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    const map = new Map();
    for (const e of entries) {
        if (e.isFile() && e.name.endsWith('.md')) {
            const basename = e.name.replace(/\.md$/, '');
            const slug = toSlug(basename);
            map.set(e.name, `/docs/developer/${slug}/`);
        }
    }
    return map;
}

/** Rewrite relative links like ./foo.md to the Sveltepress route */
function rewriteRelativeLinks(markdown, filenameToRoute) {
    return markdown.replace(/\]\(\.\/([^\)#]+)(#[^\)]*)?\)/g, (match, file, hash = '') => {
        const withExt = file.endsWith('.md') ? file : `${file}.md`;
        const route = filenameToRoute.get(withExt);
        if (!route) return match;
        return `](${route}${hash ?? ''})`;
    });
}

async function ensureDir(p) {
    await fs.mkdir(p, { recursive: true });
}

async function main() {
    const filenameToRoute = await buildFilenameToRouteMap();
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });

    for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith('.md')) continue;

        const srcPath = path.join(sourceDir, e.name);
        const raw = await fs.readFile(srcPath, 'utf8');

        const basename = e.name.replace(/\.md$/, '');
        const slug = toSlug(basename);
        const title = toTitleFromBasename(basename);

        const frontmatter = `---\n` + `title: ${title}\n` + `description: Imported from docs/developer/${e.name}\n` + `outline: [2,3]\n` + `---\n\n`;

        const rewritten = rewriteRelativeLinks(raw, filenameToRoute);

        const destDir = path.join(destRoot, slug);
        const destFile = path.join(destDir, '+page.md');
        await ensureDir(destDir);
        await fs.writeFile(destFile, frontmatter + rewritten, 'utf8');
    }

    // Ensure Troubleshooting exists if source exists
    const troubleshootSrc = path.join(sourceDir, 'troubleshooting.md');
    try {
        await fs.access(troubleshootSrc);
    } catch {
        // ignore
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
