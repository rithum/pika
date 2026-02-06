/**
 * Theme Vite Plugin
 *
 * Generates CSS from the theme config at build time with HMR support.
 * When pika-config.ts or the theme config changes, regenerates the theme CSS
 * and triggers a full page reload.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createJiti } from 'jiti';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { HmrContext, Plugin, ViteDevServer } from 'vite';
import type { PikaConfig } from '../../../../packages/shared/src/types/chatbot/chatbot-types';
import type { ThemeConfig } from '../../../../packages/shared/src/types/chatbot/theme-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const generatedThemeCssFileName = 'generated-theme.css';
const chatWebAppStylesDirName = 'apps/pika-chat/src/lib/styles';
const pikaConfigFileName = 'pika-config.ts';

/** Marker separating the file header comment from the CSS body */
const HEADER_END_MARKER = ' */\n\n';

export async function themeVitePlugin(): Promise<Plugin> {
    let server: ViteDevServer | null = null;
    let pikaConfigAbsolutePath: string | undefined;
    let themeConfigAbsolutePath: string | undefined;

    return {
        name: 'theme-vite-plugin',

        async buildStart() {
            await generateThemeCss();
        },

        configureServer(_server) {
            server = _server;
            pikaConfigAbsolutePath = findPathToPikaConfig();

            if (!pikaConfigAbsolutePath) {
                console.warn('[theme-vite-plugin] Could not find pika-config.ts to watch');
                return;
            }

            _server.watcher.add(pikaConfigAbsolutePath);

            // Return post hook to set up theme config watcher after server is ready
            return async () => {
                const projectRoot = path.dirname(pikaConfigAbsolutePath!);
                const pikaConfig = await loadPikaConfig(pikaConfigAbsolutePath!);
                
                if (pikaConfig?.siteFeatures?.uiCustomization?.customTheme?.themeConfigPath) {
                    const themeConfigPath = getThemeConfigAbsolutePath(
                        projectRoot, 
                        pikaConfig.siteFeatures.uiCustomization.customTheme.themeConfigPath
                    );
                    if (themeConfigPath && existsSync(themeConfigPath)) {
                        themeConfigAbsolutePath = themeConfigPath;
                        _server.watcher.add(themeConfigAbsolutePath);
                        console.log('[theme-vite-plugin] Watching theme config:', themeConfigAbsolutePath);
                    }
                }
            };
        },

        async handleHotUpdate(ctx: HmrContext) {
            const changedFile = path.resolve(ctx.file);

            // Check if pika-config.ts changed
            const isPikaConfigChange = pikaConfigAbsolutePath && changedFile === path.resolve(pikaConfigAbsolutePath);

            // Check if theme config changed
            const isThemeConfigChange = themeConfigAbsolutePath && changedFile === path.resolve(themeConfigAbsolutePath);

            if (isPikaConfigChange || isThemeConfigChange) {
                try {
                    console.log('[theme-vite-plugin] Config changed, regenerating theme CSS...');
                    await generateThemeCss();

                    ctx.server.ws.send({
                        type: 'full-reload',
                        path: '*'
                    });
                } catch (error) {
                    console.error('[theme-vite-plugin] Failed to regenerate theme:', error);
                }
                return [];
            }
        }
    };
}

function findPathToPikaConfig(): string | undefined {
    let currentDir = __dirname;

    while (currentDir !== '/' && currentDir !== path.parse(currentDir).root) {
        const candidate = path.join(currentDir, pikaConfigFileName);
        if (existsSync(candidate)) {
            return path.resolve(candidate);
        }
        currentDir = path.dirname(currentDir);
    }
    return undefined;
}

/**
 * Load pika-config.ts using jiti for proper TypeScript module loading
 */
async function loadPikaConfig(pikaConfigPath: string): Promise<PikaConfig | undefined> {
    try {
        const jiti = createJiti(import.meta.url, { cache: false, requireCache: false });
        const pikaConfigModule = (await jiti.import(pikaConfigPath)) as { pikaConfig: PikaConfig };
        return pikaConfigModule.pikaConfig;
    } catch (error) {
        console.error('[theme-vite-plugin] Failed to load pika-config.ts:', error);
        return undefined;
    }
}

/**
 * Load theme config using jiti for proper TypeScript module loading
 */
async function loadThemeConfig(themeConfigPath: string): Promise<ThemeConfig | undefined> {
    try {
        const jiti = createJiti(import.meta.url, { cache: false, requireCache: false });
        const themeModule = (await jiti.import(themeConfigPath)) as { themeConfig: ThemeConfig };
        return themeModule.themeConfig;
    } catch (error) {
        console.error('[theme-vite-plugin] Failed to load theme config:', error);
        return undefined;
    }
}

function getThemeConfigAbsolutePath(projectRoot: string, configPath?: string): string | undefined {
    if (!configPath) {
        return undefined;
    }
    // Path is relative to apps/pika-chat/
    return path.join(projectRoot, 'apps/pika-chat', configPath + '.ts');
}

