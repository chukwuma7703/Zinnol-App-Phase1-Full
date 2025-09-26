import dotenv from "dotenv";
dotenv.config();

import http from "http";
import mongoose from "mongoose";
import connectDB from "./config/db.js";
import { initSocket } from "./config/socket.js";
import { initRedis } from "./config/cache.js";
import logger from './utils/logger.js';
import app from './app.js';
import { detailedHealthCheck } from './config/monitoring.js';
import { checkSchoolUsageAndNotify } from "./jobs/schoolUsageNotifier.js";

// Validate critical environment variables (skip in test)
if (process.env.NODE_ENV !== 'test') {
  const requiredEnvVars = ['JWT_SECRET', 'MONGO_URI'];
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please set these in your .env file or environment');
    process.exit(1);
  }

  const recommendedEnvVars = ['REDIS_URL', 'FRONTEND_URL', 'SENTRY_DSN'];
  const missingRecommended = recommendedEnvVars.filter(varName => !process.env[varName]);
  if (missingRecommended.length > 0 && process.env.NODE_ENV === 'production') {
    console.warn('⚠️  Missing recommended environment variables in production:', missingRecommended.join(', '));
  }
}

// Non-test initializations only
if (process.env.NODE_ENV !== 'test') {
  // Attempt to connect to the database, but don't crash the entire process on failure in development.
  // This prevents unhandled rejections from bringing down the server while iterating locally.
  connectDB().catch((err) => {
    logger.error('Database connection failed during startup:', err?.message || err);
    if (process.env.NODE_ENV === 'production') {
      logger.error('Exiting due to DB failure in production');
      process.exit(1);
    } else {
      logger.warn('Continuing startup without DB connection (development). Some features may be unavailable.');
    }
  });
  initRedis();

  // Initialize Google Drive service lazily
  if (process.env.GOOGLE_DRIVE_ENABLED === 'true') {
    import('./services/googleDriveService.js').then(({ googleDriveService }) => {
      googleDriveService.initialize().catch(error => {
        logger.error('Failed to initialize Google Drive service:', error.message);
      });
    });
  }

  // Migrations
  import('./migrations/migrationRunner.js').then(({ default: MigrationRunner }) => {
    const migrationRunner = new MigrationRunner();
    migrationRunner.up().catch(error => {
      logger.error('Migration failed', error);
    });
  });

  // Background services
  import('./utils/notificationScheduler.js').then(({ startNotificationScheduler }) => startNotificationScheduler());
  import('./services/weatherUpdater.js').then(({ scheduleWeatherUpdates }) => scheduleWeatherUpdates());

  // Firebase Admin (side-effect import)
  if (process.env.FIREBASE_ENABLED === 'true') {
    import('./config/firebaseAdmin.js');
  }
}

const server = http.createServer(app);

// Initialize Socket.IO outside tests
if (process.env.NODE_ENV !== 'test') {
  initSocket(server);
}

const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0';

if (process.env.NODE_ENV !== 'test') {
  const runningServer = server.listen(PORT, HOST, () => {
    logger.info(`✅ Server running on http://${HOST}:${PORT}`);
    logger.info(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`✅ API Documentation: http://${HOST}:${PORT}/api-docs`);
    logger.info(`✅ Metrics: http://${HOST}:${PORT}/metrics`);
  });

  // Schedule background jobs
  import('node-cron').then(cron => {
    cron.default.schedule('0 2 * * *', async () => {
      await checkSchoolUsageAndNotify();
    });
    logger.info("✅ School usage notification job scheduled (daily at 2am)");

    if (process.env.BACKUP_ENABLED === 'true') {
      cron.default.schedule('0 3 * * 0', async () => {
        logger.info('Running weekly database backup...');
      });
      logger.info("✅ Database backup job scheduled (weekly on Sunday at 3am)");
    }

    cron.default.schedule('0 * * * *', async () => {
      const health = await detailedHealthCheck();
      logger.info('Hourly health check', health);
    });
  });

  const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Start a watchdog timer to force-exit if shutdown hangs
    const shutdownTimer = setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 30000);

    try {
      // Stop accepting new connections
      runningServer.close((err) => {
        if (err) logger.warn('Error while closing HTTP server:', err?.message || err);
      });

      // Await the 'close' event to ensure the server has fully stopped
      await new Promise((resolve, reject) => {
        runningServer.once('close', resolve);
        runningServer.once('error', reject);
      });

      logger.info("HTTP server closed");

      // Close DB connection
      await mongoose.connection.close();
      logger.info("MongoDB connection closed");

      // Close Redis if available
      const { getRedisClient } = await import('./config/cache.js');
      const redisClient = getRedisClient();
      if (redisClient) {
        await redisClient.quit();
        logger.info("Redis connection closed");
      }

      clearTimeout(shutdownTimer);
      process.exit(0);
    } catch (error) {
      logger.error("Error during shutdown", error);
      clearTimeout(shutdownTimer);
      process.exit(1);
    }
  };

  ['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach((signal) => {
    process.on(signal, () => gracefulShutdown(signal));
  });

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