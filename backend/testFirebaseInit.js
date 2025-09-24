import admin from "firebase-admin";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config();

try {
  const serviceAccountPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccountKey.json");
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✅ Firebase initialized successfully!");
} catch (error) {
  console.error("❌ Firebase init failed:", error);
}
