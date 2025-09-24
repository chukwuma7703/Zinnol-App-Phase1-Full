const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/zinnolDB');

async function resetAdminPassword() {
    try {
        // Import the User model
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
        
        const newPassword = '123456';
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        // Update the admin@example.com account
        const result = await User.updateOne(
            { email: 'admin@example.com' },
            { 
                password: hashedPassword,
                isActive: true,
                loginAttempts: 0,
                lockUntil: null
            }
        );
        
        if (result.matchedCount > 0) {
            console.log('✅ Password reset successful for admin@example.com');
            console.log('Email: admin@example.com');
            console.log('Password: 123456');
        } else {
            console.log('❌ No user found with email admin@example.com');
        }
        
        mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        mongoose.disconnect();
    }
}

resetAdminPassword();