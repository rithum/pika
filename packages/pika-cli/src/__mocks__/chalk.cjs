/* CommonJS mock for ESM-only chalk so Jest can load it without transforming node_modules. */
const fn = (s) => s;
const chalk = {
    blue: fn,
    green: fn,
    yellow: fn,
    red: fn,
    gray: fn,
    cyan: fn,
    bold: { cyan: fn, red: fn, green: fn, yellow: fn, blue: fn, gray: fn },
    red: Object.assign(fn, { bold: fn }),
    cyan: Object.assign(fn, { bold: fn }),
    green: Object.assign(fn, { bold: fn }),
    yellow: Object.assign(fn, { bold: fn }),
};
module.exports = {
    __esModule: true,
    default: chalk
};
