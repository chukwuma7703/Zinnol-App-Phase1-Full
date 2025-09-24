// Vitest mock for Socket.IO module used across the app
import { vi } from 'vitest';

export const initSocket = vi.fn();
export const closeSocket = vi.fn();

// Allow tests to override what getIO returns
export const getIO = vi.fn(() => ({
    to: vi.fn(() => ({ emit: vi.fn() })),
}));

export default { initSocket, getIO, closeSocket };
