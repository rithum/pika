import { GeneralError, MalformedScrollIdException, OsError, type OsQuery } from './types';
import { errors } from '@opensearch-project/opensearch';

/**
 * Use this to normalize all AWS open search exceptions into one project-specfic exception.
 *
 * @param ex
 * @param op
 * @returns
 */
export function handleOsError(ex: unknown, op: string): OsError | GeneralError {
    let result: OsError | GeneralError;

    if (ex instanceof Error) {
        if (ex instanceof GeneralError) {
            result = ex;
        } else if (ex instanceof errors.OpenSearchClientError) {
            if (ex instanceof errors.ResponseError) {
                let reason = `Issue with specific OS request when doing ${op}.`;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                if ('error' in ex.meta.body && 'type' in ex.meta.body.error && 'reason' in ex.meta.body.error) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    reason = `OS error ${ex.meta.body.error.type} for reason ${ex.meta.body.error.reason} with message ${ex.message}.`;
                }

                result = makeEx(reason, ex);
            } else {
                result = makeEx(`OS error doing ${op} ${ex.name} with message ${ex.message}.`, ex);
            }
        } else {
            result = makeEx(`Error ${ex.name}  when doing ${op} with message ${ex.message}.`, ex);
        }
    } else {
        const str: string = typeof ex === 'string' ? ex : typeof ex === 'object' ? JSON.stringify(ex) : '';
        result = makeEx(`Unknown error when doing ${op}: ${str}.`, str);
    }

    return result;
}

/**
 * Helper function.
 *
 * @param message
 * @param ex
 * @returns
 */
function makeEx(message: string, ex: errors.OpenSearchClientError | Error | string): OsError {
    const statusCode: number | undefined = ex instanceof errors.ResponseError ? ex.statusCode : undefined;
    const httpStatusCode = statusCode !== undefined ? `\n\nhttpStatusCode: ${statusCode}` : '';
    const stack = ex instanceof Error ? `\n\nhttpStatusCode: ${ex.stack ?? 'not provided'}` : 'not provided';
    const fullObj = `\n\nfullObj: ${typeof ex === 'object' ? JSON.stringify(ex, null, 2) : ''}`;
    return new OsError(`${message}${httpStatusCode}${stack}${fullObj}`, statusCode === 404);
}

/**
 * Take the pagination_key and the original search terms and stringify/base64 to a "scrollId".
 *
 * @param lastHitSort
 * @param query
 */
export function buildScrollIdFromQueryAndLastHitSort(lastHitSort: unknown[], query: OsQuery): string {
    query.search_after = lastHitSort;
    return Buffer.from(JSON.stringify(query)).toString('base64');
}

/**
 * Get the sort values from the last hit of the last query and the original search query from the
 * last search so we can get the next page of results.
 *
 * @param scrollId This is a base64 encoded string that contains the last hit sort and the original query.
 */
export function getNextPageQueryFromScrollId(scrollId: string): OsQuery {
    let str: string | undefined;
    try {
        str = Buffer.from(scrollId, 'base64').toString('utf-8');
        return JSON.parse(str) as OsQuery;
    } catch (ex) {
        console.warn(`Unable to parse scrollId: ${scrollId}`);
        throw new MalformedScrollIdException('Unable to parse scrollId');
    }
}

/**
 * Take a search term and prepare it for use in an open search simple_query_string query by adding an asterisk to the
 * end of each chunk where a chunk is a group of words inside punctuation (quotes or parens) or a single word.
 */
export function prepareSearchTerm(term: string): string {
    const specialSyntax = ['+', '-', '|', '(', ')', '*'];
    const chunks = term.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g) ?? [];

    return chunks
        .map((chunk) => {
            chunk = chunk.replace(/['"]+/g, ''); // remove quotes
            if (!specialSyntax.some((char) => chunk.includes(char)) && !chunk.endsWith('*')) {
                return `${chunk}*`;
            }
            return chunk;
        })
        .join(' ');
}
