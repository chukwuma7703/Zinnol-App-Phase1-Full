/**
 * Production Monitoring & Error Tracking Configuration
 * Integrates Sentry, APM, and custom monitoring
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import winston from 'winston';
import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Avoid import.meta for Jest compatibility; use process.cwd() as project root
const projectRoot = process.cwd();

/**
 * Initialize Sentry for Error Tracking
 */
export const initSentry = (app) => {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      integrations: [
        // Enable HTTP calls tracing
        new Sentry.Integrations.Http({ tracing: true }),
        // Enable Express.js middleware tracing
        new Sentry.Integrations.Express({ app }),
        // Enable profiling
        nodeProfilingIntegration(),
        // MongoDB integration
        new Sentry.Integrations.Mongo({
          useMongoose: true,
        }),
      ],
      // Performance Monitoring
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      profilesSampleRate: 1.0,
      environment: process.env.NODE_ENV,
      beforeSend(event, hint) {
        // Filter out sensitive data
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers?.authorization;
          delete event.request.data?.password;
          delete event.request.data?.token;
        }
        return event;
      },
    });

    // RequestHandler creates a separate execution context
    app.use(Sentry.Handlers.requestHandler());

    // TracingHandler creates a trace for every incoming request
    app.use(Sentry.Handlers.tracingHandler());

    console.log('✅ Sentry error tracking initialized');
  } else {
    console.log('⚠️ Sentry DSN not configured - error tracking disabled');
  }
};

/**
 * Initialize Sentry Error Handler (must be after all other middleware)
 */
export const initSentryErrorHandler = (app) => {
  if (process.env.SENTRY_DSN) {
    app.use(Sentry.Handlers.errorHandler());
  }
};

/**
 * Create Winston Logger for Application Logging
 */
export const createAppLogger = () => {
  // Logs directory relative to project root
  const logDir = path.join(projectRoot, 'logs');

  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Define log format
  const logFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  );

  // Create transports
  const logTransports = [
    // Console transport
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      ),
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    }),

    // Daily rotate file for all logs
    new DailyRotateFile({
      filename: path.join(logDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'info',
    }),

    // Separate file for errors
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
    }),
  ];

  // Add Sentry transport if configured
  if (process.env.SENTRY_DSN) {
    logTransports.push(
      new transports.Stream({
        stream: {
          write: (message) => {
            const log = JSON.parse(message);
            if (log.level === 'error') {
              Sentry.captureException(new Error(log.message), {
                extra: log,
              });
            }
          },
        },
      })
    );
  }

  return createLogger({
    format: logFormat,
    transports: logTransports,
    exitOnError: false,
  });
};

/**
 * Lightweight business event tracker.
 * In production, this could forward to analytics; in tests it no-ops.
 */
export const trackBusinessEvent = (eventName, properties = {}) => {
  try {
    if (process.env.NODE_ENV === 'test') return; // avoid noisy output in tests
    // Record as a Sentry breadcrumb (non-fatal) if DSN is configured
    if (process.env.SENTRY_DSN) {
      Sentry.addBreadcrumb({
        category: 'business',
        message: eventName,
        level: 'info',
        data: properties,
      });
    } else if (process.env.DEBUG_BUSINESS_EVENTS === '1') {
      console.log(`[business-event] ${eventName}`, properties);
    }
  } catch (_) {
    // Swallow any analytics errors to avoid breaking app/tests
  }
};

/**
 * System Health Monitoring
 */
export class SystemMonitor {
  constructor() {
    this.metrics = {
      requests: 0,
      errors: 0,
      responseTime: [],
      memory: [],
      cpu: [],
    };

    // Start collecting metrics
    this.startMetricsCollection();
  }

  startMetricsCollection() {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      this.metrics.memory.push({
        timestamp: Date.now(),
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
      });

      this.metrics.cpu.push({
        timestamp: Date.now(),
        user: cpuUsage.user,
        system: cpuUsage.system,
      });

      // Keep only last hour of metrics
      const oneHourAgo = Date.now() - 3600000;
      this.metrics.memory = this.metrics.memory.filter(m => m.timestamp > oneHourAgo);
      this.metrics.cpu = this.metrics.cpu.filter(m => m.timestamp > oneHourAgo);
      this.metrics.responseTime = this.metrics.responseTime.filter(m => m.timestamp > oneHourAgo);
    }, 30000);
  }

  recordRequest(duration) {
    this.metrics.requests++;
    this.metrics.responseTime.push({
      timestamp: Date.now(),
      duration,
    });
  }

  recordError() {
    this.metrics.errors++;
  }

  getHealthStatus() {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    // Calculate averages
    const avgResponseTime = this.metrics.responseTime.length > 0
      ? this.metrics.responseTime.reduce((sum, m) => sum + m.duration, 0) / this.metrics.responseTime.length
      : 0;

    const memoryUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    return {
      status: memoryUsagePercent < 90 ? 'healthy' : 'degraded',
      uptime: Math.floor(uptime),
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        total: Math.round(memUsage.heapTotal / 1024 / 1024),
        percentage: memoryUsagePercent.toFixed(2),
      },
      requests: {
        total: this.metrics.requests,
        errors: this.metrics.errors,
        errorRate: this.metrics.requests > 0
          ? ((this.metrics.errors / this.metrics.requests) * 100).toFixed(2)
          : 0,
      },
      performance: {
        avgResponseTime: avgResponseTime.toFixed(2),
        requestsPerMinute: this.getRequestsPerMinute(),
      },
      system: {
        platform: os.platform(),
        cpus: os.cpus().length,
        totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024),
        freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024),
        loadAverage: os.loadavg(),
      },
    };
  }

  getRequestsPerMinute() {
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = this.metrics.responseTime.filter(m => m.timestamp > oneMinuteAgo);
    return recentRequests.length;
  }
}

