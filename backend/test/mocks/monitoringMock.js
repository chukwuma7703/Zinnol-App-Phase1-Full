// No-op monitoring mock to avoid timers and external side effects in tests
export const initSentry = () => { };
export const initSentryErrorHandler = () => { };
export const createAppLogger = () => ({
    info: () => { },
    warn: () => { },
    error: () => { },
    debug: () => { },
});

export class SystemMonitor {
    constructor() {
        // no timers
    }
    startMetricsCollection() { }
    recordRequest() { }
    recordError() { }
    getHealthStatus() {
        return { status: 'healthy' };
    }
}

export const performanceMiddleware = () => (_req, res, next) => next();
export const createHealthEndpoint = (app) => {
    if (!app || !app.get) return;
    app.get('/health', (_req, res) => res.status(200).json({ status: 'healthy' }));
    app.get('/health/live', (_req, res) => res.status(200).json({ status: 'alive' }));
    app.get('/health/ready', (_req, res) => res.status(200).json({ status: 'ready' }));
};
export const setupGracefulShutdown = () => { };
export const logger = createAppLogger();
export const systemMonitor = { getHealthStatus: () => ({ status: 'healthy' }) };
export const trackBusinessEvent = () => { };

// Add metrics utilities expected by app.js
export const metricsMiddleware = (_req, _res, next) => next();
export const metricsEndpoint = (_req, res) => res.type('application/json').send({ requests: 0, errors: 0, uptime: 0, timestamp: new Date().toISOString() });
export const detailedHealthCheck = async () => ({
    database: { status: 'connected' },
    cache: { status: 'connected' },
    timestamp: new Date().toISOString(),
});

export const __cleanupMonitoring = async () => {
    // nothing allocated here, placeholder for symmetry
};

export default {
    initSentry,
    initSentryErrorHandler,
    createAppLogger,
    SystemMonitor,
    performanceMiddleware,
    createHealthEndpoint,
    metricsMiddleware,
    metricsEndpoint,
    detailedHealthCheck,
    setupGracefulShutdown,
    logger,
    systemMonitor,
    trackBusinessEvent,
};
