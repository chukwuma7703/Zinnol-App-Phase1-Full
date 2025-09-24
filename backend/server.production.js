import dotenv from "dotenv";
dotenv.config({ path: './zinnol.env' });

// Validate critical environment variables
if (process.env.NODE_ENV !== 'test') {
  const requiredEnvVars = ['JWT_SECRET', 'MONGO_URI'];
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please set these in your .env file or environment');
    process.exit(1);
  }

  // Warn about optional but recommended env vars
  const recommendedEnvVars = ['REDIS_URL', 'FRONTEND_URL', 'SENTRY_DSN'];
  const missingRecommended = recommendedEnvVars.filter(varName => !process.env[varName]);

  if (missingRecommended.length > 0 && process.env.NODE_ENV === 'production') {
    console.warn('⚠️  Missing recommended environment variables in production:', missingRecommended.join(', '));
  }
}

import express from "express";
import cookieParser from 'cookie-parser';
import compression from 'compression';
import morgan from 'morgan';
import path from "path";
import { fileURLToPath } from 'url';
import connectDB from "./config/db.js";
import cors from "cors";
import mongoose from "mongoose";
import http from "http";

// Security imports
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import xss from 'xss';

// Routes
import userRoutes from "./routes/userRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import schoolRoutes from "./routes/schoolRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import classRoutes from "./routes/classRoutes.js";
import resultRoutes from "./routes/resultRoutes.js";
import subjectRoutes from "./routes/subjectRoutes.js";
import calendarRoutes from "./routes/calendarRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import examRoutes from "./routes/examRoutes.js";
import teacherActivityRoutes from "./routes/teacherActivityRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import timetableRoutes from "./routes/timetableRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import schoolFeatureRoutes from "./routes/schoolFeatureRoutes.js";
import voiceResultRoutes from "./routes/voiceResultRoutes.js";
import webauthnRouter from './routes/webauthn.js';
import googleDriveRoutes from './routes/googleDriveRoutes.js';
import buserTransactionRoutes from './routes/buserTransactionRoutes.js';

// Firebase Admin (must be imported to initialize)
import "./config/firebaseAdmin.js";

// Middleware
import { protect, authorizeRoles, roles } from "./middleware/authMiddleware.js";
import errorHandler from "./middleware/errorMiddleware.js";
import { requestTracking, slowRequestLogger, apiUsageTracker } from './middleware/requestTracking.js';
import { createRateLimiters } from './config/security.js';

// Utils
import logger from './utils/logger.js';
import { startNotificationScheduler } from "./utils/notificationScheduler.js";
import { initSocket } from "./config/socket.js";
import { initRedis, isRedisReady } from "./config/cache.js";
import { scheduleWeatherUpdates } from "./services/weatherUpdater.js";
import { checkSchoolUsageAndNotify } from "./jobs/schoolUsageNotifier.js";

// Monitoring & Documentation
import { metricsMiddleware, metricsEndpoint, detailedHealthCheck } from './config/monitoring.js';
import setupSwagger from './config/swagger.js';

// Migrations
import MigrationRunner from './migrations/migrationRunner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express
const app = express();

// Trust proxy (for production behind reverse proxy)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// --- Initializations for non-test environments ---
if (process.env.NODE_ENV !== "test") {
  // Connect to MongoDB
  connectDB();
  
  // Connect to Redis
  initRedis();
  
  // Run migrations
  const migrationRunner = new MigrationRunner();
  migrationRunner.up().catch(error => {
    logger.error('Migration failed', error);
  });
  
  // Start background services
  startNotificationScheduler();
  scheduleWeatherUpdates();

  // Initialize Google Drive service
  import('./services/googleDriveService.js').then(({ googleDriveService }) => {
    googleDriveService.initialize().catch(error => {
      logger.error('Failed to initialize Google Drive service:', error.message);
    });
  });
}

// --- Core Middleware (must come first) ---

// Compression
app.use(compression());

// Request tracking and logging
app.use(requestTracking);
app.use(slowRequestLogger(1000)); // Log requests slower than 1 second

// Morgan HTTP logger
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: logger.stream }));
}

// Metrics collection
app.use(metricsMiddleware);

// Security headers with Helmet
const helmetConfig = process.env.NODE_ENV === 'production' 
  ? {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for Swagger UI
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }
  : {
      contentSecurityPolicy: false, // Disable CSP in development
    };

app.use(helmet(helmetConfig));

// Create rate limiters
const rateLimiters = createRateLimiters();

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// MongoDB injection prevention
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    logger.warn(`Sanitized field ${key} in request from ${req.ip}`);
  },
}));

// Prevent HTTP Parameter Pollution
app.use(hpp({
  whitelist: ['sort', 'fields', 'page', 'limit'],
}));

// CORS configuration
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [process.env.FRONTEND_URL])
  : ['http://localhost:5173', 'http://localhost:5175', 'http://localhost:3000'];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'X-Request-ID', 'X-Response-Time'],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