async function generateThemeCss(): Promise<void> {
    const pikaConfigPath = findPathToPikaConfig();
    if (!pikaConfigPath) {
        console.log('[theme-vite-plugin] No pika-config.ts found, skipping theme generation');
        return;
    }

    const projectRoot = path.dirname(pikaConfigPath);
    const pikaConfig = await loadPikaConfig(pikaConfigPath);
    
    if (!pikaConfig) {
        writeThemeCssIfChanged('/* Failed to load pika-config.ts */\n', 'Error', projectRoot);
        return;
    }

    const customTheme = pikaConfig.siteFeatures?.uiCustomization?.customTheme;

    // If custom theme is disabled, generate empty CSS
    if (!customTheme?.enabled) {
        console.log('[theme-vite-plugin] Custom theme disabled, using default theme');
        writeThemeCssIfChanged('/* Custom theme disabled - using default Pika theme */\n', 'Default', projectRoot);
        return;
    }

    // Load theme config
    const themeConfigPath = getThemeConfigAbsolutePath(projectRoot, customTheme.themeConfigPath);
    if (!themeConfigPath) {
        console.warn('[theme-vite-plugin] No themeConfigPath specified in customTheme config');
        writeThemeCssIfChanged('/* No themeConfigPath specified in pika-config.ts */\n', 'Error', projectRoot);
        return;
    }
    if (!existsSync(themeConfigPath)) {
        console.warn('[theme-vite-plugin] Theme config file not found:', themeConfigPath);
        console.warn('[theme-vite-plugin] Create this file to customize your theme.');
        writeThemeCssIfChanged(`/* Theme config not found at: ${themeConfigPath} */\n`, 'Error', projectRoot);
        return;
    }

    const themeConfig = await loadThemeConfig(themeConfigPath);
    if (!themeConfig) {
        writeThemeCssIfChanged('/* Failed to load or no themeConfig exported from theme config file */\n', 'Error', projectRoot);
        return;
    }

    // Generate CSS body from theme config (without header)
    const themeName = themeConfig.name || 'Custom Theme';
    const body = generateCssBody(themeConfig);
    const written = writeThemeCssIfChanged(body, themeName, projectRoot);

    if (written) {
        console.log(`[theme-vite-plugin] Generated theme CSS: ${themeName}`);
    }
}

function buildFileHeader(themeName: string): string {
    const timestamp = new Date().toISOString();
    return `/**
 * Generated Theme CSS
 * Theme: ${themeName}
 * Generated at: ${timestamp}
 * DO NOT EDIT - This file is auto-generated by theme-vite-plugin
 */

`;
}

/**
 * Generate only the CSS rules from the theme config (no header comment).
 * The header is added separately by writeThemeCssIfChanged so the body
 * can be compared against the existing file to avoid unnecessary writes.
 */
function generateCssBody(config: ThemeConfig): string {
    let css = '';

    // Font family override
    if (config.fontFamily) {
        css += `/* Font family override */
:root {
    --font-sans: ${config.fontFamily};
}

`;
    }

    // Light mode variables
    if (config.cssVariables?.light && Object.keys(config.cssVariables.light).length > 0) {
        css += `/* Light mode overrides */
:root {
`;
        for (const [key, value] of Object.entries(config.cssVariables.light)) {
            css += `    --${key}: ${value};\n`;
        }
        css += `}

`;
    }

    // Dark mode variables
    if (config.cssVariables?.dark && Object.keys(config.cssVariables.dark).length > 0) {
        css += `/* Dark mode overrides */
.dark {
`;
        for (const [key, value] of Object.entries(config.cssVariables.dark)) {
            css += `    --${key}: ${value};\n`;
        }
        css += `}

`;
    }

    // Custom header icon
    if (config.chatAppHeaderIcon) {
        const iconConfig = config.chatAppHeaderIcon;
        if (typeof iconConfig === 'string') {
            // Single icon for both modes
            css += `/* Custom Header Icon */
:root {
    --chat-app-header-icon-url: url('${iconConfig}');
}

`;
        } else {
            // Separate icons for light/dark modes
            const lightIcon = iconConfig.light;
            const darkIcon = iconConfig.dark || iconConfig.light;
            css += `/* Custom Header Icon - Light Mode */
:root {
    --chat-app-header-icon-url: url('${lightIcon}');
}

/* Custom Header Icon - Dark Mode */
.dark {
    --chat-app-header-icon-url: url('${darkIcon}');
}

`;
        }
    }

    // Custom palettes
    if (config.customPalettes && Object.keys(config.customPalettes).length > 0) {
        css += `/* Custom Palettes */
:root {
`;
        for (const [paletteName, shades] of Object.entries(config.customPalettes)) {
            for (const [shade, value] of Object.entries(shades)) {
                css += `    --${paletteName}-${shade}: ${value};\n`;
            }
        }
        css += `}
`;
    }

    return css;
}

/**
 * Write the theme CSS file only if the body content has actually changed.
 * The timestamp in the file header is only updated when real content changes,
 * preventing noisy git diffs from every build.
 *
 * @returns true if the file was written, false if skipped (unchanged)
 */
function writeThemeCssIfChanged(body: string, themeName: string, projectRoot: string): boolean {
    const stylesDir = path.join(projectRoot, chatWebAppStylesDirName);

    // Ensure styles directory exists
    if (!existsSync(stylesDir)) {
        mkdirSync(stylesDir, { recursive: true });
    }

    const outputPath = path.join(stylesDir, generatedThemeCssFileName);

    // Compare against existing file body to avoid unnecessary writes
    if (existsSync(outputPath)) {
        const existing = readFileSync(outputPath, 'utf8');
        const markerIndex = existing.indexOf(HEADER_END_MARKER);
        const existingBody = markerIndex >= 0
            ? existing.slice(markerIndex + HEADER_END_MARKER.length)
            : existing;

        if (existingBody === body) {
            console.log('[theme-vite-plugin] Theme CSS unchanged, skipping write');
            return false;
        }
    }

    const fullCss = buildFileHeader(themeName) + body;
    writeFileSync(outputPath, fullCss, 'utf8');
    return true;
}
