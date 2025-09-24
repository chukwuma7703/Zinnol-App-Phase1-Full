import { vi, describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Search Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchCodebase', () => {
    it('should find query in matching files', async () => {
      const { searchCodebase } = await import('../../utils/searchUtils.js');

      const mockQuery = 'testQuery';
      const mockRootDir = '/mock/root';
      const mockFiles = [
        { path: '/mock/root/file1.js', content: 'This contains testQuery in javascript' },
        { path: '/mock/root/file2.md', content: 'This is a markdown file with testQuery' },
        { path: '/mock/root/file3.json', content: 'This JSON has testQuery too' },
        { path: '/mock/root/file4.txt', content: 'This text file does not have the query' }
      ];

      // Mock path.resolve
      vi.spyOn(path, 'resolve').mockReturnValue(mockRootDir);

      // Mock fs.readdirSync to return our mock files
      vi.spyOn(fs, 'readdirSync').mockImplementation((dir) => {
        if (dir === mockRootDir) {
          return ['file1.js', 'file2.md', 'file3.json', 'file4.txt'];
        }
        return [];
      });

      // Mock fs.statSync to return file stats
      vi.spyOn(fs, 'statSync').mockImplementation((filePath) => ({
        isDirectory: () => false
      }));

      // Mock fs.readFileSync for each file
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const file = mockFiles.find(f => f.path === filePath);
        return file ? file.content : '';
      });

      const result = await searchCodebase(mockQuery);

      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('file', '/mock/root/file1.js');
      expect(result[0]).toHaveProperty('snippet');
      expect(result[0].snippet).toContain('testQuery');
      expect(result[1]).toHaveProperty('file', '/mock/root/file2.md');
      expect(result[2]).toHaveProperty('file', '/mock/root/file3.json');
    });

    it('should handle case insensitive search', async () => {
      const { searchCodebase } = await import('../../utils/searchUtils.js');

      const mockQuery = 'TestQuery';
      const mockRootDir = '/mock/root';
      const mockFile = { path: '/mock/root/file.js', content: 'This contains testquery in lowercase' };

      vi.spyOn(path, 'resolve').mockReturnValue(mockRootDir);
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['file.js']);
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false });
      vi.spyOn(fs, 'readFileSync').mockReturnValue(mockFile.content);

      const result = await searchCodebase(mockQuery);

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe('/mock/root/file.js');
    });

    it('should skip directories', async () => {
      const { searchCodebase } = await import('../../utils/searchUtils.js');

      const mockQuery = 'test';
      const mockRootDir = '/mock/root';

      vi.spyOn(path, 'resolve').mockReturnValue(mockRootDir);
      vi.spyOn(fs, 'readdirSync').mockImplementation((dir) => {
        if (dir === mockRootDir) {
          return ['subdir', 'file.js'];
        }
        // If it tries to read the subdir, return empty to prevent infinite recursion
        return [];
      });
      vi.spyOn(fs, 'statSync').mockImplementation((filePath) => ({
        isDirectory: () => filePath.endsWith('subdir')
      }));
      vi.spyOn(fs, 'readFileSync').mockReturnValue('content with test');

      const result = await searchCodebase(mockQuery);

      // Should not try to read the directory as a file
      expect(fs.readFileSync).toHaveBeenCalledWith('/mock/root/file.js', 'utf8');
      expect(fs.readFileSync).not.toHaveBeenCalledWith('/mock/root/subdir', 'utf8');
    });

    it('should only search files with supported extensions', async () => {
      const { searchCodebase } = await import('../../utils/searchUtils.js');

      const mockQuery = 'test';
      const mockRootDir = '/mock/root';

      vi.spyOn(path, 'resolve').mockReturnValue(mockRootDir);
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['file.js', 'file.jsx', 'file.md', 'file.json', 'file.txt', 'file.py']);
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false });
      vi.spyOn(fs, 'readFileSync').mockReturnValue('content with test');

      const result = await searchCodebase(mockQuery);

      // Should only search .js, .jsx, .md, .json files
      expect(result).toHaveLength(4);
      expect(fs.readFileSync).toHaveBeenCalledTimes(4);
      expect(fs.readFileSync).not.toHaveBeenCalledWith('/mock/root/file.txt', 'utf8');
      expect(fs.readFileSync).not.toHaveBeenCalledWith('/mock/root/file.py', 'utf8');
    });

    it('should extract proper snippets around the query', async () => {
      const { searchCodebase } = await import('../../utils/searchUtils.js');

      const mockQuery = 'specific';
      const mockRootDir = '/mock/root';
      const longContent = 'This is a very long piece of content that contains the specific word we are looking for and some more text after it.';

      vi.spyOn(path, 'resolve').mockReturnValue(mockRootDir);
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['file.js']);
      vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false });
      vi.spyOn(fs, 'readFileSync').mockReturnValue(longContent);

      const result = await searchCodebase(mockQuery);

      expect(result).toHaveLength(1);
      expect(result[0].snippet).toContain('specific');
      expect(result[0].snippet.length).toBeLessThanOrEqual(80 + mockQuery.length); // 40 chars before + query + 40 chars after
    });

    it('should return empty array when no matches found', async () => {
      const { searchCodebase } = await import('../../utils/searchUtils.js');

      const mockQuery = 'nonexistentQuery';
      const mockRootDir = '/mock/root';
      const mockFiles = [
        { path: '/mock/root/file1.js', content: 'This contains some content' },
        { path: '/mock/root/file2.md', content: 'This is a markdown file' }
      ];

      // Mock path.resolve
      vi.spyOn(path, 'resolve').mockReturnValue(mockRootDir);

      // Mock fs.readdirSync
      vi.spyOn(fs, 'readdirSync').mockImplementation((dir) => {
        if (dir === mockRootDir) {
          return ['file1.js', 'file2.md'];
        }
        return [];
      });

      // Mock fs.statSync
      vi.spyOn(fs, 'statSync').mockImplementation((filePath) => ({
        isDirectory: () => false
      }));

      // Mock fs.readFileSync
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const file = mockFiles.find(f => f.path === filePath);
        return file ? file.content : '';
      });

      const result = await searchCodebase(mockQuery);

      expect(result).toEqual([]);
    });

    it('should handle recursive directory traversal', async () => {
      const { searchCodebase } = await import('../../utils/searchUtils.js');

      const mockQuery = 'test';
      const mockRootDir = '/mock/root';

      vi.spyOn(path, 'resolve').mockReturnValue(mockRootDir);
      vi.spyOn(fs, 'readdirSync').mockImplementation((dir) => {
        if (dir === mockRootDir) return ['subdir'];
        if (dir === path.join(mockRootDir, 'subdir')) return ['nested.js'];
        return [];
      });

      vi.spyOn(fs, 'statSync').mockImplementation((filePath) => ({
        isDirectory: () => !filePath.endsWith('.js')
      }));

      vi.spyOn(fs, 'readFileSync').mockReturnValue('content with test');

      const result = await searchCodebase(mockQuery);

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe(path.join(mockRootDir, 'subdir', 'nested.js'));
    });
  });
});
