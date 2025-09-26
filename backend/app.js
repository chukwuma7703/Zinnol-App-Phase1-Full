import express from "express";
import cookieParser from 'cookie-parser';
import compression from 'compression';
import morgan from 'morgan';
import path from "path";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import multer from 'multer';
import { execSync } from 'child_process';
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("./package.json");

// Routes
import userRoutes from "./routes/userRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import schoolRoutes from "./routes/schoolRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import classRoutes from "./routes/classRoutes.js";
import resultRoutes from "./routes/resultRoutes.js";
import subjectRoutes from "./routes/subjectRoutes.js";
import calendarRoutes from "./routes/calendarRoutes.js";
import assignmentRoutes from "./routes/assignmentRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import examRoutes from "./routes/examRoutes.js";
import teacherActivityRoutes from "./routes/teacherActivityRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import timetableRoutes from "./routes/timetableRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import predictiveAnalyticsRoutes from "./routes/predictiveAnalyticsRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import schoolFeatureRoutes from "./routes/schoolFeatureRoutes.js";
import voiceResultRoutes from "./routes/voiceResultRoutes.js";
import webauthnRouter from './routes/webauthn.js';
import googleDriveRoutes from './routes/googleDriveRoutes.js';
import buserTransactionRoutes from './routes/buserTransactionRoutes.js';
import schemeRoutes from './routes/schemeRoutes.js';
import gradeScaleRoutes from './routes/gradeScaleRoutes.js';
import oauthRoutes from './routes/oauthRoutes.js';
import globalAdminRoutes from './routes/globalAdminRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';

// Middleware
import { protect, authorizeRoles, roles } from "./middleware/authMiddleware.js";
import errorHandler from "./middleware/errorMiddleware.js";
import { requestTracking, slowRequestLogger, apiUsageTracker } from './middleware/requestTracking.js';
import { createRateLimiters } from './config/security.js';

// Utils & Monitoring
import logger from './utils/logger.js';
import { metricsMiddleware, metricsEndpoint, detailedHealthCheck } from './config/monitoring.js';
import setupSwagger from './config/swagger.js';

// Derive a base directory without relying on import.meta (problematic under Jest CJS transform)
// We assume tests and runtime start from project backend root. Fallback to process.cwd().
const __dirname = process.cwd();

// Initialize Express
const app = express();

// Trust proxy (for production behind reverse proxy)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Disable the X-Powered-By header to reduce fingerprinting
app.disable('x-powered-by');

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
        styleSrc: ["'self'", "'unsafe-inline'"],
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
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: true,
  }
  : {
    contentSecurityPolicy: false, // Disable CSP in development
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // Allow OAuth popups
    crossOriginEmbedderPolicy: false, // Disable COEP in development for OAuth
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
// In development, Vite serves on 127.0.0.1:5173 by default (see frontend/vite.config.js).
// Include both localhost and 127.0.0.1 variants to avoid subtle CORS mismatches.
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [process.env.FRONTEND_URL])
  : [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'http://localhost:5176',
    'http://127.0.0.1:5176',
    'http://localhost:5177',
    'http://127.0.0.1:5177',
    'http://localhost:5176',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    // Optionally include explicit FRONTEND_URL if set during dev
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ];

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
    success: true,
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
    }
  });
});

app.get("/version", (req, res) => {
  // Get git commit hash if available
  let commitHash = 'unknown';
  try {
    commitHash = execSync('git rev-parse HEAD').toString().trim();
  } catch (error) {
    // Git not available or not a repo
  }

  res.status(200).json({
    version: pkg.version,
    commit: commitHash,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

app.get("/readyz", async (req, res) => {
  try {
    const checks = await detailedHealthCheck();
    // For readiness, we consider the app ready if database is connected
    // Cache is optional for basic functionality
    const isReady = checks.database?.status === 'connected';

    return res.status(isReady ? 200 : 503).json({
      success: isReady,
      data: {
        status: isReady ? "ready" : "not ready",
        ...checks,
      }
    });
  } catch (error) {
    // Fall back to a safe error response without crashing the request lifecycle
    return res.status(503).json({
      success: false,
      data: {
        status: 'unhealthy',
        error: error?.message || 'Health check failed',
        timestamp: new Date().toISOString(),
      }
    });
  }
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
app.use("/api/auth", rateLimiters.auth, oauthRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/webauthn", webauthnRouter);

// User routes (auth handled per-route)
// Development helper: allow a cookie-less refresh to return a dev token so
// developers can iterate on the frontend without performing full auth flows.
// This route is mounted before the real userRoutes so it can short-circuit
// requests in development only.
if (process.env.NODE_ENV === 'development') {
  app.post('/api/users/refresh', (req, res) => {
    // If a real refresh or device cookie exists, fall through to the real handler
    if (req.cookies?.refreshToken || req.cookies?.deviceToken) {
      return res.status(204).end();
    }
    // Return a simple accessToken payload that the frontend will accept.
    return res.status(200).json({ accessToken: 'dev-access-token' });
  });

}

app.use("/api/users", userRoutes);

// School routes (with public endpoints)
app.use("/api/schools", schoolRoutes);
app.use("/api/classes", protect, classRoutes);
app.use("/api/buser-transactions", protect, buserTransactionRoutes);
app.use("/api/activity", protect, teacherActivityRoutes);
app.use("/api/students", protect, studentRoutes);
app.use('/api/scheme', schemeRoutes);
app.use("/api/results", protect, resultRoutes);
app.use("/api/voice-results", voiceResultRoutes);
app.use("/api/assignments", protect, assignmentRoutes);
app.use("/api/timetables", protect, timetableRoutes);
app.use("/api/subjects", protect, subjectRoutes);
app.use("/api/search", protect, searchRoutes);
app.use("/api/school-features", protect, authorizeRoles([roles.ADMIN, roles.SUPER_ADMIN]), schoolFeatureRoutes);
app.use("/api/calendar", protect, calendarRoutes);
app.use("/api/analytics", protect, authorizeRoles([roles.GLOBAL_SUPER_ADMIN, roles.ADMIN, roles.SUPER_ADMIN]), analyticsRoutes);
// Predictive analytics (separate router); internal route guards are defined per-route
app.use('/api/predict', predictiveAnalyticsRoutes);
app.use("/api/exams", protect, examRoutes);
app.use('/api/notifications', protect, notificationRoutes);
app.use('/api/drive', protect, googleDriveRoutes);
app.use('/api/grading', protect, gradeScaleRoutes);
app.use('/api/global-admin', globalAdminRoutes);
app.use('/api/settings', settingsRoutes);

// Test upload route for file validation
const upload = multer({
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"), false);
    }
    cb(null, true);
  }
});

app.post('/api/upload/image', protect, (req, res, next) => {
  const multerUpload = upload.single('file');

  multerUpload(req, res, (err) => {
    if (err) {
      // Handle multer errors
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, message: 'File too large' });
        }
      }
      // Handle custom file filter errors
      return res.status(400).json({ success: false, message: err.message });
    }

    // If no error, file uploaded successfully
    res.json({ success: true, message: 'File uploaded successfully' });
  });
});

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

export default app;
