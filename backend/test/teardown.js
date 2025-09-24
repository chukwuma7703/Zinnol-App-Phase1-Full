/**
 * Improved Global Test Teardown
 * Properly closes all connections and handles
 */

export default async function globalTeardown() {
  console.log('🧹 Starting global test teardown...');
  
  try {
    // Close MongoDB connections
    const mongoose = await import('mongoose');
    if (mongoose.default.connection.readyState !== 0) {
      await mongoose.default.connection.close(true);
      console.log('✅ MongoDB connection closed');
    }
    
    // Close all mongoose connections
    const connections = mongoose.default.connections;
    for (const connection of connections) {
      if (connection.readyState !== 0) {
        await connection.close(true);
      }
    }
    
    // Close Redis connections
    try {
      const { getRedisClient } = await import('../config/cache.js');
      const redisClient = getRedisClient();
      if (redisClient && typeof redisClient.quit === 'function') {
        await redisClient.quit();
        console.log('✅ Redis connection closed');
      }
    } catch (error) {
      // Redis might not be initialized in tests
    }
    
    // Clear all timers
    const maxTimerId = setTimeout(() => {}, 0);
    for (let i = 1; i <= maxTimerId; i++) {
      clearTimeout(i);
      clearInterval(i);
    }
    clearTimeout(maxTimerId);
    console.log('✅ All timers cleared');
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('✅ Garbage collection triggered');
    }
    
    console.log('🎉 Global teardown completed successfully');
    
  } catch (error) {
    console.error('❌ Error during global teardown:', error);
  }
}
