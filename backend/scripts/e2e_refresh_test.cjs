#!/usr/bin/env node
// E2E test: login -> refresh (rotation) -> ensure old refresh token is rejected
const assert = require('assert').strict;
const fetch = require('node-fetch').default || require('node-fetch');

const BASE = process.env.BASE || 'http://localhost:4000';
const credentials = { email: 'zinnol@gmail.com', password: 'Chris4@yahoozinnolbc' };

function parseSetCookie(setCookieHeader) {
    if (!setCookieHeader) return null;
    const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
    const parts = raw.split(';').map(p => p.trim());
    const [nameValue] = parts;
    const idx = nameValue.indexOf('=');
    return idx >= 0 ? nameValue.substring(idx + 1) : null;
}

async function request(path, opts = {}) {
    const url = new URL(path, BASE);
    const headers = opts.headers || {};
    const body = opts.body ? JSON.stringify(opts.body) : undefined;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(url.toString(), { method: opts.method || 'GET', headers, body, redirect: 'manual' });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { json = null; }
    const hdrs = {};
    res.headers.forEach((v, k) => { hdrs[k] = v; });
    return { status: res.status, headers: hdrs, body: json, text };
}

async function run() {
    console.log('E2E refresh rotation test starting against', BASE);

    // 1) Login
    const login = await request('/api/auth/login', { method: 'POST', body: credentials });
    console.log('Login status', login.status);
    assert.equal(login.status, 200, 'Login should return 200');
    assert(login.body && login.body.accessToken, 'Login response must include accessToken');
    const setCookie = login.headers['set-cookie'] || login.headers['Set-Cookie'];
    const refreshCookie = parseSetCookie(setCookie);
    assert(refreshCookie, 'Refresh cookie must be set on login');
    console.log('Obtained refresh cookie (len)', refreshCookie.length);

    // 2) Call refresh with the cookie to rotate
    const refresh1 = await request('/api/users/refresh', { method: 'POST', headers: { Cookie: `refreshToken=${refreshCookie}` } });
    console.log('Refresh1 status', refresh1.status);
    assert.equal(refresh1.status, 200, 'First refresh should return 200');
    assert(refresh1.body && refresh1.body.accessToken, 'Refresh response must include accessToken');
    const setCookie2 = refresh1.headers['set-cookie'] || refresh1.headers['Set-Cookie'];
    const newRefreshCookie = parseSetCookie(setCookie2);
    assert(newRefreshCookie && newRefreshCookie !== refreshCookie, 'Refresh token should be rotated to a new cookie');
    console.log('Rotation succeeded; new cookie len', newRefreshCookie.length);

    // 3) Reuse old cookie; expect failure (401)
    const refresh2 = await request('/api/users/refresh', { method: 'POST', headers: { Cookie: `refreshToken=${refreshCookie}` } });
    console.log('Refresh2 (reuse old cookie) status', refresh2.status);
    assert.equal(refresh2.status, 401, 'Reusing old refresh token should return 401');

    console.log('E2E refresh rotation test PASSED');
    process.exit(0);
}

run().catch(err => {
    console.error('E2E test FAILED:', err && err.message ? err.message : err);
    process.exit(1);
});
