/**
 * Simple test to verify Jest setup
 */

describe('Jest Setup', () => {
  it('should run a simple test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle async tests', async () => {
    const promise = Promise.resolve('test');
    const result = await promise;
    expect(result).toBe('test');
  });

  it('should have test environment set', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});