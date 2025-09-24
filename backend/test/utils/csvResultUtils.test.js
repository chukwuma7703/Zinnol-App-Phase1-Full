import { vi, describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import csv from 'csv-parser';
import { Parser } from 'json2csv';

vi.mock('fs', () => ({
    default: {
        createReadStream: vi.fn()
    }
}));
vi.mock('csv-parser', () => ({
    default: vi.fn(() => vi.fn())
}));
vi.mock('json2csv', () => ({
    Parser: vi.fn()
}));
import { parseCsvFile, convertToCsv } from '../../utils/csvResultUtils.js';

describe('CSV Result Utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('parseCsvFile', () => {
        it('should parse CSV file and return array of objects', async () => {
            const mockFilePath = '/path/to/results.csv';
            const mockData = [
                { studentId: '123', subject: 'Math', score: '85' },
                { studentId: '124', subject: 'English', score: '92' }
            ];

            // Mock fs.createReadStream
            const mockStream = {
                pipe: vi.fn().mockReturnThis(),
                on: vi.fn()
            };
            fs.createReadStream.mockReturnValue(mockStream);

            // Mock csv parser
            const mockCsvParser = vi.fn();
            csv.mockReturnValue(mockCsvParser);

            // Setup event handlers
            mockStream.on.mockImplementation((event, callback) => {
                if (event === 'data') {
                    mockData.forEach(callback);
                } else if (event === 'end') {
                    callback();
                }
                return mockStream;
            });

            const result = await parseCsvFile(mockFilePath);

            expect(fs.createReadStream).toHaveBeenCalledWith(mockFilePath);
            expect(mockStream.pipe).toHaveBeenCalledWith(mockCsvParser);
            expect(result).toEqual(mockData);
        });

        it('should reject on file read error', async () => {
            const mockFilePath = '/path/to/results.csv';
            const mockError = new Error('File not found');

            const mockStream = {
                pipe: vi.fn().mockReturnThis(),
                on: vi.fn()
            };
            fs.createReadStream.mockReturnValue(mockStream);

            mockStream.on.mockImplementation((event, callback) => {
                if (event === 'error') {
                    callback(mockError);
                }
                return mockStream;
            });

            await expect(parseCsvFile(mockFilePath)).rejects.toThrow('File not found');
        });
    });

    describe('convertToCsv', () => {
        it('should convert result data to CSV string', () => {
            const mockData = [
                { studentId: '123', subject: 'Math', score: 85, grade: 'A' },
                { studentId: '124', subject: 'English', score: 92, grade: 'A+' }
            ];
            const fields = ['studentId', 'subject', 'score', 'grade'];
            const expectedCsv = 'studentId,subject,score,grade\n123,Math,85,A\n124,English,92,A+';

            // Mock Parser
            const mockParser = {
                parse: vi.fn().mockReturnValue(expectedCsv)
            };
            Parser.mockImplementation(() => mockParser);

            const result = convertToCsv(mockData, fields);

            expect(Parser).toHaveBeenCalledWith({ fields });
            expect(mockParser.parse).toHaveBeenCalledWith(mockData);
            expect(result).toBe(expectedCsv);
        });

        it('should handle empty result array', () => {
            const mockData = [];
            const expectedCsv = '';

            const mockParser = {
                parse: vi.fn().mockReturnValue(expectedCsv)
            };
            Parser.mockImplementation(() => mockParser);

            const result = convertToCsv(mockData);

            expect(result).toBe(expectedCsv);
        });
    });
});
