// Minimal googleapis mock to avoid network/auth and timers
import { vi } from 'vitest';

export const google = {
    auth: {
        GoogleAuth: class {
            constructor() { }
            getClient = async () => ({})
        },
        OAuth2: class {
            constructor() { }
            setCredentials() { }
            revokeCredentials() { return Promise.resolve(); }
            getAccessToken() { return Promise.resolve({ token: 'test' }); }
        },
    },
    drive: () => ({
        files: {
            create: vi.fn().mockResolvedValue({ data: { id: 'mock-file' } }),
            get: vi.fn().mockResolvedValue({ data: {} }),
            list: vi.fn().mockResolvedValue({ data: { files: [] } }),
            update: vi.fn().mockResolvedValue({ data: {} }),
            delete: vi.fn().mockResolvedValue({ data: {} }),
            export: vi.fn().mockResolvedValue({ data: {} }),
        },
        permissions: {
            create: vi.fn().mockResolvedValue({ data: {} }),
        },
    }),
};

export default { google };
