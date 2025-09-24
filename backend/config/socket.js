import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import { roles } from "../config/roles.js";

let io;

// In-memory counter for online users. For multi-server setups, a Redis-based counter would be better.
let onlineUsersCount = 0;

/**
 * Socket.IO authentication middleware.
 * This function runs for every new connecting client. It verifies the JWT
 * token sent by the client in the `auth` payload.
 */
const socketAuthMiddleware = async (socket, next) => {
  // The frontend sends the token in `socket.handshake.auth.token`.
  const token = socket.handshake.auth.token;

  if (!token) {
    // If no token is provided, reject the connection.
    // This will trigger a 'connect_error' event on the client.
    return next(new Error("Authentication error: No token provided."));
  }

  try {
    // Verify the access token using the same secret as your HTTP auth.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find the user from the database and attach it to the socket instance.
    // This makes the user's information available in all event handlers.
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return next(new Error("Authentication error: User not found."));
    }
    if (!user.isActive) {
      return next(new Error("Authentication error: Account is deactivated."));
    }

    socket.user = user; // Attach user to the socket for future use.
    next(); // Grant access.
  } catch (error) {
    console.error("Socket authentication failed:", error.message);
    return next(new Error("Authentication error: Invalid or expired token."));
  }
};

export function initSocket(server) {
  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Register the authentication middleware to run on every new connection, except in test env.
  if (process.env.NODE_ENV !== "test") {
    io.use(socketAuthMiddleware);
  }

  io.on("connection", (socket) => {
    onlineUsersCount++;
    // In a real app, socket.user might not exist in 'test' env without the middleware.
    // We log conditionally to avoid errors.
    console.log(`✅ Socket connected: ${socket.id}. User: ${socket.user?.name || 'N/A'}. Total online: ${onlineUsersCount}`);

    // Broadcast the new count to global admins.
    io.to('global-admins').emit('updateOnlineUsers', onlineUsersCount);

    // Automatically join a room based on the user's school ID.
    if (socket.user?.school) {
      const schoolRoom = `school-${socket.user.school.toString()}`;
      socket.join(schoolRoom);
      console.log(`Socket ${socket.id} joined school room: ${schoolRoom}`);
    }
    // Automatically join the global admin room if the user has the role.
    if (socket.user?.role === roles.GLOBAL_SUPER_ADMIN) {
      socket.join('global-admins');
      console.log(`Socket ${socket.id} joined global-admins room.`);
    }

    // Allow clients to join a specific exam room
    socket.on("joinExamRoom", (examId) => {
      if (examId) {
        const roomName = `exam-${examId}`;
        socket.join(roomName);
        console.log(`Socket ${socket.id} joined exam room: ${roomName}`);
      }
    });

    socket.on("disconnect", () => {
      onlineUsersCount--;
      console.log(`🔌 Socket disconnected: ${socket.id}. Total online: ${onlineUsersCount}`);
      // Broadcast the updated count to global admins.
      io.to('global-admins').emit('updateOnlineUsers', onlineUsersCount);
    });
  });
  return io;
}

export function getIO() {
  if (!io) {
    throw new Error("Socket.IO not initialized!");
  }
  return io;
}

/**
 * Gets the current count of online users.
 * This function was likely removed but is still being imported elsewhere.
 * @returns {number} The number of currently connected users.
 */
export function getOnlineUserCount() {
  return onlineUsersCount;
}


/**
 * Closes the Socket.IO server connection.
 * This is crucial for allowing Jest tests to exit gracefully.
 */
export function closeSocket() {
  if (io) {
    io.close();
    io = null;
  }
}
