// backend/testData.js
import axios from "axios";

const API = "http://localhost:4000/api";

// SAFETY CHECK: Only run on staging
if (process.env.NODE_ENV !== "staging") {
  console.error("❌ This script is locked to staging. Set NODE_ENV=staging to run.");
  process.exit(1);
}

const admin = {
  name: "Global Super Admin",
  email: "hq@zinnol.com",
  password: "123456",
};

const testSchool = {
  name: "HQ Demo College",
  address: "123 Control Center Street",
};

const principalUser = {
  name: "Demo Principal",
  email: "principal@zinnol.com",
  password: "123456",
  role: "SCHOOL_ADMIN",
};

async function run() {
  let token;
  let schoolId;
  let userId;

  try {
    console.log("\n=== ZINNOL HQ AUTO TEST START ===");

    // 1. Register Global Super Admin (only once)
    console.log("\n[1] Registering Global Super Admin...");
    try {
      const res = await axios.post(`${API}/users`, admin);
      console.log("HQ admin registered:", res.data);
    } catch (err) {
      if (err.response?.status === 400) {
        console.log("HQ admin already exists. Skipping registration.");
      } else throw err;
    }

    // 2. Login as HQ admin
    console.log("\n[2] Logging in...");
    const loginRes = await axios.post(`${API}/users/login`, {
      email: admin.email,
      password: admin.password,
    });
    token = loginRes.data.token;
    const authHeader = { headers: { Authorization: `Bearer ${token}` } };
    console.log("Login successful. Token acquired.");

    // 3. Create a fake school
    console.log("\n[3] Creating test school...");
    const schoolRes = await axios.post(`${API}/schools`, testSchool, authHeader);
    schoolId = schoolRes.data._id || schoolRes.data.id;
    console.log("Test school created:", schoolId);

    // 4. Assign a Principal to that school
    console.log("\n[4] Creating test Principal...");
    const principalRes = await axios.post(`${API}/users/create`, { 
      ...principalUser, 
      schoolId 
    }, authHeader);
    userId = principalRes.data.user.id;
    console.log("Test Principal created:", userId);

    // 5. Fetch all users (HQ search ability)
    console.log("\n[5] Fetching all users...");
    const usersRes = await axios.get(`${API}/users`, authHeader);
    console.log("HQ user count:", usersRes.data.length);

    // 6. Toggle Principal active/inactive
    console.log(`\n[6] Toggling Principal (${userId}) active state...`);
    const toggleRes = await axios.patch(`${API}/users/${userId}/active`, {}, authHeader);
    console.log("Principal status toggled:", toggleRes.data);

    // === Schedule Cleanup after 12 hours ===
    console.log("\n[7] Scheduling auto-cleanup in 12 hours...");
    setTimeout(async () => {
      try {
        console.log("\n[HQ CLEANUP] Removing test user...");
        await axios.delete(`${API}/users/${userId}`, authHeader);

        console.log("[HQ CLEANUP] Removing test school...");
        await axios.delete(`${API}/schools/${schoolId}`, authHeader);

        console.log("[HQ CLEANUP] All test data removed!");
      } catch (cleanupErr) {
        console.error("[HQ CLEANUP ERROR]:", cleanupErr.response?.data || cleanupErr.message);
      }
    }, 43_200_000); // 12 hours

    console.log("\n=== HQ AUTO TEST SCRIPT COMPLETED (Cleanup pending in 12h) ===");
  } catch (error) {
    console.error("ERROR:", error.response?.data || error.message);
  }
}

run();
