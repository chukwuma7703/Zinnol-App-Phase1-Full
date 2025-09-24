const mongoose = require('mongoose');
const User = require('../models/userModel');
require('dotenv').config({ path: '../zinnol.env' });

async function main() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zinnol-app');
    const email = process.argv[2] || 'zinnol@gmail.com';
    const user = await User.findOne({ email }).select('+tokenVersion +isActive +role +email');
    if (!user) {
        console.error('User not found for email', email);
        process.exit(2);
    }
    console.log('User:', { _id: user._id.toString(), email: user.email, tokenVersion: user.tokenVersion, isActive: user.isActive, role: user.role });
    await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
