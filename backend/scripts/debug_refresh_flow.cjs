#!/usr/bin/env node
// Debug script: login, capture refresh cookie, compute sha256, check DB, call refresh endpoint
const fetch = require('node-fetch').default || require('node-fetch');
const crypto = require('crypto');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', 'zinnol.env') });
const RefreshTokenModelNameCandidates = ['refreshtokens', 'refreshTokens', 'RefreshTokens', 'RefreshToken', 'refresh_token', 'refresh_tokens'];

(async () => {
    try {
        const loginRes = await fetch('http://localhost:4000/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'zinnol@gmail.com', password: 'Chris4@yahoozinnolbc' }) });
        console.log('Login status', loginRes.status);
        const loginText = await loginRes.text();
        console.log('Login body (truncated 400 chars):', loginText.substring(0, 400));

        // extract set-cookie header
        const rawHeaders = loginRes.headers.raw();
        const setCookie = rawHeaders['set-cookie'] || rawHeaders['Set-Cookie'];
        if (!setCookie) {
            console.log('No Set-Cookie found');
            process.exit(1);
        }
        const cookieHeader = Array.isArray(setCookie) ? setCookie.find(s => s.includes('refreshToken=')) : setCookie;
        const match = cookieHeader.match(/refreshToken=([^;]+);/i);
        const cookieValue = match ? match[1] : null;
        console.log('Captured refresh cookie length:', cookieValue ? cookieValue.length : null);

        // compute hash
        const hash = crypto.createHash('sha256').update(cookieValue || '').digest('hex');
        console.log('Computed tokenHash:', hash);

        // connect to DB and search
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!uri) { console.log('No Mongo URI in zinnol.env'); process.exit(1); }
        await mongoose.connect(uri);
        console.log('Connected to MongoDB for inspection');

        let found = false;
        for (const collName of RefreshTokenModelNameCandidates) {
            const exists = await mongoose.connection.db.listCollections({ name: collName }).hasNext();
            if (!exists) continue;
            const col = mongoose.connection.db.collection(collName);
            const doc = await col.findOne({ tokenHash: hash });
            console.log(`Searched collection ${collName} -> ${doc ? 'FOUND' : 'not found'}`);
            if (doc) { console.log(JSON.stringify(doc, null, 2)); found = true; }
        }
        if (!found) console.log('Token hash not present in candidates. Scanning recent docs...');

        // Call refresh endpoint using cookie
        const refreshRes = await fetch('http://localhost:4000/api/users/refresh', { method: 'POST', headers: { 'Cookie': `refreshToken=${cookieValue}` } });
        console.log('Refresh status', refreshRes.status);
        const refreshText = await refreshRes.text();
        console.log('Refresh body:', refreshText);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Error in debug script:', err && err.message ? err.message : err);
        process.exit(1);
    }
})();
