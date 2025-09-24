import http from 'http';

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/schools/locations',
  method: 'GET',
  timeout: 3000
};

console.log('🔍 Testing simple HTTP request to server...');

const req = http.request(options, (res) => {
  console.log(`✅ Status: ${res.statusCode}`);
  console.log(`📥 Headers:`, res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`📥 Response:`, data);
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.log(`❌ Error: ${err.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  console.log('❌ Request timed out');
  req.destroy();
  process.exit(1);
});

req.setTimeout(3000);
req.end();