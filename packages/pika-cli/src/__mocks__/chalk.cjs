/* CommonJS mock for ESM-only chalk so Jest can load it without transforming node_modules. */
const fn = (s) => s;
module.exports = {
    __esModule: true,
    default: {
        blue: fn,
        green: fn,
        yellow: fn,
        red: fn,
        gray: fn,
        bold: { cyan: fn }
    }
};
