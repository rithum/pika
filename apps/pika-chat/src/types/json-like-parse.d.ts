declare module 'json-like-parse' {
    /**
     * Parses JSON-like text from a string and returns an array of parsed objects.
     * @param text - The text containing JSON-like objects
     * @returns An array of parsed JSON objects
     */
    function findAndParseJsonLikeText(text: string): any[];

    export = findAndParseJsonLikeText;
}
