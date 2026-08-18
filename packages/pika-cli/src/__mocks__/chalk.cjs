/* CommonJS mock for ESM-only chalk so Jest can load it without transforming node_modules. */
const identity = (s) => s;
function color() {
    const fn = (s) => s;
    fn.bold = (s) => s;
    return fn;
}
const chalk = {
    blue: color(),
    green: color(),
    yellow: color(),
    red: color(),
    gray: color(),
    cyan: color(),
    reset: color(),
    bold: {
        blue: identity,
        green: identity,
        yellow: identity,
        red: identity,
        gray: identity,
        cyan: identity
    }
};
module.exports = {
    __esModule: true,
    default: chalk
};
