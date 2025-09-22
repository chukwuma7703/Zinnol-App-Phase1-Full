import http from 'k6/http';
import { check, sleep } from 'k6';

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Warm up to 10 users
    { duration: '1m', target: 50 },    // Ramp up to 50 users
    { duration: '2m', target: 50 },    // Stay at 50 users
    { duration: '30s', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.1'],     // Error rate should be below 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000'; // eslint-disable-line no-undef

// Simulated user credentials for different roles
const users = {
  admin: { email: 'admin@example.com', password: 'adminpass' },
  teacher: { email: 'teacher@example.com', password: 'teacherpass' },
  student: { email: 'student@example.com', password: 'studentpass' },
};

export default function () {
  // Health check - always fast
  const healthResponse = http.get(`${BASE_URL}/healthz`);
  check(healthResponse, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 100ms': (r) => r.timings.duration < 100,
  });

  // Version endpoint
  const versionResponse = http.get(`${BASE_URL}/version`);
  check(versionResponse, {
    'version status is 200': (r) => r.status === 200,
    'version has required fields': (r) => r.json().version && r.json().environment,
  });

  // Simulate different user types with different behaviors
  const userType = ['admin', 'teacher', 'student'][Math.floor(Math.random() * 3)];
  const user = users[userType];

  // Login simulation
  const loginPayload = JSON.stringify({
    email: user.email,
    password: user.password,
  });

  const loginResponse = http.post(`${BASE_URL}/api/auth/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(loginResponse, {
    'login status is 200': (r) => r.status === 200,
    'login returns token': (r) => r.json().accessToken,
  });

  if (loginResponse.status === 200) {
    const token = loginResponse.json().accessToken;
    const headers = {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    // Role-specific operations
    switch (userType) {
      case 'admin': {
        // Admin operations - analytics and global overview
        const analyticsResponse = http.get(`${BASE_URL}/api/analytics/global-overview`, headers);
        check(analyticsResponse, {
          'admin analytics status is 200': (r) => r.status === 200,
        });
        break;
      }

      case 'teacher': {
        // Teacher operations - assignments and results
        const assignmentsResponse = http.get(`${BASE_URL}/api/assignments`, headers);
        check(assignmentsResponse, {
          'teacher assignments status is 200': (r) => r.status === 200,
        });
        break;
      }

      case 'student': {
        // Student operations - classes and personal data
        const classesResponse = http.get(`${BASE_URL}/api/classes`, headers);
        check(classesResponse, {
          'student classes status is 200': (r) => r.status === 200,
        });
        break;
      }
    }
  }

  // Random sleep between 1-3 seconds to simulate real user behavior
  sleep(Math.random() * 2 + 1);
}

// Setup function - runs before the test starts
export function setup() {
  // Verify the service is healthy before starting the test
  const response = http.get(`${BASE_URL}/healthz`);
  if (response.status !== 200) {
    console.error('Service is not healthy. Aborting test.');
    return;
  }
  console.log('Service is healthy. Starting load test...');
}

// Teardown function - runs after the test completes
export function teardown(data) {
  console.log('Load test completed.');
}
