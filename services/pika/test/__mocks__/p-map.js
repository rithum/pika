// Mock implementation of p-map (ESM-only package) for Jest tests.
// Processes each item sequentially with no concurrency — matches pMap(items, fn, { concurrency }).
async function pMap(iterable, mapper, _options) {
    const results = [];
    for (const item of iterable) {
        results.push(await mapper(item));
    }
    return results;
}

module.exports = pMap;
module.exports.default = pMap;
