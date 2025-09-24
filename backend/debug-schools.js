// Debug script to check what's actually in the database
import mongoose from 'mongoose';
import School from './models/School.js';

// Connect to MongoDB (use the same database as the backend)
mongoose.connect('mongodb://127.0.0.1:27017/zinnolDB');

async function debugSchools() {
  try {
    console.log('🔍 Debugging school database...');
    
    // Get all schools from database
    const schools = await School.find({});
    console.log(`📊 Total schools in database: ${schools.length}`);
    
    if (schools.length === 0) {
      console.log('❌ No schools found in database!');
    } else {
      console.log('\n📋 All schools in database:');
      schools.forEach((school, index) => {
        console.log(`\n${index + 1}. School Details:`);
        console.log(`   Name: ${school.name}`);
        console.log(`   Email: ${school.email}`);
        console.log(`   Address: ${school.address}`);
        console.log(`   Phone: ${school.phone}`);
        console.log(`   Active: ${school.isActive}`);
        console.log(`   Students: ${school.numberOfStudents || 0}`);
        console.log(`   Teachers: ${school.numberOfTeachers || 0}`);
        console.log(`   Created: ${school.createdAt}`);
        console.log(`   ID: ${school._id}`);
      });
    }
    
    // Check database connection
    console.log('\n🔗 Database connection info:');
    console.log(`   Database: ${mongoose.connection.db.databaseName}`);
    console.log(`   Host: ${mongoose.connection.host}`);
    console.log(`   Port: ${mongoose.connection.port}`);
    console.log(`   Ready State: ${mongoose.connection.readyState}`); // 1 = connected
    
    // Check collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n📁 Available collections:');
    collections.forEach(col => {
      console.log(`   - ${col.name}`);
    });
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    mongoose.connection.close();
  }
}

debugSchools();