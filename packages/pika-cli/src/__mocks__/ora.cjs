/* CommonJS mock for ora so Jest does not need to load ESM. */
module.exports = function () {
    return { start: () => ({ stop: () => {} }), succeed: () => {}, fail: () => {} };
};
