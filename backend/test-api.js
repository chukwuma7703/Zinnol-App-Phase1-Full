// Test the schools API endpoint directly
import fetch from 'node-fetch';

async function testSchoolsAPI() {
  try {
    console.log('🧪 Testing schools API endpoint...');
    
    // Test without authentication first (should get 401)
    console.log('\n1. Testing without authentication:');
    const unauthResponse = await fetch('http://localhost:4000/api/schools');
    console.log(`   Status: ${unauthResponse.status}`);
    const unauthData = await unauthResponse.json();
    console.log(`   Response:`, unauthData);
    
    // Test the public schools endpoint (should work)
    console.log('\n2. Testing public schools endpoint:');
    const publicResponse = await fetch('http://localhost:4000/api/schools/locations');
    console.log(`   Status: ${publicResponse.status}`);
    const publicData = await publicResponse.json();
    console.log(`   Schools found: ${publicData.schools?.length || 0}`);
    if (publicData.schools?.length > 0) {
      console.log('   First school:', publicData.schools[0].name);
    }
    
  } catch (error) {
    console.error('❌ API test failed:', error.message);
  }
}

testSchoolsAPI();