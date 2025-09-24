// config/firebaseAdmin.js (ESM)
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import dotenv from "dotenv";

// Load zinnol.env explicitly for Firebase config
dotenv.config({ path: './zinnol.env' });

const {
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY, // must be multiline-safe
} = process.env;

let adminApp = null;
try {
  // Only attempt to initialize if not already done and if all credentials are present.
  if (!getApps().length && FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    adminApp = initializeApp({
      credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        // IMPORTANT: convert \n to real newlines for env-stored keys
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
    console.log("✅ Firebase initialized for push notifications");
  } else if (process.env.NODE_ENV !== 'test') {
    // Only show this warning when not in a test environment to keep test logs clean.
    console.warn("⚠️ Missing Firebase Admin env vars. Push will be disabled.");
  }
} catch (err) {
  console.error("❌ Firebase init failed:", err);
}

export const messaging = adminApp ? getMessaging() : null;
