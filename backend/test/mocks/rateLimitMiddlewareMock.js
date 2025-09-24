// Test-only mock for strict auth rate limiter used in sensitive endpoints
export const authLimiter = (_req, _res, next) => next();
export default { authLimiter };
