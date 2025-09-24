// createGlobalSuperAdmin.cjs
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/zinnolDB';

async function createGlobalSuperAdmin() {
    // Dynamically import ESM model inside CJS
    const { default: User } = await import('./models/userModel.js');

    await mongoose.connect(MONGO_URI);

    // Allow overriding via env
    const desiredEmail = process.env.GSA_EMAIL || 'global.admin@example.com';
    const desiredPassword = process.env.GSA_PASSWORD; // undefined means: do not force-reset existing password

    // 1) If an existing GLOBAL_SUPER_ADMIN exists, update fields safely
    let gsa = await User.findOne({ role: 'GLOBAL_SUPER_ADMIN' }).select('+password');
    if (gsa) {
        // Update email only if provided and different
        if (desiredEmail && gsa.email !== desiredEmail) {
            gsa.email = desiredEmail;
        }
        gsa.name = gsa.name || 'Global Admin';
        // Only reset password if explicitly provided
        if (desiredPassword) {
            gsa.password = desiredPassword; // pre-save hook will hash
        }
        gsa.role = 'GLOBAL_SUPER_ADMIN';
        gsa.isActive = true;
        gsa.isVerified = true;
        await gsa.save();
        console.log(`🔄 Global Super Admin ensured. email=${gsa.email} password_reset=${Boolean(desiredPassword)}`);
    } else {
        // 2) No GSA found — upsert by desired email
        let byEmail = await User.findOne({ email: desiredEmail }).select('+password');
        if (!byEmail) {
            if (!desiredPassword) {
                console.error('❌ No existing GSA and GSA_PASSWORD not provided. Refusing to create a user with an unknown password.');
                await mongoose.disconnect();
                process.exit(1);
            }
            byEmail = new User({
                name: 'Chukwuma Nnoli',
                email: desiredEmail,
                password: desiredPassword,
                role: 'GLOBAL_SUPER_ADMIN',
                isActive: true,
                isVerified: true,
            });
            await byEmail.save();
            console.log(`✅ Global Super Admin created: ${desiredEmail}`);
        } else {
            byEmail.name = byEmail.name || 'Global Admin';
            if (desiredPassword) {
                byEmail.password = desiredPassword; // only reset if provided
            }
            byEmail.role = 'GLOBAL_SUPER_ADMIN';
            byEmail.isActive = true;
            byEmail.isVerified = true;
            await byEmail.save();
            console.log(`🔄 Existing user promoted to Global Super Admin: ${byEmail.email}; password_reset=${Boolean(desiredPassword)}`);
        }
    }

    await mongoose.disconnect();
}

createGlobalSuperAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Seeder failed:', err);
        process.exit(1);
    });
