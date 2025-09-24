// Vitest mock for @sendgrid/mail used in unit tests
import { vi } from 'vitest';

export default {
    setApiKey: vi.fn(),
    send: vi.fn(),
};
