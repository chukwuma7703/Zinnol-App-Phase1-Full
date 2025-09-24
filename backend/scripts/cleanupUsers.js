import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/userModel.js';

dotenv.config({ path: '../zinnol.env' });

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

async function cleanupUsers() {
    try {
        await mongoose.connect(mongoUri);
        const result = await User.deleteMany({});
        console.log(`✅ Deleted ${result.deletedCount} users from the database.`);
        await mongoose.disconnect();
    } catch (error) {
        console.error('❌ Error cleaning up users:', error);
    }
}

cleanupUsers();
