#!/usr/bin/env node

/**
 * Firebase Setup Helper
 * Run this script after downloading your Firebase service account JSON
 */

import fs from 'fs';
import path from 'path';

const setupFirebase = () => {
  console.log('🔥 Firebase Setup Helper for Zinnol Education Platform');
  console.log('================================================\n');

  console.log('📋 Steps to complete Firebase setup:\n');

  console.log('1. 🔑 Get Firebase Admin SDK Credentials:');
  console.log('   - Go to: https://console.firebase.google.com/u/0/project/zinnol-education-platform/settings/serviceaccounts/adminsdk');
  console.log('   - Click "Generate new private key"');
  console.log('   - Download the JSON file');
  console.log('   - Save it as "serviceAccountKey.json" in the backend folder\n');

  console.log('2. 🌐 Enable Google Cloud APIs:');
  console.log('   - Go to: https://console.cloud.google.com/apis/library?project=zinnol-education-platform');
  console.log('   - Enable these APIs:');
  console.log('     ✅ Identity and Access Management (IAM) API');
  console.log('     ✅ Google+ API');
  console.log('     ✅ Google Drive API');
  console.log('     ✅ Gmail API');
  console.log('     ✅ Firebase Admin SDK\n');

  console.log('3. 🔐 Configure OAuth:');
  console.log('   - Go to: https://console.cloud.google.com/apis/credentials/consent?project=zinnol-education-platform');
  console.log('   - Set up OAuth consent screen');
  console.log('   - Create OAuth 2.0 Client ID\n');

  console.log('4. 📝 Update Environment Variables:');
  console.log('   - Copy credentials to your .env files');
  console.log('   - Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
  console.log('   - Update FIREBASE_* variables\n');

  // Check if service account file exists
  const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    console.log('✅ Found serviceAccountKey.json');
    
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      
      console.log('\n🔧 Your Firebase configuration:');
      console.log(`Project ID: ${serviceAccount.project_id}`);
      console.log(`Client Email: ${serviceAccount.client_email}`);
      console.log('Private Key: [HIDDEN FOR SECURITY]');
      
      console.log('\n📋 Add these to your .env file:');
      console.log(`FIREBASE_PROJECT_ID=${serviceAccount.project_id}`);
      console.log(`FIREBASE_CLIENT_EMAIL=${serviceAccount.client_email}`);
      console.log('FIREBASE_PRIVATE_KEY="' + serviceAccount.private_key.replace(/\n/g, '\\n') + '"');
      
    } catch (error) {
      console.log('❌ Error reading serviceAccountKey.json:', error.message);
    }
  } else {
    console.log('⚠️  serviceAccountKey.json not found');
    console.log('   Please download it from Firebase Console first');
  }

  console.log('\n🚀 Once configured, test your setup:');
  console.log('   npm run dev (in backend)');
  console.log('   npm run dev (in frontend)');
  console.log('   Visit: http://localhost:5173/login');
};

setupFirebase();