#!/usr/bin/env node
// Quick script to list a few users from the same DB the server uses (reads from zinnol.env)
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', 'zinnol.env') });

const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const User = mongoose.model('User', userSchema);

// ...existing code...
(async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!uri) {
            console.error('No MONGO_URI/MONGODB_URI found in zinnol.env');
            process.exit(1);
        }
        await mongoose.connect(uri);
        const users = await User.find({}, { _id: 1, email: 1, role: 1, isActive: 1 }).limit(20).lean();
        console.log('Found users:', JSON.stringify(users, null, 2));
    } catch (err) {
        console.error(err);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
})();