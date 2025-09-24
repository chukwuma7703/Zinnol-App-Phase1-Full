import fetch from 'node-fetch';

async function testEndpoints() {
    try {
        console.log('Testing health endpoint...');
        const healthResponse = await fetch('http://127.0.0.1:4000/healthz');
        const healthData = await healthResponse.json();
        console.log('Health:', healthData);

        console.log('Testing readiness endpoint...');
        const readyResponse = await fetch('http://127.0.0.1:4000/readyz');
        const readyData = await readyResponse.json();
        console.log('Readiness:', readyData);
    } catch (error) {
        console.error('Error testing endpoints:', error.message);
    }
}

testEndpoints();
