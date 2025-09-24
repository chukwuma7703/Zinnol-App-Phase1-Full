// Test Google Drive service initialization
import dotenv from 'dotenv';
dotenv.config({ path: './zinnol.env' });

import googleDriveService from './services/googleDriveService.js';

async function testGoogleDriveInit() {
    console.log('🧪 Testing Google Drive service initialization...');

    try {
        await googleDriveService.initialize();
        console.log('✅ Google Drive service initialized successfully');
        console.log('📁 Service status:', {
            isAuthenticated: googleDriveService.isAuthenticated,
            hasDrive: googleDriveService.drive !== null,
            rootFolderId: googleDriveService.rootFolderId
        });
    } catch (error) {
        console.log('❌ Google Drive service initialization failed (expected with placeholder credentials):');
        console.log('Error:', error.message);
        console.log('This is normal - you need to configure real Google Drive credentials');
    }
}

testGoogleDriveInit();
