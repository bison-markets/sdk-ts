# Bison TS SDK

[![npm version](https://badge.fury.io/js/@bison-markets%2Fsdk-ts.svg)](https://badge.fury.io/js/@bison-markets%2Fsdk-ts)

TypeScript SDK for [Bison](https://bison.markets/).

## Installation

```bash
npm install @bison-markets/sdk-ts
```

**Requirements:**

- Node.js >= 22 (for native WebSocket support)
- All modern browsers

## Usage

More information can be found at the [SDK Docs](https://docs.bison.markets/sdks/introduction)

```typescript
import { createBisonClient } from '@bison-markets/sdk-ts';
import { createWalletClient, createPublicClient, http, custom } from 'viem';
import { base } from 'viem/chains';

// Create a client instance
const client = createBisonClient({
  baseUrl: 'https://api.bison.markets',
});

// Create a wallet client for signing transactions
const walletClient = createWalletClient({
  chain: base,
  transport: custom(window.ethereum!),
});

// Create a public client for reading blockchain state
const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

// Deposit 100 USDC into the vault (100 * 10^6 µUSDC)
const txHash = await client.executeDepositFlow({
  walletClient,
  publicClient,
  userAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  chain: 'base', // Addresses are auto-resolved from /info endpoint
  amountUusdc: '100000000', // 100 USDC
});

console.log('Deposited! Transaction:', txHash);

// Place a limit order for 10.5 contracts (1050 ccontracts) at $0.75
await client.placeOrder({
  chain: 'base',
  marketId: 'PRES-2024',
  ccontracts: '1050', // 10.5 contracts * 100
  priceUusdc: '750000',
  action: 'buy',
  side: 'yes',
  userAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  signature: '0x...',
  expiry: 1234567890,
});

// Start listening for account events
const disconnect = client.listen('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', (event) => {
  if (event.type === 'usdc_deposited') {
    console.log('USDC deposit confirmed:', BigInt(event.uusdcAmount) / 1_000_000n, 'USDC');
  } else if (event.type === 'order_filled') {
    console.log('Order filled:', event.orderId);
  }
});

// Clean up when done
disconnect();
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development mode (watch)
npm run dev

# Generate API types from OpenAPI spec
OPENAPI_URL=... npm run generate:openapi

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint and format
npm run lint
npm run format

# Type check
npm run typecheck
```
