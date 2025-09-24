#!/usr/bin/env node
// Usage:
// node scripts/insert_refresh_token.cjs --userId=<userId> --token="<refreshToken>" [--days=<days>]
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '..', 'zinnol.env') });

const argv = require('minimist')(process.argv.slice(2));
const userId = argv.userId || argv.u;
const token = argv.token || argv.t;
const days = Number(argv.days || argv.d || 7);

if (!userId || !token) {
    console.error('Please pass --userId and --token');
    process.exit(1);
}

(async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!uri) {
            console.error('No MONGO_URI/MONGODB_URI found in zinnol.env');
            process.exit(1);
        }
        await mongoose.connect(uri);
        const colName = 'refreshtokens';
        const col = mongoose.connection.db.collection(colName);
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        const doc = { tokenHash, user: new mongoose.Types.ObjectId(userId), revoked: false, expiresAt };
        const existing = await col.findOne({ tokenHash });
        if (existing) {
            console.log('Token already exists in DB:', existing);
        } else {
            const r = await col.insertOne(doc);
            console.log('Inserted refresh token doc:', r.insertedId);
        }
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
