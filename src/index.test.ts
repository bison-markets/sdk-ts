import { describe, expect, it } from 'vitest';
import { createBisonClient } from './client';
import { PublicClient, WalletClient } from 'viem';

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

describe('BisonClient dev methods', () => {
  it('getDevAccountFees throws without devFlags', async () => {
    const client = createBisonClient({ baseUrl: 'http://localhost:8787' });
    await expect(client.getDevAccountFees()).rejects.toThrow('devFlags required');
  });

  it('getDevAccountInfo throws without devFlags', async () => {
    const client = createBisonClient({ baseUrl: 'http://localhost:8787' });
    await expect(client.getDevAccountInfo()).rejects.toThrow('devFlags required');
  });

  it('getFeeClaimAuthorization throws without devFlags', async () => {
    const client = createBisonClient({ baseUrl: 'http://localhost:8787' });
    await expect(client.getFeeClaimAuthorization()).rejects.toThrow('devFlags required');
  });

  it('claimDevFees throws without devFlags', async () => {
    const client = createBisonClient({ baseUrl: 'http://localhost:8787' });
    await expect(
      client.claimDevFees({
        walletClient: {} as unknown as WalletClient,
        publicClient: {} as unknown as PublicClient,
      }),
    ).rejects.toThrow('devFlags required');
  });

  it('creates client with devFlags', () => {
    const client = createBisonClient({
      baseUrl: 'http://localhost:8787',
      devFlags: {
        privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        devAccountId: 'test-dev',
      },
    });
    expect(client).toBeDefined();
  });
});
