import { fontFamily } from 'tailwindcss/defaultTheme';
import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';
import typography from '@tailwindcss/typography';

const config: Config = {
    darkMode: ['class'],
    content: ['./src/**/*.{html,js,svelte,ts}'],
    safelist: ['dark'],
    theme: {
        container: {
            center: true,
            padding: '2rem',
            screens: {
                '2xl': '1400px',
            },
        },
        extend: {
            colors: {
                gold: {
                    50: 'hsl(var(--gold-50) / <alpha-value>)',
                    100: 'hsl(var(--gold-100) / <alpha-value>)',
                    200: 'hsl(var(--gold-200) / <alpha-value>)',
                    300: 'hsl(var(--gold-300) / <alpha-value>)',
                    400: 'hsl(var(--gold-400) / <alpha-value>)',
                    500: 'hsl(var(--gold-500) / <alpha-value>)',
                    600: 'hsl(var(--gold-600) / <alpha-value>)',
                    700: 'hsl(var(--gold-700) / <alpha-value>)',
                    800: 'hsl(var(--gold-800) / <alpha-value>)',
                    900: 'hsl(var(--gold-900) / <alpha-value>)',
                },
                goldbrighter: {
                    50: 'hsl(var(--goldbrighter-50) / <alpha-value>)',
                    100: 'hsl(var(--goldbrighter-100) / <alpha-value>)',
                    200: 'hsl(var(--goldbrighter-200) / <alpha-value>)',
                    300: 'hsl(var(--goldbrighter-300) / <alpha-value>)',
                    400: 'hsl(var(--goldbrighter-400) / <alpha-value>)',
                    500: 'hsl(var(--goldbrighter-500) / <alpha-value>)',
                    600: 'hsl(var(--goldbrighter-600) / <alpha-value>)',
                    700: 'hsl(var(--goldbrighter-700) / <alpha-value>)',
                    800: 'hsl(var(--goldbrighter-800) / <alpha-value>)',
                    900: 'hsl(var(--goldbrighter-900) / <alpha-value>)',
                },
                goldhighlight: {
                    50: 'hsl(var(--goldhighlight-50) / <alpha-value>)',
                    100: 'hsl(var(--goldhighlight-100) / <alpha-value>)',
                    200: 'hsl(var(--goldhighlight-200) / <alpha-value>)',
                    300: 'hsl(var(--goldhighlight-300) / <alpha-value>)',
                    400: 'hsl(var(--goldhighlight-400) / <alpha-value>)',
                    500: 'hsl(var(--goldhighlight-500) / <alpha-value>)',
                    600: 'hsl(var(--goldhighlight-600) / <alpha-value>)',
                    700: 'hsl(var(--goldhighlight-700) / <alpha-value>)',
                    800: 'hsl(var(--goldhighlight-800) / <alpha-value>)',
                    900: 'hsl(var(--goldhighlight-900) / <alpha-value>)',
                },
                blueish: {
                    50: 'hsl(var(--blueish-50) / <alpha-value>)',
                    100: 'hsl(var(--blueish-100) / <alpha-value>)',
                    200: 'hsl(var(--blueish-200) / <alpha-value>)',
                    300: 'hsl(var(--blueish-300) / <alpha-value>)',
                    400: 'hsl(var(--blueish-400) / <alpha-value>)',
                    500: 'hsl(var(--blueish-500) / <alpha-value>)',
                    600: 'hsl(var(--blueish-600) / <alpha-value>)',
                    700: 'hsl(var(--blueish-700) / <alpha-value>)',
                    800: 'hsl(var(--blueish-800) / <alpha-value>)',
                    900: 'hsl(var(--blueish-900) / <alpha-value>)',
                },
                blueishd: {
                    50: 'hsl(var(--blueishd-50) / <alpha-value>)',
                    100: 'hsl(var(--blueishd-100) / <alpha-value>)',
                    200: 'hsl(var(--blueishd-200) / <alpha-value>)',
                    300: 'hsl(var(--blueishd-300) / <alpha-value>)',
                    400: 'hsl(var(--blueishd-400) / <alpha-value>)',
                    500: 'hsl(var(--blueishd-500) / <alpha-value>)',
                    600: 'hsl(var(--blueishd-600) / <alpha-value>)',
                    700: 'hsl(var(--blueishd-700) / <alpha-value>)',
                    800: 'hsl(var(--blueishd-800) / <alpha-value>)',
                    900: 'hsl(var(--blueishd-900) / <alpha-value>)',
                },
                bluebright: {
                    50: 'hsl(var(--bluebright-50) / <alpha-value>)',
                    100: 'hsl(var(--bluebright-100) / <alpha-value>)',
                    200: 'hsl(var(--bluebright-200) / <alpha-value>)',
                    300: 'hsl(var(--bluebright-300) / <alpha-value>)',
                    400: 'hsl(var(--bluebright-400) / <alpha-value>)',
                    500: 'hsl(var(--bluebright-500) / <alpha-value>)',
                    600: 'hsl(var(--bluebright-600) / <alpha-value>)',
                    700: 'hsl(var(--bluebright-700) / <alpha-value>)',
                    800: 'hsl(var(--bluebright-800) / <alpha-value>)',
                    900: 'hsl(var(--bluebright-900) / <alpha-value>)',
                },
                prominent: {
                    50: 'hsl(var(--prominent-50) / <alpha-value>)',
                    100: 'hsl(var(--prominent-100) / <alpha-value>)',
                    200: 'hsl(var(--prominent-200) / <alpha-value>)',
                    300: 'hsl(var(--prominent-300) / <alpha-value>)',
                    400: 'hsl(var(--prominent-400) / <alpha-value>)',
                    500: 'hsl(var(--prominent-500) / <alpha-value>)',
                    600: 'hsl(var(--prominent-600) / <alpha-value>)',
                    700: 'hsl(var(--prominent-700) / <alpha-value>)',
                    800: 'hsl(var(--prominent-800) / <alpha-value>)',
                    900: 'hsl(var(--prominent-900) / <alpha-value>)',
                },
                border: 'hsl(var(--border) / <alpha-value>)',
                input: 'hsl(var(--input) / <alpha-value>)',
                ring: 'hsl(var(--ring) / <alpha-value>)',
                background: 'hsl(var(--background) / <alpha-value>)',
                foreground: 'hsl(var(--foreground) / <alpha-value>)',
                primary: {
                    DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
                    foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
                    foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
                    foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
                    foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
                    foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
                },
                popover: {
                    DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
                    foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
                },
                card: {
                    DEFAULT: 'hsl(var(--card) / <alpha-value>)',
                    foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
                },
                sidebar: {
                    DEFAULT: 'hsl(var(--sidebar-background))',
                    foreground: 'hsl(var(--sidebar-foreground))',
                    primary: 'hsl(var(--sidebar-primary))',
                    'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
                    accent: 'hsl(var(--sidebar-accent))',
                    'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
                    border: 'hsl(var(--sidebar-border))',
                    ring: 'hsl(var(--sidebar-ring))',
                },
            },
            borderRadius: {
                xl: 'calc(var(--radius) + 4px)',
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
            fontFamily: {
                sans: [...fontFamily.sans],
            },
            keyframes: {
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: 'var(--bits-accordion-content-height)' },
                },
                'accordion-up': {
                    from: { height: 'var(--bits-accordion-content-height)' },
                    to: { height: '0' },
                },
                'caret-blink': {
                    '0%,70%,100%': { opacity: '1' },
                    '20%,50%': { opacity: '0' },
                },
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out',
                'caret-blink': 'caret-blink 1.25s ease-out infinite',
            },
        },
    },
    plugins: [tailwindcssAnimate, typography],
};

export default config;
