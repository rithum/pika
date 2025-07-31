import { fontFamily } from 'tailwindcss/defaultTheme';
import type { Config } from 'tailwindcss';

const config: Config = {
    darkMode: ['class'],
    content: ['./src/**/*.{html,js,svelte,ts}'],
    safelist: ['dark'],
    theme: {
        container: {
            center: true,
            padding: '2rem',
            screens: {
                '2xl': '1400px'
            }
        },
        extend: {
            fontFamily: {
                sans: [...fontFamily.sans]
            },
            keyframes: {
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: 'var(--bits-accordion-content-height)' }
                },
                'accordion-up': {
                    from: { height: 'var(--bits-accordion-content-height)' },
                    to: { height: '0' }
                },
                'caret-blink': {
                    '0%,70%,100%': { opacity: '1' },
                    '20%,50%': { opacity: '0' }
                }
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out',
                'caret-blink': 'caret-blink 1.25s ease-out infinite'
            }
        }
    },
    plugins: []
};

export default config;