/**
 * Performance Monitoring Middleware
 */
export const performanceMiddleware = (monitor) => {
  return (req, res, next) => {
    const startTime = Date.now();

    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = function (...args) {
      const duration = Date.now() - startTime;
      monitor.recordRequest(duration);

      // Log slow requests
      if (duration > 1000) {
        console.warn(`Slow request: ${req.method} ${req.path} took ${duration}ms`);
        Sentry.captureMessage(`Slow request: ${req.method} ${req.path}`, 'warning', {
          extra: {
            duration,
            method: req.method,
            path: req.path,
            query: req.query,
          },
        });
      }

      originalEnd.apply(res, args);
    };

    next();
  };
};

/**
 * Create Health Check Endpoint
 */
export const createHealthEndpoint = (app, monitor) => {
  app.get('/health', (req, res) => {
    const health = monitor.getHealthStatus();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  app.get('/health/live', (req, res) => {
    res.status(200).json({ status: 'alive' });
  });

  app.get('/health/ready', async (req, res) => {
    try {
      // Check database connection
      const mongoose = await import('mongoose');
      const dbReady = mongoose.connection.readyState === 1;

      // Check Redis connection
      const { isRedisReady } = await import('./cache.js');
      const redisReady = isRedisReady();

      if (dbReady && redisReady) {
        res.status(200).json({
          status: 'ready',
          services: {
            database: 'connected',
            cache: 'connected',
          },
        });
      } else {
        res.status(503).json({
          status: 'not ready',
          services: {
            database: dbReady ? 'connected' : 'disconnected',
            cache: redisReady ? 'connected' : 'disconnected',
          },
        });
      }
    } catch (error) {
      res.status(503).json({
        status: 'error',
        message: error.message,
      });
    }
  });
};

/**
 * Basic metrics middleware and endpoint (lightweight, no Prometheus lib).
 */
let requestCount = 0;
let errorCount = 0;
export const metricsMiddleware = (req, res, next) => {
  requestCount++;
  // Count 5xx responses
  const originalEnd = res.end;
  res.end = function (...args) {
    try {
      const statusCode = res.statusCode || 200;
      if (statusCode >= 500) errorCount++;
    } catch (_) { }
    originalEnd.apply(res, args);
  };
  next();
};

export const metricsEndpoint = (_req, res) => {
  res.type('application/json').send({
    requests: requestCount,
    errors: errorCount,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
};

/**
 * Detailed health check used by readiness probes.
 */
export const detailedHealthCheck = async () => {
  try {
    const mongoose = await import('mongoose');
    const dbReady = mongoose.connection.readyState === 1;
    const { isRedisReady } = await import('./cache.js');
    const cacheReady = isRedisReady();

    return {
      database: { status: dbReady ? 'connected' : 'disconnected' },
      cache: { status: cacheReady ? 'connected' : 'disconnected' },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      database: { status: 'unknown' },
      cache: { status: 'unknown' },
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Graceful Shutdown Handler
 */
export const setupGracefulShutdown = (server) => {
  let isShuttingDown = false;

  const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n${signal} received. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(async () => {
      console.log('HTTP server closed');

      try {
        // Close database connections
        const mongoose = await import('mongoose');
        await mongoose.connection.close();
        console.log('Database connection closed');

        // Close Redis connection
        const { getRedisClient } = await import('./cache.js');
        const redis = getRedisClient();
        if (redis) {
          await redis.quit();
          console.log('Redis connection closed');
        }

        // Flush Sentry
        if (process.env.SENTRY_DSN) {
          await Sentry.close(2000);
          console.log('Sentry flushed');
        }

        console.log('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  // Listen for termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    Sentry.captureException(error);
    shutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    Sentry.captureException(new Error(`Unhandled Rejection: ${reason}`));
  });
};

// Export logger instance
export const logger = createAppLogger();

// Export monitor instance (avoid starting intervals in tests)
export const systemMonitor = process.env.NODE_ENV === 'test'
  ? { getHealthStatus: () => ({ status: 'healthy' }) }
  : new SystemMonitor();

export default {
  initSentry,
  initSentryErrorHandler,
  createAppLogger,
  SystemMonitor,
  performanceMiddleware,
  createHealthEndpoint,
  setupGracefulShutdown,
  logger,
  systemMonitor,
  trackBusinessEvent,
};