#!/usr/bin/env node

import axios from 'axios';

const BASE_URL = 'http://localhost:4000';
let authToken = '';

// Test configuration
const testConfig = {
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json'
  }
};

// Test user credentials
const testUser = {
  name: "Test Admin",
  email: "admin@test.com",
  password: "Test123@"
};

// Test school data
const testSchool = {
  name: "Kings & Queens School",
  address: "123 Main St",
  phone: "123-456-7890",
  email: "school1@example.com"
};

async function testEndpoint(method, url, data = null, requiresAuth = false) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${url}`,
      timeout: testConfig.timeout,
      headers: { ...testConfig.headers }
    };

    if (requiresAuth && authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }

    if (data) {
      config.data = data;
    }

    console.log(`\n🔍 Testing: ${method.toUpperCase()} ${url}`);
    console.log(`📤 Request:`, data ? JSON.stringify(data, null, 2) : 'No body');

    const response = await axios(config);
    
    console.log(`✅ Status: ${response.status}`);
    console.log(`📥 Response:`, JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`📥 Error Response:`, JSON.stringify(error.response.data, null, 2));
      console.log(`📊 Status: ${error.response.status}`);
    }
    return null;
  }
}

async function runSchoolEndpointTests() {
  console.log('🚀 Starting School Endpoint Tests...\n');

  // Step 1: Register a test user (if needed)
  console.log('='.repeat(50));
  console.log('STEP 1: User Registration');
  console.log('='.repeat(50));
  
  await testEndpoint('POST', '/api/users/register', testUser);

  // Step 2: Login to get auth token
  console.log('\n' + '='.repeat(50));
  console.log('STEP 2: User Login');
  console.log('='.repeat(50));
  
  const loginResult = await testEndpoint('POST', '/api/users/login', {
    email: testUser.email,
    password: testUser.password
  });

  if (loginResult && loginResult.accessToken) {
    authToken = loginResult.accessToken;
    console.log('🔑 Auth token obtained successfully');
  } else {
    console.log('❌ Failed to get auth token');
    return;
  }

  // Step 3: Test public schools with locations
  console.log('\n' + '='.repeat(50));
  console.log('STEP 3: Get Public Schools with Locations');
  console.log('='.repeat(50));
  
  await testEndpoint('GET', '/api/schools/locations');

  // Step 4: Get all schools (requires auth)
  console.log('\n' + '='.repeat(50));
  console.log('STEP 4: Get All Schools (Authenticated)');
  console.log('='.repeat(50));
  
  await testEndpoint('GET', '/api/schools', null, true);

  // Step 5: Create a school
  console.log('\n' + '='.repeat(50));
  console.log('STEP 5: Create School');
  console.log('='.repeat(50));
  
  const createResult = await testEndpoint('POST', '/api/schools', testSchool, true);
  let schoolId = null;
  
  if (createResult && createResult.data && createResult.data._id) {
    schoolId = createResult.data._id;
    console.log(`🏫 School created with ID: ${schoolId}`);
  }

  // Step 6: Get school by ID (if we have one)
  if (schoolId) {
    console.log('\n' + '='.repeat(50));
    console.log('STEP 6: Get School by ID');
    console.log('='.repeat(50));
    
    await testEndpoint('GET', `/api/schools/${schoolId}`, null, true);

    // Step 7: Update school
    console.log('\n' + '='.repeat(50));
    console.log('STEP 7: Update School');
    console.log('='.repeat(50));
    
    const updateData = {
      name: "Updated School Name",
      email: "updatedschool@example.com"
    };
    
    await testEndpoint('PUT', `/api/schools/${schoolId}`, updateData, true);

    // Step 8: Delete school
    console.log('\n' + '='.repeat(50));
    console.log('STEP 8: Delete School');
    console.log('='.repeat(50));
    
    await testEndpoint('DELETE', `/api/schools/${schoolId}`, null, true);
  }

  console.log('\n' + '='.repeat(50));
  console.log('🎉 School Endpoint Tests Completed!');
  console.log('='.repeat(50));
}

// Run the tests
runSchoolEndpointTests().catch(console.error);