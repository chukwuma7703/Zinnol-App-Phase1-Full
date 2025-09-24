// Fix existing schools by adding missing email addresses
import mongoose from 'mongoose';
import School from './models/School.js';

// Connect to MongoDB (use the same database as the backend)
mongoose.connect('mongodb://127.0.0.1:27017/zinnolDB');

async function fixSchools() {
  try {
    console.log('🔧 Fixing existing schools...');
    
    // Get all schools without email
    const schoolsWithoutEmail = await School.find({ 
      $or: [
        { email: { $exists: false } },
        { email: null },
        { email: undefined }
      ]
    });
    
    console.log(`📊 Found ${schoolsWithoutEmail.length} schools without email addresses`);
    
    if (schoolsWithoutEmail.length === 0) {
      console.log('✅ All schools already have email addresses!');
      return;
    }
    
    // Fix each school by adding a default email
    for (let i = 0; i < schoolsWithoutEmail.length; i++) {
      const school = schoolsWithoutEmail[i];
      
      // Generate a default email based on school name
      const emailName = school.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') // Remove special characters
        .substring(0, 20); // Limit length
      
      const defaultEmail = `${emailName}@school.com`;
      
      // Update the school
      school.email = defaultEmail;
      await school.save();
      
      console.log(`✅ Fixed school "${school.name}" - Added email: ${defaultEmail}`);
    }
    
    console.log('🎉 All schools have been fixed!');
    
    // Verify the fix
    const allSchools = await School.find({});
    console.log('\n📋 All schools now have emails:');
    allSchools.forEach((school, index) => {
      console.log(`  ${index + 1}. ${school.name} - ${school.email}`);
    });
    
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    mongoose.connection.close();
  }
}

fixSchools();