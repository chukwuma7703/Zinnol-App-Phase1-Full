// Simple test to verify school creation is working
import mongoose from 'mongoose';
import School from './models/School.js';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/zinnol-exam', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testSchoolCreation() {
  try {
    console.log('🧪 Testing school creation...');
    
    // Create a test school
    const testSchool = {
      name: 'Test School Creation',
      address: '123 Test Street, Test City',
      phone: '+234-123-456-7890',
      email: 'test@testschool.com',
      description: 'Test school for verification',
      numberOfStudents: 100,
      numberOfTeachers: 10
    };
    
    const school = await School.create(testSchool);
    console.log('✅ School created successfully:', school.name);
    console.log('📧 Email:', school.email);
    console.log('🆔 ID:', school._id);
    
    // Verify it can be retrieved
    const retrievedSchool = await School.findById(school._id);
    console.log('✅ School retrieved successfully:', retrievedSchool.name);
    
    // Get all schools
    const allSchools = await School.find({});
    console.log(`📊 Total schools in database: ${allSchools.length}`);
    
    // List all schools
    console.log('📋 All schools in database:');
    allSchools.forEach((s, index) => {
      console.log(`  ${index + 1}. ${s.name} (${s.email}) - Created: ${s.createdAt}`);
    });
    
    // Clean up - remove test school
    await School.findByIdAndDelete(school._id);
    console.log('🧹 Test school cleaned up');
    
    console.log('🎉 All tests passed! School creation is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    mongoose.connection.close();
  }
}

testSchoolCreation();