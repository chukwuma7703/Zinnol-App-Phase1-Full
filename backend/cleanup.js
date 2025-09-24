import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import User from "./models/userModel.js";

// Correctly locate the .env file relative to this script's location
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

const clearUsers = async () => {
  try {
    await connectDB();
    const result = await User.deleteMany({});
    console.log(`✅ Successfully deleted ${result.deletedCount} users.`);
    console.log("You can now restart your server and register the first admin with a new, strong password.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error clearing users:", error);
    process.exit(1);
  }
};

clearUsers();