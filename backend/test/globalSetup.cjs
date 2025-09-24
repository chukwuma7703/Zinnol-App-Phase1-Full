// Global Jest setup: start Mongo Memory Server and connect mongoose for tests under default config
module.exports = async () => {
    try {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        const mongoose = require('mongoose');

        const mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'jest' } });
        const uri = mongoServer.getUri();

        // Connect mongoose with sane timeouts to avoid hangs
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 20000,
        });

        // Expose for teardown
        global.__MONGO_SERVER = mongoServer;

        process.env.MONGO_URI = uri;
        if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-secret-key';
        process.env.NODE_ENV = 'test';
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Global setup failed:', e);
        throw e;
    }
};
