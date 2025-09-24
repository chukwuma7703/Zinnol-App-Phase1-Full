import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer;

export const TestDatabase = {
    async connect() {
        if (mongoose.connection.readyState === 1) return; // already connected
        if (!mongoServer) mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose.connect(uri);
    },
    async disconnect() {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
        if (mongoServer) {
            await mongoServer.stop();
            mongoServer = null;
        }
    },
    async clear() {
        if (mongoose.connection.readyState !== 1) return;
        const collections = mongoose.connection.collections;
        for (const key in collections) {
            await collections[key].deleteMany({});
        }
    }
};

export const TestHelpers = {
    async setupTestEnvironment() {
        await TestDatabase.connect();
        await TestDatabase.clear();
    }
};
