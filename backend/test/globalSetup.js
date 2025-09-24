/**
 * Improved Global Test Setup
 * Better handle management and cleanup
 */

export default async function globalSetup() {
  console.log('🚀 Starting global test setup...');
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key-for-testing';
  process.env.MONGO_URI = 'mongodb://localhost:27017/zinnol-test';
  process.env.REDIS_URL = 'redis://localhost:6379/1';
  process.env.PORT = '4001';
  
  // Disable external services in tests
  process.env.DISABLE_FIREBASE = 'true';
  process.env.DISABLE_REDIS = 'true';
  process.env.DISABLE_CRON = 'true';
  process.env.DISABLE_MONITORING = 'true';
  
  console.log('✅ Test environment configured');
  
  // Set up process handlers for cleanup
  const cleanup = async () => {
    console.log('🧹 Process cleanup triggered...');
    
    try {
      // Import and run teardown
      const teardown = await import('./teardown.js');
      if (teardown.default) {
        await teardown.default();
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
    
    process.exit(0);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    cleanup();
  });
  
  console.log('🎉 Global setup completed successfully');
}
