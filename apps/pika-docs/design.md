## Pika Documentation Website — Design Document (Sveltepress/SvelteKit, static GitHub Pages)

### Purpose and goals

- **Audience**: Developers and solution builders adopting the Pika Platform.
- **Goal**: A clear, searchable, static documentation site with a concise home page, fast navigation, and an opinionated left nav that mirrors the monorepo `docs/` content.
- **Scope (this phase)**:
    - Home page conveys what Pika is and why to adopt, pulling copy from `docs/concepts/` only (no deep product marketing yet).
    - Documentation IA and navigation that map 1:1 to existing docs in `docs/`, excluding `docs/architecture/` entirely.
    - Cheatsheets prioritized at the top of the sidebar.
    - Theming/branding (logo, colors), code highlighting, optional search scaffolding, and static export for GitHub Pages.
    - Authoring standards for headings, frontmatter, admonitions, and embedded Svelte.

References used in this design:

- Introduction and project structure: [Sveltepress Introduction](https://sveltepress.site/guide/introduction/)
- Theme usage and customization: [Sveltepress Themes guide](https://sveltepress.site/guide/themes/)
- Default theme API and options: [Sveltepress Default Theme Reference](https://sveltepress.site/reference/default-theme/)
- Authoring and theme features:
    - [Frontmatter](https://sveltepress.site/guide/default-theme/frontmatter/)
    - [Navbar](https://sveltepress.site/guide/default-theme/navbar/)
    - [Sidebar](https://sveltepress.site/guide/default-theme/sidebar/)
    - [Built-in Components](https://sveltepress.site/guide/default-theme/builtin-components/)
    - [Headings & Anchors](https://sveltepress.site/guide/default-theme/headings-and-anchors/)
    - [Admonitions](https://sveltepress.site/guide/default-theme/admonitions/)
    - [Code related](https://sveltepress.site/guide/default-theme/code-related/)
    - [Twoslash](https://sveltepress.site/guide/default-theme/twoslash/)
    - [Unocss](https://sveltepress.site/guide/default-theme/unocss/)
    - [Docsearch](https://sveltepress.site/guide/default-theme/docsearch/)
    - [Svelte in Markdown](https://sveltepress.site/guide/markdown/svelte-in-markdown/)

### Tech stack and deployment

- **Sveltepress** powered by **SvelteKit** with static adapter. Matches Sveltepress guidance for static builds and layouts [Introduction](https://sveltepress.site/guide/introduction/).
- The project already exists at `apps/pika-docs/` (created via `pnpm create @sveltepress@latest`). Default theme is installed: `@sveltepress/theme-default`.
- Deployment target: **GitHub Pages** (static). We will configure adapter-static and a base path when hosted under a repository subpath.

### Information Architecture (IA) and routing plan

- Routing root remains `apps/pika-docs/src/routes` with required root layout (`+layout.svelte`). Pages are `.md` files recognized by Sveltepress [Introduction](https://sveltepress.site/guide/introduction/).
- We will keep a clean top-level: `/` is the home page; all docs live under `/docs/…` so the left nav is consistent and future-proof.
- Exclude `docs/architecture/` from navigation. Use `docs/concepts/` only to compose the home page content.

Planned routes to generate from `docs/` content:

- `/` (Home): Business-level “What is Pika?”; pull curated excerpts from `docs/concepts/`:

    - `1.nothing-new-under-the-sun.md`
    - `2.agents-flip-the-paradigm.md`
    - `3.agent-basics.md`
    - `4.agents-pika.md`
    - `5.tonicx.md`
    - Keep concise; link into the deeper developer docs under `/docs/`.

- `/docs/cheatsheets/features-cheatsheet` from `docs/features-cheatsheet.md` (prioritized at top)
- `/docs/cheatsheets/features` from `docs/features.md`
- `/docs/overview` from `docs/README.md` (optional overview section if we want a short intro to the doc set)
- `/docs/developer/*` from `docs/developer/` (complete set):
    - `getting-started.md` → `/docs/developer/getting-started`
    - `installation.md` → `/docs/developer/installation`
    - `project-structure.md` → `/docs/developer/project-structure`
    - `local-development.md` → `/docs/developer/local-development`
    - `sync-system.md` → `/docs/developer/sync-system`
    - `customization.md` → `/docs/developer/customization`
    - `authentication.md` → `/docs/developer/authentication`
    - `chat-app-access-control.md` → `/docs/developer/chat-app-access-control`
    - `overriding-features.md` → `/docs/developer/overriding-features`
    - `traces-feature.md` → `/docs/developer/traces-feature`
    - `verify-response-feature.md` → `/docs/developer/verify-response-feature`
    - `chat-disclaimer-notice-feature.md` → `/docs/developer/chat-disclaimer-notice-feature`
    - `user-data-overrides.md` (named `overriding-user-data.md`) → `/docs/developer/overriding-user-data`
    - `entity-feature.md` → `/docs/developer/entity-feature`
    - `site-admin-feature.md` → `/docs/developer/site-admin-feature`
    - `content-admin.md` → `/docs/developer/content-admin`
    - `stack-management.md` → `/docs/developer/stack-management`
    - `aws-deployment.md` → `/docs/developer/aws-deployment`
    - `troubleshooting.md` → `/docs/developer/troubleshooting`

Note: The above preserves filenames while normalizing route-slugs.

### Sidebar design (left nav)

- The left nav uses theme `sidebar` with a prefix key `/docs/` and ordered groups [Sidebar](https://sveltepress.site/guide/default-theme/sidebar/).
- Cheatsheets are surfaced first.
- We omit `docs/architecture/` entirely.

Proposed config (excerpt; to be placed under `defaultTheme({ sidebar: { … } })`):

```ts
sidebar: {
  '/docs/': [
    {
      title: 'Cheatsheets',
      collapsible: false,
      items: [
        { title: 'Pika Features Cheat Sheet', to: '/docs/cheatsheets/features-cheatsheet/' },
        { title: 'Pika Features Overview', to: '/docs/cheatsheets/features/' },
      ],
    },
    {
      title: 'Developer Guide',
      collapsible: true,
      items: [
        { title: 'Getting Started', to: '/docs/developer/getting-started/' },
        { title: 'Installation', to: '/docs/developer/installation/' },
        { title: 'Project Structure', to: '/docs/developer/project-structure/' },
        { title: 'Local Development', to: '/docs/developer/local-development/' },
        { title: 'Sync System', to: '/docs/developer/sync-system/' },
        { title: 'Customization', to: '/docs/developer/customization/' },
        { title: 'Authentication', to: '/docs/developer/authentication/' },
        { title: 'Chat App Access Control', to: '/docs/developer/chat-app-access-control/' },
        { title: 'Overriding Features', to: '/docs/developer/overriding-features/' },
        { title: 'Traces Feature', to: '/docs/developer/traces-feature/' },
        { title: 'Verify Response Feature', to: '/docs/developer/verify-response-feature/' },
        { title: 'Chat Disclaimer Notice', to: '/docs/developer/chat-disclaimer-notice-feature/' },
        { title: 'Overriding User Data', to: '/docs/developer/overriding-user-data/' },
        { title: 'Entity Feature', to: '/docs/developer/entity-feature/' },
        { title: 'Site Admin Feature', to: '/docs/developer/site-admin-feature/' },
        { title: 'Content Admin', to: '/docs/developer/content-admin/' },
        { title: 'Stack Management', to: '/docs/developer/stack-management/' },
        { title: 'AWS Deployment', to: '/docs/developer/aws-deployment/' },
        { title: 'Troubleshooting', to: '/docs/developer/troubleshooting/' },
      ],
    },
    // Optional overview landing within docs
    {
      title: 'Overview',
      collapsible: true,
      items: [
        { title: 'Docs Overview', to: '/docs/overview/' },
      ],
    },
  ],
}
```

### Navbar design

- Keep it minimal [Navbar](https://sveltepress.site/guide/default-theme/navbar/):
    - Home → `/`
    - Docs → `/docs/` (first sidebar item opened by default)
    - GitHub → the monorepo URL
    - Optional: “Open Pika Chat App” link if/when hosted separately

Example snippet for `defaultTheme({ navbar: [...] })`:

```ts
navbar: [
    { title: 'Home', to: '/' },
    { title: 'Docs', to: '/docs/' },
    { title: 'GitHub', to: 'https://github.com/rithum/pika', external: true }
];
```

### Home page content plan (`/`)

- Compose a succinct, business-oriented overview using excerpts from `docs/concepts/` only (no deep tech details here):
    - Problem framing and opportunity (from `1.nothing-new-under-the-sun.md` and `2.agents-flip-the-paradigm.md`).
    - Core ideas and terminology (from `3.agent-basics.md`).
    - What Pika adds (from `4.agents-pika.md`).
    - TonicX positioning (from `5.tonicx.md`) if appropriate.
- Include a prominent CTA to “Get Started” linking to `/docs/developer/getting-started/` and a “Cheatsheet” link to `/docs/cheatsheets/features-cheatsheet/`.
- Use theme built-ins for a simple hero and buttons; keep images light.

### Branding, logo, and colors

- Source all imagery from `apps/pika-docs/logo/`. Copy selected assets into `apps/pika-docs/static/` for stable paths (e.g., `/assets/logo.svg`).
- Select the header SVG from `logo/Pika - Header - Logo/` (SVG preferred). Configure theme `logo` to that path.
- Define theme colors using `themeColor` and consider a gradient for primary CTA [Default Theme Reference](https://sveltepress.site/reference/default-theme/):

```ts
themeColor: {
  light: '#f2f2f2',
  dark: '#18181b',
},
highlighter: {
  twoslash: true,
  languages: ['svelte','ts','js','json','html','css','scss','md','sh'],
}
```

- Fonts: use system fonts by default; if a brand font is required (see `logo/logo-font-name.txt`), we can add it later via CSS and the `app.html` `<link>`.

### Search, analytics, and PWA

- **Docsearch**: Wire Algolia credentials when available [Docsearch](https://sveltepress.site/guide/default-theme/docsearch/). Until then, stub the config.
- **Google Analytics**: Add `ga` only when a valid GA4 id is provided.
- **PWA**: Keep defaults; set basic manifest and theme colors [Default Theme Reference](https://sveltepress.site/reference/default-theme/). Can be enabled later without disrupting content.

### Authoring standards and theme features

- **Frontmatter** [Frontmatter](https://sveltepress.site/guide/default-theme/frontmatter/):

    - Every page should define `title` and optional `description`.
    - Use `outline: [2,3]` (if available) to drive on-page outline depth.
    - Use `prev`/`next` frontmatter only if we want to override defaults.

- **Headings & Anchors** [Headings & Anchors](https://sveltepress.site/guide/default-theme/headings-and-anchors/):

    - Start pages at `##` for top-level sections; keep a consistent hierarchy to produce stable anchors.
    - Avoid overly deep nesting; prefer `##` and `###` with concise titles.

- **Admonitions** [Admonitions](https://sveltepress.site/guide/default-theme/admonitions/):

    - Use sparingly to highlight warnings and tips; favor short, actionable text.
    - Prefer “Tip”, “Note”, “Warning”, and “Caution”.

- **Code related & Twoslash** [Code related](https://sveltepress.site/guide/default-theme/code-related/), [Twoslash](https://sveltepress.site/guide/default-theme/twoslash/):

    - Use proper language tags: `ts`, `svelte`, `bash`, `json`.
    - Turn on `twoslash` in theme and use selectively for TypeScript demos.
    - Keep code blocks runnable and short; link out for long examples.

- **Svelte in Markdown** [Svelte in Markdown](https://sveltepress.site/guide/markdown/svelte-in-markdown/):

    - Inline small demo components directly inside `.md` when it clarifies a concept.
    - For shared demos, place components under `src/lib/` and import them into pages.

- **Built-in Components & Unocss** [Built-in Components](https://sveltepress.site/guide/default-theme/builtin-components/), [Unocss](https://sveltepress.site/guide/default-theme/unocss/):
    - Use built-ins for layout elements and simple UI blocks as needed.
    - Unocss utility classes are available for quick styling; keep usage minimal and consistent.

### Concrete theme configuration plan

- Update `apps/pika-docs/vite.config.ts` to set theme options [Themes](https://sveltepress.site/guide/themes/), [Default Theme Reference](https://sveltepress.site/reference/default-theme/):

```ts
import { defaultTheme } from '@sveltepress/theme-default';
import { sveltepress } from '@sveltepress/vite';

export default defineConfig({
    plugins: [
        sveltepress({
            theme: defaultTheme({
                navbar: [
                    { title: 'Home', to: '/' },
                    { title: 'Docs', to: '/docs/' },
                    { title: 'GitHub', to: 'https://github.com/rithum/pika', external: true }
                ],
                sidebar: {
                    '/docs/': [
                        /* as defined in Sidebar design */
                    ]
                },
                logo: '/assets/pika-logo.svg',
                github: 'https://github.com/rithum/pika',
                editLink: 'https://github.com/rithum/pika/edit/main/apps/pika-docs/src/routes/:route',
                highlighter: { twoslash: true, languages: ['svelte', 'ts', 'js', 'json', 'html', 'css', 'scss', 'md', 'sh'] },
                themeColor: { light: '#f2f2f2', dark: '#18181b' },
                docsearch: {
                    appId: '<ALGOLIA_APP_ID>',
                    apiKey: '<ALGOLIA_SEARCH_KEY>',
                    indexName: 'pika'
                },
                preBuildIconifyIcons: {
                    logos: ['svelte-kit', 'typescript-icon'],
                    'vscode-icons': ['file-type-svelte', 'file-type-markdown', 'file-type-vite']
                }
            }),
            siteConfig: {
                title: 'Pika Platform',
                description: 'An AWS framework for sparking agent innovation by supporting rapid iteration'
            }
        })
    ]
});
```

- Add theme types to `src/app.d.ts` for better DX [Default Theme Reference → Working with TypeScript](https://sveltepress.site/reference/default-theme/):

```ts
/// <reference types="@sveltepress/theme-default/types" />
```

### Content migration plan (from `docs/` to `src/routes/`)

1. Create route folders under `apps/pika-docs/src/routes/docs/`:
    - `cheatsheets/`
    - `developer/`
    - Optional: `overview/`
2. For each source file, create a corresponding `+page.md` with frontmatter:
    - Title: humanized from filename
    - Description: 1–2 sentence summary
    - Optional `outline` depth
3. Normalize headings: start page sections at `##`.
4. Keep images under `apps/pika-docs/static/` (e.g., `/images/...`) for stable paths.
5. Ensure all internal links resolve to the new `/docs/...` routes (update relative links as needed).
6. Configure sidebar (above) so left nav matches this structure.

### GitHub Pages deployment

- Use `@sveltejs/adapter-static` (already a devDependency). For GitHub Pages under a project subpath, set base path in Vite/SvelteKit. Ensure `trailingSlash: 'always'` if we prefer directory-style URLs (aligns with many static hosts) [Introduction](https://sveltepress.site/guide/introduction/).
- Add a GitHub Actions workflow to build and publish the `apps/pika-docs` output to `gh-pages`. Validate that asset paths (`/assets/...`) work with the chosen base.

### Acceptance criteria

- Sidebar matches the “Sidebar design” list exactly; no `architecture/` pages.
- Home page shows concise business framing sourced from `concepts/` and links to Getting Started and Cheatsheet.
- All pages have proper titles/descriptions in frontmatter and use consistent heading hierarchy.
- Code blocks render with syntax highlighting; Twoslash works for TypeScript examples where used.
- Optional: Search box appears (when Algolia keys present).
- Static build completes and can be served from GitHub Pages.

### Implementation checklist (for the executor)

- [ ] Copy selected brand assets from `logo/` into `static/assets/` and set `logo` path.
- [ ] Create `/docs/cheatsheets/` and `/docs/developer/` route trees; port content with frontmatter.
- [ ] Compose Home page (`/`) from `concepts/` excerpts with CTA buttons.
- [ ] Update `vite.config.ts` with navbar, sidebar, theme options, and stubs for `docsearch`/`ga`.
- [ ] Add theme types to `src/app.d.ts`.
- [ ] Verify anchors, code highlighting, admonitions, and any Svelte-in-Markdown embeds.
- [ ] Configure adapter-static and (if needed) base path for GitHub Pages.
