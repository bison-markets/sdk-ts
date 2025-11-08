import { describe, expect, it } from 'vitest';
import { createBisonClient } from './client';

describe('BisonClient', () => {
  it('should create a client with the correct base URL', () => {
    const client = createBisonClient({ baseUrl: 'http://localhost:8787' });
    expect(client).toBeDefined();
  });

  it('should have a listen method', () => {
    const client = createBisonClient({ baseUrl: 'http://localhost:8787' });
    expect(typeof client.listen).toBe('function');
  });

  it('should return a disconnect function from listen', () => {
    const client = createBisonClient({ baseUrl: 'http://localhost:8787' });
    const disconnect = client.listen('0x1234567890123456789012345678901234567890', () => {});
    expect(disconnect).toBeTypeOf('function');
    disconnect();
  });
});
