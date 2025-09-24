#!/usr/bin/env node
/*
  Usage:
    node generate_long_token.cjs --id=<userId> --role=<ROLE> --days=<days>
  Example:
    node generate_long_token.cjs --id=68c16aaf87b6ced34c95cc08 --role=GLOBAL_SUPER_ADMIN --days=365
*/
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// load .env if present
const dotenvPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(dotenvPath)) {
    require('dotenv').config({ path: dotenvPath });
}

const argv = require('minimist')(process.argv.slice(2));
const id = argv.id || argv.i || 'test-user-id';
const role = argv.role || argv.r || 'GLOBAL_SUPER_ADMIN';
const days = Number(argv.days || argv.d || 365);

const secret = process.env.JWT_SECRET;
if (!secret) {
    console.error('JWT_SECRET not found in environment. Please set JWT_SECRET in backend/.env');
    process.exit(1);
}

const payload = { id, role, school: null, tokenVersion: 0 };
const expiresIn = `${days}d`;
const token = jwt.sign(payload, secret, { expiresIn });

console.log('Generated token (expires in', expiresIn + '):');
console.log(token);
console.log('\nCopy this into your zinnol-api.rest as:');
console.log(`@auth = Bearer ${token}`);

// also print a curl example
console.log('\nExample curl using this token:');
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:4000/api/users/me`);
