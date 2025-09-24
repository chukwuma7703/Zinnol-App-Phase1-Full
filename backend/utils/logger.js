import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Avoid import.meta for Jest compatibility; derive project root from process.cwd()
const projectRoot = process.cwd();

// Create logs directory if it doesn't exist (skip in test to avoid FS handles lingering)
const logsDir = path.join(projectRoot, 'logs');
if (process.env.NODE_ENV !== 'test') {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'blue',
  silly: 'gray',
};

// Tell winston about our colors
winston.addColors(colors);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  }),
);

// Define transports
const transports = [];

// Console transport (always enabled)
if (process.env.NODE_ENV !== 'test') {
  transports.push(
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat,
      level: process.env.LOG_LEVEL || 'debug',
    })
  );
} else {
  // In test environment, add a silent transport to prevent "no transports" errors
  transports.push(
    new winston.transports.Console({
      silent: true, // Completely silent in tests
    })
  );
}

// File transports for production
if (process.env.NODE_ENV === 'production') {
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  // HTTP request log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'http.log'),
      level: 'http',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: logFormat,
  transports,
  exitOnError: false,
});

// Graceful close helper for tests / shutdown to end transports
logger.closeAll = async () => {
  for (const t of logger.transports) {
    if (typeof t.close === 'function') {
      try { t.close(); } catch { }
    }
  }
};

// Create a stream object for Morgan HTTP logger
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// Helper functions for structured logging
logger.logRequest = (req, res, responseTime) => {
  const log = {
    method: req.method,
    url: req.originalUrl,
    status: res.statusCode,
    responseTime: `${responseTime}ms`,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };

  if (req.user) {
    log.userId = req.user._id;
    log.userEmail = req.user.email;
  }

  logger.http('HTTP Request', log);
};

logger.logError = (error, req = null) => {
  const errorLog = {
    message: error.message,
    stack: error.stack,
    code: error.code || error.statusCode,
  };

  if (req) {
    errorLog.method = req.method;
    errorLog.url = req.originalUrl;
    errorLog.ip = req.ip;
    if (req.user) {
      errorLog.userId = req.user._id;
    }
  }

  logger.error('Application Error', errorLog);
};

logger.logDatabaseOperation = (operation, collection, duration, success = true) => {
  const log = {
    operation,
    collection,
    duration: `${duration}ms`,
    success,
  };

  if (success) {
    logger.debug('Database Operation', log);
  } else {
    logger.warn('Database Operation Failed', log);
  }
};

logger.logAuthentication = (action, email, success = true, reason = null) => {
  const log = {
    action,
    email,
    success,
    timestamp: new Date().toISOString(),
  };

  if (reason) {
    log.reason = reason;
  }

  if (success) {
    logger.info('Authentication', log);
  } else {
    logger.warn('Authentication Failed', log);
  }
};

logger.logBusinessEvent = (event, data = {}) => {
  logger.info(`Business Event: ${event}`, data);
};

// Export logger instance
export default logger;

// Export specific log functions
export const {
  error,
  warn,
  info,
  http,
  verbose,
  debug,
  silly,
} = logger;

// Export helper functions
export const logRequest = logger.logRequest;
export const logError = logger.logError;
export const logDatabaseOperation = logger.logDatabaseOperation;
export const logAuthentication = logger.logAuthentication;
export const logBusinessEvent = logger.logBusinessEvent;