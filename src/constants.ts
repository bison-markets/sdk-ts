export const VAULT_ABI = [
  {
    name: 'depositUSDC',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'usdcAmount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'withdrawUSDC',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'usdcAmount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'mintPosition',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'uuid', type: 'string' },
      { name: 'marketId', type: 'string' },
      { name: 'yes', type: 'bool' },
      { name: 'number', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'burnMarketPosition',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'uuid', type: 'string' },
      { name: 'marketId', type: 'string' },
      { name: 'yes', type: 'bool' },
      { name: 'user', type: 'address' },
      { name: 'number', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'getPositionToken',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'marketId', type: 'string' },
      { name: 'yes', type: 'bool' },
    ],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'DOMAIN_SEPARATOR',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bytes32' }],
  },
] as const;

export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;
