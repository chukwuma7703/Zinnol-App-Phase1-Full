#!/usr/bin/env node
// Usage:
// node scripts/list_refresh_tokens.cjs --userId=<userId> [--token="<tokenString>"]
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '..', 'zinnol.env') });

const argv = require('minimist')(process.argv.slice(2));
const userId = argv.userId || argv.u;
const listAll = argv.all || argv.a || false;
const token = argv.token || argv.t;

if (!userId) {
    console.error('Please pass --userId=<userId>');
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
        // Try multiple likely collection names to find persisted refresh tokens
        const candidateCollections = ['refreshtokens', 'refreshTokens', 'RefreshTokens', 'RefreshToken', 'refresh_token', 'refresh_tokens'];
        let found = false;
        for (const coll of candidateCollections) {
            const exists = await mongoose.connection.db.listCollections({ name: coll }).hasNext();
            if (!exists) continue;
            const col = mongoose.connection.db.collection(coll);
            let docs;
            if (listAll) {
                docs = await col.find({}).toArray();
            } else if (userId) {
                docs = await col.find({ user: new mongoose.Types.ObjectId(userId) }).toArray();
            } else {
                docs = [];
            }
            console.log(`Found docs in collection '${coll}':`);
            console.log(JSON.stringify(docs, null, 2));
            found = true;
        }
        if (!found) {
            console.log('No refresh token collections found (checked candidates).');
        }

        if (token) {
            const hash = crypto.createHash('sha256').update(token).digest('hex');
            // search across all collections for tokenHash
            const allColls = await mongoose.connection.db.listCollections().toArray();
            let match = null;
            for (const c of allColls) {
                const col = mongoose.connection.db.collection(c.name);
                match = await col.findOne({ tokenHash: hash });
                if (match) {
                    console.log('\nProvided token hash found in collection:', c.name);
                    console.log(JSON.stringify(match, null, 2));
                    break;
                }
            }
            if (!match) {
                console.log('\nProvided token hash not found in any collection.');
            }
        }

        if (argv.scan || argv.s) {
            console.log('\nScanning all collections for any documents with tokenHash field...');
            const allColls = await mongoose.connection.db.listCollections().toArray();
            for (const c of allColls) {
                const col = mongoose.connection.db.collection(c.name);
                const docs = await col.find({ tokenHash: { $exists: true } }).limit(10).toArray();
                if (docs && docs.length) {
                    console.log(`\nCollection '${c.name}' contains documents with tokenHash:`);
                    console.log(JSON.stringify(docs, null, 2));
                }
            }
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
