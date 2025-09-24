import mongoose from "mongoose";
import { DatabaseError } from "../utils/AppError.js";

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("✗ Error: MONGODB_URI environment variable not set");
    throw new DatabaseError("Database configuration error: MONGODB_URI not set");
  }

  try {
    // Set mongoose options for better error handling
    const conn = await mongoose.connect(mongoUri, {
      // Connection options for Mongoose 8.x
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      // Log connection errors but avoid throwing from an event handler which can create unhandled rejections.
      console.error('MongoDB connection error:', err);
      // In production we may want stricter behavior, but in development just log the error.
      if (process.env.NODE_ENV === 'production') {
        throw new DatabaseError('Database connection error', err);
      }
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error(`✗ Database Connection Error: ${error.message}`);
    throw new DatabaseError(`Failed to connect to database: ${error.message}`, error);
  }
};

export default connectDB;
