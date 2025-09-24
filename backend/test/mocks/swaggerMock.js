// Mock for swagger-ui-express to avoid actual UI mounting and side effects
export const serve = (req, res, next) => next();
export const setup = () => (req, res, next) => next();
export default { serve, setup };
