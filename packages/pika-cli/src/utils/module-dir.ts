import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Directory containing this module, for resolving files shipped alongside the source.
 *
 * `import.meta` is isolated in this one tiny module on purpose: it cannot be parsed by the
 * CommonJS transform the test runner uses, so any module that references it directly becomes
 * impossible to unit test. Importing this value keeps that constraint in one place.
 */
export const moduleDir = path.dirname(fileURLToPath(import.meta.url));
