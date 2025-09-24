import { weatherClient, ocrClient, firebaseClient, httpClient } from '../../../utils/httpClient.js';

describe('httpClient exported instances', () => {
    test('instances are constructed with serviceName', () => {
        // These are constructed at import time; just verify they expose methods
        expect(typeof httpClient.get).toBe('function');
        expect(typeof weatherClient.get).toBe('function');
        expect(typeof ocrClient.get).toBe('function');
        expect(typeof firebaseClient.get).toBe('function');
    });
});
