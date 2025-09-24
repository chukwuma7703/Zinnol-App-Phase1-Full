// Vitest mock for nodemailer used in unit tests
import { vi } from 'vitest';

export const createTransport = vi.fn(() => ({
    sendMail: vi.fn(),
}));

export default { createTransport };
