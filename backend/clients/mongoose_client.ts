// src/config/database.ts
import mongoose, { ConnectOptions } from "mongoose";
import { logger } from "utils/logger";

// Connection options
const options: ConnectOptions = {
  autoIndex: true, // Build indexes
  maxPoolSize: 10, // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
};

// Connection state tracking
let isConnected = false;

export const connectToDatabase = async (): Promise<typeof mongoose> => {
  // If already connected, reuse the connection
  if (isConnected) {
    logger.info("Using existing database connection");
    return mongoose;
  }

  try {
    const db = await mongoose.connect(process.env.MONGODB_URI!, options);

    isConnected = db.connection.readyState === 1; // 1 = connected

    logger.info("MongoDB connected.");

    if (!mongoose.connection.listenerCount("error")) {
      mongoose.connection.on("error", (error) => {
        logger.error("MongoDB connection error:", error);
        isConnected = false;
      });
    }

    if (!mongoose.connection.listenerCount("disconnected")) {
      mongoose.connection.on("disconnected", () => {
        logger.warn("MongoDB disconnected");
        isConnected = false;
      });
    }

    return db;
  } catch (error) {
    logger.error("Error connecting to database:", error);
    throw error;
  }
};
