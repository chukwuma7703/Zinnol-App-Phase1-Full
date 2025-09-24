// Increase Jest timeout for all tests in this file
jest.setTimeout(30000);
import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import http from "http";
import { io as Client } from "socket.io-client";

// Dynamically import the module to be tested
const { initSocket, getIO, closeSocket } = await import("./socket.js");

describe("Socket.IO Configuration", () => {
  let httpServer;
  let httpServerAddr;
  let clientSocket;

  beforeAll((done) => {
    httpServer = http.createServer();
    initSocket(httpServer); // Initialize our socket server
    httpServer.listen(() => {
      const port = httpServer.address().port;
      httpServerAddr = `http://localhost:${port}`;
      done();
    });
  });

  afterAll((done) => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    closeSocket();
    httpServer.close(done);
  });

  beforeEach((done) => {
    // Disconnect any existing client socket before each test
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    // Wait a bit for cleanup
    setTimeout(done, 100);
  });

  afterEach(() => {
    // Clean up after each test
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  it("should initialize and allow getting the IO instance", () => {
    const ioInstance = getIO();
    expect(ioInstance).toBeDefined();
  });

  it("should throw an error if getIO is called before initialization", () => {
    closeSocket(); // Ensure it's not initialized
    expect(() => getIO()).toThrow("Socket.IO not initialized!");
    // Re-initialize for other tests
    initSocket(httpServer);
  });

  it("should handle a new client connection", (done) => {
    const io = getIO();
    const connectionSpy = jest.fn();

    io.once("connection", (socket) => {
      connectionSpy();
      expect(connectionSpy).toHaveBeenCalled();
      socket.disconnect();
      done();
    });

    clientSocket = Client(httpServerAddr);
    clientSocket.on("connect", () => {
      // Connection established
    });

    // Timeout fallback
    setTimeout(() => {
      if (!connectionSpy.mock.calls.length) {
        done(new Error("Connection not established"));
      }
    }, 5000);
  });

  it("should handle a client disconnection", (done) => {
    clientSocket = Client(httpServerAddr);

    clientSocket.on("connect", () => {
      // Once connected, immediately disconnect
      clientSocket.disconnect();
    });

    clientSocket.on("disconnect", () => {
      // This confirms the client-side disconnect
      done();
    });

    // Timeout fallback
    setTimeout(() => {
      done(new Error("Disconnection not handled"));
    }, 5000);
  });

  it("should allow a client to join an exam-specific room", (done) => {
    const examId = "test-exam-456";
    let socketInstance;

    const io = getIO();
    io.once("connection", (socket) => {
      socketInstance = socket;
      clientSocket.emit("joinExamRoom", examId);

      setTimeout(() => {
        expect(socketInstance.rooms.has(`exam-${examId}`)).toBe(true);
        socketInstance.disconnect();
        done();
      }, 100);
    });

    clientSocket = Client(httpServerAddr);

    // Timeout fallback
    setTimeout(() => {
      done(new Error("Room join not handled"));
    }, 5000);
  });

  it("should not join an exam room if examId is falsy", (done) => {
    let socketInstance;
    const joinSpy = jest.fn();

    const io = getIO();
    io.once("connection", (socket) => {
      socketInstance = socket;
      const originalJoin = socket.join.bind(socket);
      socket.join = joinSpy;

      clientSocket.emit("joinExamRoom", ""); // Falsy value

      setTimeout(() => {
        expect(joinSpy).not.toHaveBeenCalled();
        socketInstance.disconnect();
        done();
      }, 100);
    });

    clientSocket = Client(httpServerAddr);

    // Timeout fallback
    setTimeout(() => {
      done(new Error("Falsy examId not handled"));
    }, 5000);
  });
});