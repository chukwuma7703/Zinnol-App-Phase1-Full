import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

/**
 * Middleware to add request ID and track request timing
 */
export const requestTracking = (req, res, next) => {
  // Generate unique request ID
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  
  // Track request start time
  req.startTime = Date.now();
  
  // Log request
  logger.info(`Incoming request`, {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  
  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(data) {
    const responseTime = Date.now() - req.startTime;
    
    logger.info(`Request completed`, {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
    });
    
    // Add response time header
    res.setHeader('X-Response-Time', `${responseTime}ms`);
    
    return originalJson.call(this, data);
  };
  
  next();
};

/**
 * Middleware to log slow requests
 */
export const slowRequestLogger = (threshold = 1000) => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      if (duration > threshold) {
        logger.warn(`Slow request detected`, {
          requestId: req.id,
          method: req.method,
          url: req.originalUrl,
          duration: `${duration}ms`,
          threshold: `${threshold}ms`,
        });
      }
    });
    
    next();
  };
};

/**
 * Middleware to track API usage per user
 */
export const apiUsageTracker = async (req, res, next) => {
  if (!req.user) {
    return next();
  }
  
  try {
    // Track API usage in Redis (if available)
    const { getCache, setCache } = await import('../config/cache.js');
    const key = `api_usage:${req.user._id}:${new Date().toISOString().split('T')[0]}`;
    const currentCount = await getCache(key) || 0;
    await setCache(key, currentCount + 1, 86400); // Expire after 24 hours
    
    // Add usage count to response headers
    res.setHeader('X-API-Usage-Today', currentCount + 1);
  } catch (error) {
    // Don't block request if tracking fails
    logger.error('API usage tracking failed', { error: error.message });
  }
  
  next();
};

export default requestTracking;