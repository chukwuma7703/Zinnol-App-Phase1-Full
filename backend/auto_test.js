import fetch from "node-fetch";

const baseUrl = "http://localhost:4000/api";
const adminEmail = "admin@example.com";
const adminPassword = "123456";

async function run() {
  try {
    // 1. LOGIN as admin
    console.log("Logging in...");
    const loginRes = await fetch(`${baseUrl}/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error(loginData.message || "Login failed");
    const token = loginData.accessToken;
    console.log("Logged in, token received.");

    // 2. CREATE SCHOOL
    console.log("Creating test school...");
    const schoolRes = await fetch(`${baseUrl}/schools`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: `Temp School ${Date.now()}`,
        address: "123 Example Street",
        city: "Lagos",
      }),
    });
    const schoolData = await schoolRes.json();
    if (!schoolRes.ok) throw new Error(schoolData.message || "School creation failed");
    const schoolId = schoolData._id;
    console.log(`Test school created: ${schoolId}`);

    // 3. CREATE USER
    console.log("Creating test user...");
    const userRes = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: `Temp User ${Date.now()}`,
        email: `tempuser${Date.now()}@example.com`,
        password: "123456",
        role: "teacher",
      }),
    });
    const userData = await userRes.json();
    if (!userRes.ok) throw new Error(userData.message || "User creation failed");
    const userId = userData._id;
    console.log(`Test user created: ${userId}`);

    // 4. WAIT 1 MINUTE
    console.log("Waiting 1 minute before cleanup...");
    await new Promise((resolve) => setTimeout(resolve, 60000));

    // 5. DELETE USER
    console.log("Deleting test user...");
    const delUserRes = await fetch(`${baseUrl}/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`User delete status: ${delUserRes.status}`);

    // 6. DELETE SCHOOL
    console.log("Deleting test school...");
    const delSchoolRes = await fetch(`${baseUrl}/schools/${schoolId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`School delete status: ${delSchoolRes.status}`);

    console.log("All test data cleaned up successfully.");
  } catch (err) {
    console.error("Error during test:", err.message);
  }
}

run();