if (process.env.NODE_ENV !== 'test') {
  initSocket(server);
}

// Static file serving (uploads folder)
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  maxAge: '1d',
  etag: true,
}));

// --- API Documentation ---
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
  setupSwagger(app);
  logger.info('API documentation available at /api-docs');
}

// --- Health and Monitoring Endpoints ---
app.get("/healthz", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  });
});

app.get("/readyz", async (req, res) => {
  const checks = await detailedHealthCheck();
  const isReady = checks.database?.status === 'connected';
  
  res.status(isReady ? 200 : 503).json({
    status: isReady ? "ready" : "not ready",
    ...checks,
  });
});

// Metrics endpoint
app.get('/metrics', metricsEndpoint);

// --- API Status ---
app.get("/", (req, res) => {
  res.json({
    message: "Zinnol API Server",
    version: "1.0.0",
    status: "operational",
    documentation: "/api-docs",
    health: "/healthz",
    readiness: "/readyz",
    metrics: "/metrics",
  });
});

app.get("/api", (req, res) => {
  res.json({ 
    message: "API is running ✅",
    timestamp: new Date().toISOString(),
  });
});

// --- API Routes ---

// Public routes (no auth required)
app.use("/api/auth", rateLimiters.auth, authRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/webauthn", webauthnRouter);

// User routes (auth handled per-route)
app.use("/api/users", userRoutes);

// Protected routes (require authentication)
app.use("/api/schools", protect, schoolRoutes);
app.use("/api/classes", protect, classRoutes);
app.use("/api/buser-transactions", protect, buserTransactionRoutes);
app.use("/api/activity", protect, teacherActivityRoutes);
app.use("/api/students", protect, studentRoutes);
app.use("/api/results", protect, resultRoutes);
app.use("/api/voice-results", protect, voiceResultRoutes);
app.use("/api/timetables", protect, timetableRoutes);
app.use("/api/subjects", protect, subjectRoutes);
app.use("/api/search", protect, searchRoutes);
app.use("/api/school-features", protect, authorizeRoles([roles.ADMIN, roles.SUPER_ADMIN]), schoolFeatureRoutes);
app.use("/api/calendar", protect, calendarRoutes);
app.use("/api/analytics", protect, authorizeRoles([roles.ADMIN, roles.SUPER_ADMIN]), analyticsRoutes);
app.use("/api/exams", protect, examRoutes);
app.use('/api/notifications', protect, notificationRoutes);
app.use('/api/drive', protect, googleDriveRoutes);

// API usage tracking for authenticated routes
app.use(apiUsageTracker);

// --- Error Handlers (must come last) ---

// 404 handler for routes that don't exist
app.use((req, res, next) => {
  res.status(404).json({ 
    success: false,
    message: `Route not found - ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
});

// Central error handler
app.use(errorHandler);

// --- Server Startup ---
const PORT = process.env.PORT || 4000;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

// Only start the server if not in a test environment
if (process.env.NODE_ENV !== "test") {
  const runningServer = server.listen(PORT, HOST, () => {
    logger.info(`✅ Server running on http://${HOST}:${PORT}`);
    logger.info(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`✅ API Documentation: http://${HOST}:${PORT}/api-docs`);
    logger.info(`✅ Metrics: http://${HOST}:${PORT}/metrics`);
  });

  // Schedule background jobs
  import('node-cron').then(cron => {
    // Daily school usage notification at 2am
    cron.default.schedule('0 2 * * *', async () => {
      await checkSchoolUsageAndNotify();
    });
    logger.info("✅ School usage notification job scheduled (daily at 2am)");

    // Weekly database backup (Sunday at 3am)
    if (process.env.BACKUP_ENABLED === 'true') {
      cron.default.schedule('0 3 * * 0', async () => {
        // Implement backup logic here
        logger.info('Running weekly database backup...');
      });
      logger.info("✅ Database backup job scheduled (weekly on Sunday at 3am)");
    }

    // Hourly metrics collection
    cron.default.schedule('0 * * * *', async () => {
      const health = await detailedHealthCheck();
      logger.info('Hourly health check', health);
    });
  });

  // --- Graceful Shutdown ---
  const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    
    // Stop accepting new connections
    runningServer.close(async () => {
      logger.info("HTTP server closed");
      
      try {
        // Close database connections
        await mongoose.connection.close();
        logger.info("MongoDB connection closed");
        
        // Close Redis connection
        const { getRedisClient } = await import('./config/cache.js');
        const redisClient = getRedisClient();
        if (redisClient) {
          await redisClient.quit();
          logger.info("Redis connection closed");
        }
        
        // Exit process
        process.exit(0);
      } catch (error) {
        logger.error("Error during shutdown", error);
        process.exit(1);
      }
    });
    
    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 30000);
  };

  // Listen for termination signals
  ['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach((signal) => {
    process.on(signal, () => gracefulShutdown(signal));
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
  });
}

export default app;
export { server };