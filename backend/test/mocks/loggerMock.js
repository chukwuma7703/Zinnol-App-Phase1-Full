// Minimal logger mock to bypass import.meta usage in real logger
const noop = () => { };

export const error = noop;
export const warn = noop;
export const info = noop;
export const http = noop;
export const verbose = noop;
export const debug = noop;
export const silly = noop;
export const logRequest = noop;
export const logError = noop;
export const logDatabaseOperation = noop;
export const logAuthentication = noop;
export const logBusinessEvent = noop;

const logger = {
    error, warn, info, http, verbose, debug, silly,
    logRequest, logError, logDatabaseOperation, logAuthentication, logBusinessEvent,
    stream: { write: noop }
};

export default logger;
