/**
 * Theme Vite Plugin
 *
 * Generates CSS from the theme config at build time with HMR support.
 * When pika-config.ts or the theme config changes, regenerates the theme CSS
 * and triggers a full page reload.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
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
        await writeThemeCss('/* Failed to load pika-config.ts */\n', projectRoot);
        return;
    }

    const customTheme = pikaConfig.siteFeatures?.uiCustomization?.customTheme;

    // If custom theme is disabled, generate empty CSS
    if (!customTheme?.enabled) {
        console.log('[theme-vite-plugin] Custom theme disabled, using default theme');
        await writeThemeCss('/* Custom theme disabled - using default Pika theme */\n', projectRoot);
        return;
    }

    // Load theme config
    const themeConfigPath = getThemeConfigAbsolutePath(projectRoot, customTheme.themeConfigPath);
    if (!themeConfigPath) {
        console.warn('[theme-vite-plugin] No themeConfigPath specified in customTheme config');
        await writeThemeCss('/* No themeConfigPath specified in pika-config.ts */\n', projectRoot);
        return;
    }
    if (!existsSync(themeConfigPath)) {
        console.warn('[theme-vite-plugin] Theme config file not found:', themeConfigPath);
        console.warn('[theme-vite-plugin] Create this file to customize your theme.');
        await writeThemeCss(`/* Theme config not found at: ${themeConfigPath} */\n`, projectRoot);
        return;
    }

    const themeConfig = await loadThemeConfig(themeConfigPath);
    if (!themeConfig) {
        await writeThemeCss('/* Failed to load or no themeConfig exported from theme config file */\n', projectRoot);
        return;
    }

    // Generate CSS from theme config
    const css = generateCssFromThemeConfig(themeConfig);
    await writeThemeCss(css, projectRoot);

    console.log(`[theme-vite-plugin] Generated theme CSS: ${themeConfig.name || 'Custom Theme'}`);
}

function generateCssFromThemeConfig(config: ThemeConfig): string {
    const timestamp = new Date().toISOString();
    let css = `/**
 * Generated Theme CSS
 * Theme: ${config.name || 'Custom Theme'}
 * Generated at: ${timestamp}
 * DO NOT EDIT - This file is auto-generated by theme-vite-plugin
 */

`;

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

async function writeThemeCss(css: string, projectRoot: string): Promise<void> {
    const stylesDir = path.join(projectRoot, chatWebAppStylesDirName);

    // Ensure styles directory exists
    if (!existsSync(stylesDir)) {
        mkdirSync(stylesDir, { recursive: true });
    }

    const outputPath = path.join(stylesDir, generatedThemeCssFileName);
    writeFileSync(outputPath, css, 'utf8');
}
