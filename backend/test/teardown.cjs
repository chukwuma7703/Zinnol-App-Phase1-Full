// Global Jest teardown to clean timers, sockets, cron jobs, and mocks
module.exports = async () => {
    const cleanupPromises = [];

    try {
        // Clear all timers (guard if jest/vitest globals available)
        try { (globalThis.jest || globalThis.vi) && (globalThis.jest?.useRealTimers || globalThis.vi?.useRealTimers) && (globalThis.jest?.useRealTimers || globalThis.vi?.useRealTimers)(); } catch { }

        // Clear all intervals and timeouts
        const highestTimeoutId = setTimeout(() => { }, 0);
        for (let i = 1; i <= highestTimeoutId; i++) {
            clearTimeout(i);
            clearInterval(i);
        }
        clearTimeout(highestTimeoutId);

        // Attempt to close mocked sockets if exposed
        try {
            const socket = require('./mocks/socketMock.js');
            if (socket && typeof socket.closeSocket === 'function') {
                cleanupPromises.push(socket.closeSocket());
            }
        } catch { }

        // Stop any mocked cron jobs
        try {
            const cron = require('./mocks/cronMock.js');
            if (cron && typeof cron.__cleanupCron === 'function') {
                cron.__cleanupCron();
            }
        } catch { }

        // Monitoring cleanup
        try {
            const monitoring = require('./mocks/monitoringMock.js');
            if (monitoring && typeof monitoring.__cleanupMonitoring === 'function') {
                cleanupPromises.push(monitoring.__cleanupMonitoring());
            }
        } catch { }

        // Force close mongoose connections
        try {
            const mongoose = require('mongoose');
            if (mongoose && mongoose.connection && mongoose.connection.readyState !== 0) {
                cleanupPromises.push(mongoose.connection.close(true));
            }

            // Close all mongoose connections
            if (mongoose.connections) {
                mongoose.connections.forEach(connection => {
                    if (connection.readyState !== 0) {
                        cleanupPromises.push(connection.close(true));
                    }
                });
            }
            if (mongoose.disconnect) {
                cleanupPromises.push(mongoose.disconnect());
            }
        } catch { }

        // Quit Redis clients
        try {
            const cache = require('../config/cache.js');
            if (cache && typeof cache.getRedisClient === 'function') {
                const client = cache.getRedisClient();
                if (client && typeof client.quit === 'function') {
                    cleanupPromises.push(client.quit());
                }
            }
        } catch { }

        // Stop MongoMemoryServer instances
        try {
            if (global.__MONGO_SERVER) {
                cleanupPromises.push(global.__MONGO_SERVER.stop({ doCleanup: true, force: true }));
                global.__MONGO_SERVER = null;
            }

            // Clean up any other mongo servers
            if (global.__MONGO_SERVERS) {
                global.__MONGO_SERVERS.forEach(server => {
                    cleanupPromises.push(server.stop({ doCleanup: true, force: true }));
                });
                global.__MONGO_SERVERS = [];
            }
        } catch { }

        // Close logger transports
        try {
            const logger = require('../utils/logger.js').default || require('../utils/logger.js');
            if (logger && typeof logger.close === 'function') {
                cleanupPromises.push(logger.close());
            }
        } catch { }

        // Close any HTTP servers
        try {
            if (global.__TEST_SERVERS) {
                global.__TEST_SERVERS.forEach(server => {
                    cleanupPromises.push(new Promise(resolve => {
                        server.close(() => resolve());
                    }));
                });
                global.__TEST_SERVERS = [];
            }
        } catch { }

        // Wait for all cleanup operations with timeout
        await Promise.race([
            Promise.allSettled(cleanupPromises),
            new Promise(resolve => setTimeout(resolve, 5000)) // 5s timeout
        ]);

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }

        // Final cleanup - remove all listeners
        if (process.removeAllListeners) {
            process.removeAllListeners();
        }

    } catch (e) {
        console.error('Teardown error:', e);
    }
};
