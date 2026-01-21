/**
 * Utilities for working with BigInt amounts in Bison SDK
 *
 * All monetary amounts in Bison are represented in µUSDC (micro-USDC).
 * 1 USDC = 1,000,000 µUSDC
 */

/**
 * Convert USDC to µUSDC (micro-USDC)
 * @param usdc Amount in USDC (e.g., "1.5" for 1.5 USDC)
 * @returns Amount in µUSDC as BigInt
 *
 * @example
 * usdcToUusdc("1.5") // Returns 1500000n
 * usdcToUusdc(1.5)   // Returns 1500000n
 */
export function usdcToUusdc(usdc: string | number): bigint {
  if (typeof usdc === 'number') {
    return BigInt(Math.floor(usdc * 1_000_000));
  }
  // Handle decimal strings
  const parts = usdc.split('.');
  const wholePart = BigInt(parts[0] ?? '0') * 1_000_000n;
  if (parts.length === 1) {
    return wholePart;
  }
  // Pad decimal part to 6 digits
  const decimalPart = (parts[1] ?? '').padEnd(6, '0').slice(0, 6);
  return wholePart + BigInt(decimalPart);
}

/**
 * Convert µUSDC (micro-USDC) to USDC
 * @param uusdc Amount in µUSDC as BigInt or string
 * @returns Amount in USDC as a decimal string
 *
 * @example
 * uusdcToUsdc(1500000n) // Returns "1.500000"
 * uusdcToUsdc("1500000") // Returns "1.500000"
 */
export function uusdcToUsdc(uusdc: bigint | string): string {
  const amount = typeof uusdc === 'string' ? BigInt(uusdc) : uusdc;
  const wholePart = amount / 1_000_000n;
  const decimalPart = (amount % 1_000_000n).toString().padStart(6, '0');
  return `${String(wholePart)}.${decimalPart}`;
}

/**
 * Parse a value that might be a number, string, or bigint into a BigInt
 * @param value Value to parse
 * @returns Parsed BigInt value
 *
 * @example
 * parseBigInt(100) // Returns 100n
 * parseBigInt("100") // Returns 100n
 * parseBigInt(100n) // Returns 100n
 */
export function parseBigInt(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`Cannot convert non-integer number ${String(value)} to BigInt`);
    }
    return BigInt(value);
  }
  try {
    return BigInt(value);
  } catch {
    throw new Error(`Invalid BigInt value: ${value}`);
  }
}

/**
 * Parse API responses that have stringified BigInt values
 * Recursively converts string values that look like BigInts back to BigInt
 *
 * @param obj Object with stringified BigInt values
 * @param fields Array of field names that should be converted to BigInt
 * @returns Object with BigInt values
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
export function parseBigIntFields(obj: any, fields: string[]): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => parseBigIntFields(item, fields)) as any;
  }

  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (fields.includes(key) && typeof value === 'string' && /^\d+$/.test(value)) {
        result[key] = BigInt(value);
      } else if (typeof value === 'object') {
        result[key] = parseBigIntFields(value, fields);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return obj;
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */

/**
 * Format µUSDC amount for display as USDC
 * @param uusdc Amount in µUSDC as BigInt, string, or number
 * @param decimals Number of decimal places to show (default: 2)
 * @returns Formatted USDC string (e.g., "1.50")
 *
 * @example
 * formatUusdcDisplay(1500000n) // Returns "1.50"
 * formatUusdcDisplay("1500000", 6) // Returns "1.500000"
 */
export function formatUusdcDisplay(uusdc: bigint | string | number, decimals = 2): string {
  const amount =
    typeof uusdc === 'string' ? BigInt(uusdc) : typeof uusdc === 'number' ? BigInt(uusdc) : uusdc;
  const usdc = Number(amount) / 1_000_000;
  return usdc.toFixed(decimals);
}

/**
 * Common field names that contain BigInt values in Bison API responses
 */

/**
 * Converts a fixed-point string to a scaled bigint quantity.
 * @param fixedPoint - The fixed-point string (e.g., "10.50" or "10")
 * @param precision - The contract precision (0-2 decimal places)
 * @returns The scaled quantity as bigint (e.g., 1050n for "10.50" with precision 2)
 *
 * @example
 * fixedPointToQuantity("10.50", 2) // Returns 1050n
 * fixedPointToQuantity("10", 0)    // Returns 10n
 */
export function fixedPointToQuantity(fixedPoint: string, precision: number): bigint {
  const trimmed = fixedPoint.trim();
  const parts = trimmed.split('.');
  const wholePart = parts[0] ?? '0';
  const fractionalPart = parts[1] ?? '0';
  const multiplier = BigInt(10 ** precision);

  // Truncate or pad fractional part to match precision
  const truncatedFractional = fractionalPart.slice(0, precision).padEnd(precision, '0');

  return BigInt(wholePart) * multiplier + BigInt(truncatedFractional);
}

/**
 * Converts a scaled bigint quantity to a fixed-point string.
 * Per Kalshi docs, fixed-point strings always emit 2 decimal places.
 * @param quantity - The scaled quantity as bigint (e.g., 1050n for 10.50 contracts with precision 2)
 * @param precision - The contract precision (0-2 decimal places)
 * @returns The fixed-point string (e.g., "10.50")
 *
 * @example
 * quantityToFixedPoint(1050n, 2) // Returns "10.50"
 * quantityToFixedPoint(10n, 0)   // Returns "10.00"
 */
export function quantityToFixedPoint(quantity: bigint, precision: number): string {
  const divisor = BigInt(10 ** precision);
  const wholePart = quantity / divisor;
  const fractionalPart = quantity % divisor;

  // Always emit 2 decimal places as per Kalshi spec
  const fractionalStr = fractionalPart.toString().padStart(precision, '0');
  const paddedFractional = fractionalStr.padEnd(2, '0');

  return `${wholePart.toString()}.${paddedFractional}`;
}

export const BIGINT_FIELDS = [
  'uusdcAmount',
  'newBalanceUusdc',
  'priceUusdc',
  'number',
  'requestedQuantity',
  'filledQuantity',
  'filledUusdc',
  'amountUusdc',
  'claimedAmountUusdc',
  'remainingUusdc',
  'depositedBalanceUusdc',
  'totalPending',
  'totalFillLocked',
  'totalUnclaimed',
  'totalAvailableUnclaimed',
  'pendingFeesUusdc',
  'lockedFeesUusdc',
  'unclaimedFeesUusdc',
  'grossFeeBps',
  'grossBaseFeeUusdc',
  'bisonFeeCutBps',
  'maxWithdrawAmount',
  'quantity',
  'payoutUusdc',
  'totalUusdc',
  'feeUusdc',
  'totalDeposits',
  'totalWithdrawals',
  'realizedPnl',
  'unrealizedPnl',
  'netPnl',
  'totalFeesPaid',
];
