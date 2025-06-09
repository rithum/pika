export default {
    plugins: {
        'tailwindcss/nesting': {},
        tailwindcss: {},
        autoprefixer: {},
        ...(process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod' || process.env.STAGE === 'prod'
            ? { cssnano: { preset: 'default' } }
            : {}),
    },
};
