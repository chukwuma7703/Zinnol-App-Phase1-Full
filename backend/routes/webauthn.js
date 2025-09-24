import express from 'express';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import base64url from 'base64url';
const router = express.Router();

// In-memory store for demo (use DB in production)
const users = {};

router.post('/register', async (req, res) => {
    const { username } = req.body;
    const user = users[username] || { id: base64url.encode(username), credentials: [] };
    users[username] = user;

    try {
        const rpID = process.env.NODE_ENV === 'production' ? req.hostname : 'localhost';

        const options = await generateRegistrationOptions({
            rpName: 'Zinnol App',
            rpID: rpID,
            userID: new Uint8Array(Buffer.from(user.id, 'base64')),
            userName: username,
        });
        user.currentChallenge = options.challenge;
        res.json(options);
    } catch (error) {
        console.error('WebAuthn register error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate registration options', error: error.message });
    }
});

router.post('/register/verify', async (req, res) => {
    const { username, attestationResponse } = req.body;
    const user = users[username];

    if (!user) {
        return res.status(400).json({
            success: false,
            message: 'User not found. Please register first.'
        });
    }

    try {
        const rpID = process.env.NODE_ENV === 'production' ? req.hostname : 'localhost';
        const expectedOrigin = process.env.NODE_ENV === 'production' ? `https://${req.hostname}` : 'http://localhost:4000';

        const verification = await verifyRegistrationResponse({
            response: attestationResponse,
            expectedChallenge: user.currentChallenge,
            expectedOrigin: expectedOrigin,
            expectedRPID: rpID,
        });
        if (verification.verified) {
            user.credentials.push(verification.registrationInfo.credentialID);
            res.json({ success: true });
        } else {
            res.status(400).json({ success: false, message: 'Registration verification failed' });
        }
    } catch (error) {
        console.error('WebAuthn register verify error:', error);
        res.status(500).json({ success: false, message: 'Failed to verify registration' });
    }
});

router.post('/authenticate', async (req, res) => {
    const { username } = req.body;
    const user = users[username];

    if (!user || !user.credentials || user.credentials.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'User not found or no registered credentials. Please register first.'
        });
    }

    try {
        const rpID = process.env.NODE_ENV === 'production' ? req.hostname : 'localhost';
        const expectedOrigin = process.env.NODE_ENV === 'production' ? `https://${req.hostname}` : 'http://localhost:4000';

        const options = await generateAuthenticationOptions({
            rpID: rpID,
            userVerification: 'preferred',
            allowCredentials: user.credentials.map(id => ({ id, type: 'public-key' })),
        });
        user.currentChallenge = options.challenge;
        res.json(options);
    } catch (error) {
        console.error('WebAuthn authenticate error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate authentication options' });
    }
});

router.post('/authenticate/verify', async (req, res) => {
    const { username, assertionResponse } = req.body;
    const user = users[username];

    if (!user || !user.credentials || user.credentials.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'User not found or no registered credentials.'
        });
    }

    try {
        const rpID = process.env.NODE_ENV === 'production' ? req.hostname : 'localhost';
        const expectedOrigin = process.env.NODE_ENV === 'production' ? `https://${req.hostname}` : 'http://localhost:4000';

        const verification = await verifyAuthenticationResponse({
            response: assertionResponse,
            expectedChallenge: user.currentChallenge,
            expectedOrigin: expectedOrigin,
            expectedRPID: rpID,
            authenticator: { credentialID: user.credentials[0] }, // Simplified
        });
        if (verification.verified) {
            res.json({ success: true });
        } else {
            res.status(400).json({ success: false, message: 'Authentication failed' });
        }
    } catch (error) {
        console.error('WebAuthn verify error:', error);
        res.status(500).json({ success: false, message: 'Failed to verify authentication' });
    }
});

export default router;
