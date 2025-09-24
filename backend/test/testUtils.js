/**
 * Test Utilities for Proper Cleanup
 * Handles all async operations that can prevent Jest from exiting
 */

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Track all resources for cleanup
const testResources = {
  mongoServers: new Set(),
  servers: new Set(),
  intervals: new Set(),
  timeouts: new Set(),
  redisClients: new Set(),
  socketConnections: new Set(),
};

/**
 * Setup MongoDB Memory Server with proper tracking
 */
export const setupTestDatabase = async () => {
  const mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName: `test-${Date.now()}`,
    },
  });
  
  testResources.mongoServers.add(mongoServer);
  
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri, {
    bufferCommands: false,
    bufferMaxEntries: 0,
  });
  
  return { mongoServer, mongoUri };
};

/**
 * Setup Express server with proper tracking
 */
export const setupTestServer = async (app, port = 0) => {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      testResources.servers.add(server);
      resolve(server);
    });
    
    // Set timeout to prevent hanging
    server.timeout = 5000;
  });
};

/**
 * Track intervals and timeouts for cleanup
 */
export const trackInterval = (intervalId) => {
  testResources.intervals.add(intervalId);
  return intervalId;
};

export const trackTimeout = (timeoutId) => {
  testResources.timeouts.add(timeoutId);
  return timeoutId;
};

/**
 * Clean up all tracked resources
 */
export const cleanupTestResources = async () => {
  const cleanupPromises = [];
  
  // Clear intervals
  testResources.intervals.forEach(intervalId => {
    clearInterval(intervalId);
  });
  testResources.intervals.clear();
  
  // Clear timeouts
  testResources.timeouts.forEach(timeoutId => {
    clearTimeout(timeoutId);
  });
  testResources.timeouts.clear();
  
  // Close servers
  testResources.servers.forEach(server => {
    cleanupPromises.push(
      new Promise(resolve => {
        server.close(() => resolve());
      })
    );
  });
  testResources.servers.clear();
  
  // Close Redis clients
  testResources.redisClients.forEach(client => {
    if (client && typeof client.quit === 'function') {
      cleanupPromises.push(client.quit());
    }
  });
  testResources.redisClients.clear();
  
  // Close socket connections
  testResources.socketConnections.forEach(socket => {
    if (socket && typeof socket.close === 'function') {
      cleanupPromises.push(socket.close());
    }
  });
  testResources.socketConnections.clear();
  
  // Close MongoDB connections
  if (mongoose.connection.readyState !== 0) {
    cleanupPromises.push(mongoose.connection.close());
  }
  
  // Stop MongoDB memory servers
  testResources.mongoServers.forEach(mongoServer => {
    cleanupPromises.push(mongoServer.stop());
  });
  testResources.mongoServers.clear();
  
  // Wait for all cleanup operations
  await Promise.allSettled(cleanupPromises);
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
};

/**
 * Create a test suite wrapper with automatic cleanup
 */
export const createTestSuite = (suiteName, testFn) => {
  describe(suiteName, () => {
    afterAll(async () => {
      await cleanupTestResources();
    });
    
    testFn();
  });
};

/**
 * Wait for all pending operations to complete
 */
export const waitForPendingOperations = async (timeout = 1000) => {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, timeout);
    testResources.timeouts.add(timer);
  });
};

/**
 * Force close all connections immediately
 */
export const forceCleanup = async () => {
  // Force close mongoose
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close(true);
  }
  
  // Force stop all mongo servers
  const stopPromises = Array.from(testResources.mongoServers).map(server => 
    server.stop({ doCleanup: true, force: true })
  );
  
  await Promise.allSettled(stopPromises);
  
  // Clear all resources
  testResources.mongoServers.clear();
  testResources.servers.clear();
  testResources.intervals.clear();
  testResources.timeouts.clear();
  testResources.redisClients.clear();
  testResources.socketConnections.clear();
};

export default {
  setupTestDatabase,
  setupTestServer,
  trackInterval,
  trackTimeout,
  cleanupTestResources,
  createTestSuite,
  waitForPendingOperations,
  forceCleanup,
};