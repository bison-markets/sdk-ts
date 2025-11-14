import 'viem/window';
import { createBisonOAPIClient, OpenAPIPaths } from './openapi';
import type { WalletClient, PublicClient } from 'viem';
import { maxUint256 } from 'viem';
import { VAULT_ABI, ERC20_ABI } from './constants';

export interface BisonClientOptions {
  baseUrl: string;
}

export interface BisonOrderEvent {
  type: 'order_placed' | 'order_filled' | 'order_cancelled';
  orderId: string;
  marketId: string;
  action: 'buy' | 'sell';
  side: 'yes' | 'no';
  number: number;
  priceUusdc: number;
}

export interface BisonMarketEvent {
  type: 'market_settled' | 'market_closed' | 'market_opened';
  marketId: string;
  result?: 'yes' | 'no';
}

export interface BisonUSDCEvent {
  type: 'usdc_deposited' | 'usdc_withdrawn';
  userAddress: string;
  uusdcAmount: number;
}

export interface BisonPositionEvent {
  type: 'position_minted' | 'position_burned';
  userAddress: string;
  marketId: string;
  side: 'yes' | 'no';
  number: number;
}

export type BisonEvent = BisonOrderEvent | BisonMarketEvent | BisonUSDCEvent | BisonPositionEvent;

export type GetInfoResponse =
  OpenAPIPaths['/info']['get']['responses']['200']['content']['application/json'];

export type SupportedChain = keyof GetInfoResponse['chains'];

export type GetEventResponse =
  OpenAPIPaths['/get-event']['get']['responses']['200']['content']['application/json'];

export type GetEventMetadataResponse =
  OpenAPIPaths['/get-event-metadata']['get']['responses']['200']['content']['application/json'];

export type GetTokenAuthorizationRequest = NonNullable<
  OpenAPIPaths['/get-token-authorization']['post']['requestBody']
>['content']['application/json'];

export type GetTokenAuthorizationResponse =
  OpenAPIPaths['/get-token-authorization']['post']['responses']['200']['content']['application/json'];

export type GetWithdrawAuthorizationRequest = NonNullable<
  OpenAPIPaths['/get-withdraw-authorization']['post']['requestBody']
>['content']['application/json'];

export type GetWithdrawAuthorizationResponse =
  OpenAPIPaths['/get-withdraw-authorization']['post']['responses']['200']['content']['application/json'];

export type PlaceOrderRequest = NonNullable<
  OpenAPIPaths['/kalshi/order/limit']['post']['requestBody']
>['content']['application/json'];

export type PlaceOrderResponse =
  OpenAPIPaths['/kalshi/order/limit']['post']['responses']['200']['content']['application/json'];

export type GetDepositedUsdcBalanceResponse =
  OpenAPIPaths['/deposited-balance']['get']['responses']['200']['content']['application/json'];

export type GetUserOrdersResponse =
  OpenAPIPaths['/kalshi/orders']['get']['responses']['200']['content']['application/json'];

export type GetUserPositionsResponse =
  OpenAPIPaths['/kalshi/positions']['get']['responses']['200']['content']['application/json'];

export type GetCreatedTokensResponse =
  OpenAPIPaths['/created-tokens']['get']['responses']['200']['content']['application/json'];

export interface ChainInfo {
  vaultAddress: `0x${string}`;
  usdcAddress: `0x${string}`;
  rpcUrl: string;
  chainId: number;
}

export interface KalshiTickerUpdate {
  market_ticker: string;
  yes_bid_uusdc?: number;
  yes_ask_uusdc?: number;
  no_bid_uusdc?: number;
  no_ask_uusdc?: number;
  last_price_uusdc?: number;
  volume?: number;
  open_interest?: number;
}

// Module-level cache for /info responses, keyed by baseUrl
const infoCache = new Map<string, GetInfoResponse>();

export class BisonClient {
  private readonly client: ReturnType<typeof createBisonOAPIClient>;
  private readonly baseUrl: string;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private shouldReconnect = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;

  private eventWs: WebSocket | null = null;
  private eventReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private eventHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private shouldReconnectEvent = false;
  private eventReconnectAttempts = 0;

  constructor(options: BisonClientOptions) {
    this.baseUrl = options.baseUrl;
    this.client = createBisonOAPIClient(options.baseUrl);
  }

  private async getChainInfo(chain: SupportedChain): Promise<ChainInfo> {
    if (!infoCache.has(this.baseUrl)) {
      const info = await this.getInfo();
      infoCache.set(this.baseUrl, info);
    }

    const info = infoCache.get(this.baseUrl);
    if (!info) {
      throw new Error('Failed to retrieve chain info from cache');
    }

    return info.chains[chain] as ChainInfo;
  }

  async getTokenAuthorization(
    options: GetTokenAuthorizationRequest,
  ): Promise<GetTokenAuthorizationResponse> {
    const { data, error } = await this.client.POST('/get-token-authorization', {
      body: options,
    });

    if (error) {
      const errorMsg = (error as { error?: string }).error ?? 'Failed to get token authorization';
      throw new Error(errorMsg);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getTokenAuthorization');
    }

    return data;
  }

  async getWithdrawAuthorization(
    options: GetWithdrawAuthorizationRequest,
  ): Promise<GetWithdrawAuthorizationResponse> {
    const { data, error } = await this.client.POST('/get-withdraw-authorization', {
      body: options,
    });

    if (typeof error !== 'undefined') {
      const errorMsg =
        (error as { error?: string }).error ?? 'Failed to get withdraw authorization';
      throw new Error(errorMsg);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getWithdrawAuthorization');
    }

    return data;
  }

  async placeOrder(options: PlaceOrderRequest): Promise<PlaceOrderResponse> {
    const { data, error } = await this.client.POST('/kalshi/order/limit', {
      body: options,
    });

    if (error) {
      const errorMsg = (error as { error?: string }).error ?? 'Failed to place order';
      throw new Error(errorMsg);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from placeOrder');
    }

    return data;
  }

  async getEvent(eventTicker: string): Promise<GetEventResponse> {
    const { data, error } = await this.client.GET('/get-event', {
      params: {
        query: { event_ticker: eventTicker },
      },
    });

    if (error?.error) {
      throw new Error((error as { error?: string }).error ?? 'Failed to get event');
    } else if (!data) {
      throw new Error('No data returned from getEvent');
    }

    return data;
  }

  async getEventMetadata(eventTicker: string): Promise<GetEventMetadataResponse> {
    const { data, error } = await this.client.GET('/get-event-metadata', {
      params: {
        query: { event_ticker: eventTicker },
      },
    });

    if (error) {
      const errorMsg = (error as { error?: string }).error ?? 'Failed to get event metadata';
      throw new Error(errorMsg);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getEventMetadata');
    }

    return data;
  }

  async getInfo(): Promise<GetInfoResponse> {
    const { data, error } = await this.client.GET('/info');

    if (typeof error !== 'undefined') {
      throw new Error('Failed to get system info: ', error);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getInfo');
    }

    return data;
  }

  async getDepositedUsdcBalance(userAddress: string): Promise<GetDepositedUsdcBalanceResponse> {
    const { data, error } = await this.client.GET('/deposited-balance', {
      params: {
        query: { userAddress },
      },
    });

    if (error?.error) {
      throw new Error('Failed to get deposited USDC balance');
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getDepositedUsdcBalance');
    }

    return data;
  }

  async getUserOrders(userId: string): Promise<GetUserOrdersResponse> {
    const { data, error } = await this.client.GET('/kalshi/orders', {
      params: {
        query: { userId },
      },
    });

    if (error?.error) {
      throw new Error((error as { error?: string }).error ?? 'Failed to get user orders');
    } else if (!data) {
      throw new Error('No data returned from getUserOrders');
    }

    return data;
  }

  async getUserPositions(userId: string): Promise<GetUserPositionsResponse> {
    const { data, error } = await this.client.GET('/kalshi/positions', {
      params: {
        query: { userId },
      },
    });

    if (error?.error) {
      throw new Error((error as { error?: string }).error ?? 'Failed to get user positions');
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getUserPositions');
    }

    return data;
  }

  async getCreatedTokens(chain?: SupportedChain): Promise<GetCreatedTokensResponse> {
    const { data, error } = await this.client.GET(
      '/created-tokens',
      chain ? { params: { query: { chain } } } : {},
    );

    if (typeof error !== 'undefined') {
      throw new Error('Failed to get created tokens: ', error);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getCreatedTokens');
    }

    return data;
  }

  listen(
    userAddress: string,
    onEvent: (event: BisonEvent) => void,
    options?: {
      onError?: (error: Error) => void;
      onConnect?: () => void;
      onDisconnect?: () => void;
      reconnect?: boolean;
    },
  ): () => void {
    this.shouldReconnect = options?.reconnect ?? true;
    this.reconnectAttempts = 0;

    const connect = () => {
      const wsUrl = `${this.baseUrl.replace(/^http/, 'ws')}/ws/evm/${userAddress}`;

      if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
        return;
      }

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        options?.onConnect?.();

        if (options?.reconnect !== false) {
          this.heartbeatTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 30000);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data: unknown = JSON.parse(String(event.data));
          if (
            data &&
            typeof data === 'object' &&
            'type' in data &&
            data.type !== 'ping' &&
            data.type !== 'pong'
          ) {
            onEvent(data as BisonEvent);
          }
        } catch (error) {
          options?.onError?.(error as Error);
        }
      };

      this.ws.onerror = () => {
        options?.onError?.(new Error('WebSocket error'));
      };

      this.ws.onclose = () => {
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }

        options?.onDisconnect?.();

        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);

          this.reconnectTimer = setTimeout(() => {
            connect();
          }, delay);
        }
      };
    };

    connect();

    return () => {
      this.shouldReconnect = false;

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }

      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    };
  }

  listenToKalshiEvent(
    eventTicker: string,
    onTicker: (update: KalshiTickerUpdate) => void,
    options?: {
      onError?: (error: Error) => void;
      onConnect?: () => void;
      onDisconnect?: () => void;
      reconnect?: boolean;
    },
  ): () => void {
    this.shouldReconnectEvent = options?.reconnect ?? true;
    this.eventReconnectAttempts = 0;

    const connect = () => {
      const wsUrl = `${this.baseUrl.replace(/^http/, 'ws')}/ws/kalshi/event/${eventTicker}`;

      if (
        this.eventWs?.readyState === WebSocket.OPEN ||
        this.eventWs?.readyState === WebSocket.CONNECTING
      ) {
        return;
      }

      this.eventWs = new WebSocket(wsUrl);

      this.eventWs.onopen = () => {
        this.eventReconnectAttempts = 0;
        options?.onConnect?.();

        if (options?.reconnect !== false) {
          this.eventHeartbeatTimer = setInterval(() => {
            if (this.eventWs?.readyState === WebSocket.OPEN) {
              this.eventWs.send(JSON.stringify({ type: 'ping' }));
            }
          }, 30000);
        }
      };

      this.eventWs.onmessage = (event) => {
        try {
          const data: unknown = JSON.parse(String(event.data));
          if (data && typeof data === 'object' && 'market_ticker' in data) {
            onTicker(data as KalshiTickerUpdate);
          }
        } catch (error) {
          options?.onError?.(error as Error);
        }
      };

      this.eventWs.onerror = () => {
        options?.onError?.(new Error('WebSocket error'));
      };

      this.eventWs.onclose = () => {
        if (this.eventHeartbeatTimer) {
          clearInterval(this.eventHeartbeatTimer);
          this.eventHeartbeatTimer = null;
        }

        options?.onDisconnect?.();

        if (this.shouldReconnectEvent && this.eventReconnectAttempts < this.maxReconnectAttempts) {
          this.eventReconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.eventReconnectAttempts - 1), 30000);

          this.eventReconnectTimer = setTimeout(() => {
            connect();
          }, delay);
        }
      };
    };

    connect();

    return () => {
      this.shouldReconnectEvent = false;

      if (this.eventReconnectTimer) {
        clearTimeout(this.eventReconnectTimer);
        this.eventReconnectTimer = null;
      }

      if (this.eventHeartbeatTimer) {
        clearInterval(this.eventHeartbeatTimer);
        this.eventHeartbeatTimer = null;
      }

      if (this.eventWs) {
        this.eventWs.close();
        this.eventWs = null;
      }
    };
  }

  async executeBuyFlow(params: {
    walletClient: WalletClient;
    publicClient: PublicClient;
    userAddress: `0x${string}`;
    chain: SupportedChain;
    marketId: string;
    side: 'yes' | 'no';
    number: number;
    priceUusdc: number;
    onEvent?: (event: BisonEvent) => void;
    onError?: (error: Error) => void;
  }): Promise<{ disconnect: () => void; txHash: `0x${string}` | null }> {
    const {
      walletClient,
      userAddress,
      chain,
      marketId,
      side,
      number,
      priceUusdc,
      onEvent,
      onError,
    } = params;

    const vaultAddress = (await this.getChainInfo(chain)).vaultAddress;

    const chainId = walletClient.chain?.id ?? 31337;
    const expiry = Math.floor(Date.now() / 1000) + 600;

    const domain = {
      name: 'BisonOrderAuth',
      version: '1',
      chainId,
      verifyingContract: vaultAddress,
    } as const;

    const types = {
      OrderAuthorization: [
        { name: 'marketId', type: 'string' },
        { name: 'action', type: 'string' },
        { name: 'side', type: 'string' },
        { name: 'number', type: 'uint256' },
        { name: 'priceUusdc', type: 'uint256' },
        { name: 'expiry', type: 'uint256' },
      ],
    } as const;

    const message = {
      marketId,
      action: 'buy',
      side,
      number: BigInt(number),
      priceUusdc: BigInt(priceUusdc),
      expiry: BigInt(expiry),
    };

    const signature = await walletClient.signTypedData({
      account: userAddress,
      domain,
      types,
      primaryType: 'OrderAuthorization',
      message,
    });

    const orderResult = await this.placeOrder({
      chain: chain as 'base',
      marketId,
      number,
      priceUusdc: priceUusdc,
      action: 'buy',
      side,
      userAddress,
      signature,
      expiry,
    });

    console.log('Order placed:', orderResult);

    const disconnect = this.listen(
      userAddress,
      (event: BisonEvent) => {
        console.log('Buy flow event:', event);
        onEvent?.(event);
      },
      {
        ...(onError && { onError }),
        reconnect: true,
      },
    );

    return { disconnect, txHash: null };
  }

  async executeSellFlow(params: {
    walletClient: WalletClient;
    publicClient: PublicClient;
    userAddress: `0x${string}`;
    chain: SupportedChain;
    marketId: string;
    side: 'yes' | 'no';
    number: number;
    priceUusdc: number;
    onEvent?: (event: BisonEvent) => void;
    onError?: (error: Error) => void;
  }): Promise<{ disconnect: () => void; txHash: `0x${string}` | null }> {
    const {
      walletClient,
      userAddress,
      chain,
      marketId,
      side,
      number,
      priceUusdc,
      onEvent,
      onError,
    } = params;

    const vaultAddress = (await this.getChainInfo(chain)).vaultAddress;

    const chainId = walletClient.chain?.id ?? 31337;
    const expiry = Math.floor(Date.now() / 1000) + 600;

    const domain = {
      name: 'BisonOrderAuth',
      version: '1',
      chainId,
      verifyingContract: vaultAddress,
    } as const;

    const types = {
      OrderAuthorization: [
        { name: 'marketId', type: 'string' },
        { name: 'action', type: 'string' },
        { name: 'side', type: 'string' },
        { name: 'number', type: 'uint256' },
        { name: 'priceUusdc', type: 'uint256' },
        { name: 'expiry', type: 'uint256' },
      ],
    } as const;

    const message = {
      marketId,
      action: 'sell',
      side,
      number: BigInt(number),
      priceUusdc: BigInt(priceUusdc),
      expiry: BigInt(expiry),
    };

    const signature = await walletClient.signTypedData({
      account: userAddress,
      domain,
      types,
      primaryType: 'OrderAuthorization',
      message,
    });

    const orderResult = await this.placeOrder({
      chain: chain as 'base',
      marketId,
      number,
      priceUusdc: priceUusdc,
      action: 'sell',
      side,
      userAddress,
      signature,
      expiry,
    });

    console.log('Order placed:', orderResult);

    const disconnect = this.listen(
      userAddress,
      (event: BisonEvent) => {
        console.log('Sell flow event:', event);
        onEvent?.(event);
      },
      {
        ...(onError && { onError }),
        reconnect: true,
      },
    );

    return { disconnect, txHash: null };
  }

  async executeCancelOrderFlow(params: {
    walletClient: WalletClient;
    userAddress: `0x${string}`;
    chain: SupportedChain;
    orderId: string;
  }): Promise<void> {
    const { walletClient, userAddress, chain, orderId } = params;

    const vaultAddress = (await this.getChainInfo(chain)).vaultAddress;

    const chainId = walletClient.chain?.id ?? 31337;
    const expiry = Math.floor(Date.now() / 1000) + 600;

    const domain = {
      name: 'BisonOrderAuth',
      version: '1',
      chainId,
      verifyingContract: vaultAddress,
    } as const;

    const types = {
      OrderCancellation: [
        { name: 'orderId', type: 'string' },
        { name: 'expiry', type: 'uint256' },
      ],
    } as const;

    const message = {
      orderId,
      expiry: BigInt(expiry),
    };

    const signature = await walletClient.signTypedData({
      account: userAddress,
      domain,
      types,
      primaryType: 'OrderCancellation',
      message,
    });

    const { data, error } = await this.client.POST('/kalshi/order/cancel', {
      body: {
        chain: chain as 'base',
        orderId,
        userAddress,
        signature,
        expiry,
      },
    });

    if (error?.error) {
      const errorMsg = (error as { error?: string }).error ?? 'Failed to cancel order';
      throw new Error(errorMsg);
    }

    console.log('Order cancellation requested:', data);
  }

  async executeMintFlow(params: {
    walletClient: WalletClient;
    publicClient: PublicClient;
    userAddress: `0x${string}`;
    chain: SupportedChain;
    marketId: string;
    side: 'yes' | 'no';
    number: number;
  }): Promise<{ txHash: `0x${string}` }> {
    const { walletClient, publicClient, userAddress, chain, marketId, side, number } = params;

    const vaultAddress = (await this.getChainInfo(chain)).vaultAddress;

    const auth = await this.getTokenAuthorization({
      chain: chain as 'base',
      marketId,
      number,
      action: 'mint',
      side,
      userAddress,
    });

    const mintTxHash = await walletClient.writeContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'mintPosition',
      args: [
        auth.uuid,
        marketId,
        side === 'yes',
        BigInt(number),
        BigInt(auth.expiresAt),
        auth.signature as `0x${string}`,
      ],
      account: userAddress,
      chain: null,
    });

    await publicClient.waitForTransactionReceipt({ hash: mintTxHash });

    console.log('Tokens minted');

    return { txHash: mintTxHash };
  }

  async executeBurnFlow(params: {
    walletClient: WalletClient;
    publicClient: PublicClient;
    userAddress: `0x${string}`;
    chain: SupportedChain;
    marketId: string;
    side: 'yes' | 'no';
    number: number;
  }): Promise<{ txHash: `0x${string}` }> {
    const { walletClient, publicClient, userAddress, chain, marketId, side, number } = params;

    const vaultAddress = (await this.getChainInfo(chain)).vaultAddress;

    const auth = await this.getTokenAuthorization({
      chain: chain as 'base',
      marketId,
      number,
      action: 'burn',
      side,
      userAddress,
    });

    const burnTxHash = await walletClient.writeContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'burnMarketPosition',
      args: [
        auth.uuid,
        marketId,
        side === 'yes',
        userAddress,
        BigInt(number),
        BigInt(auth.expiresAt),
        auth.signature as `0x${string}`,
      ],
      account: userAddress,
      chain: null,
    });

    await publicClient.waitForTransactionReceipt({ hash: burnTxHash });

    console.log('Tokens burned');

    return { txHash: burnTxHash };
  }

  async executeDepositFlow(params: {
    walletClient: WalletClient;
    publicClient: PublicClient;
    userAddress: `0x${string}`;
    chain: SupportedChain;
    amountUusdc: number;
  }): Promise<`0x${string}`> {
    const { walletClient, publicClient, userAddress, chain, amountUusdc } = params;

    const chainInfo = await this.getChainInfo(chain);
    const vaultAddress = chainInfo.vaultAddress;
    const usdcAddress = chainInfo.usdcAddress;

    console.log('Deposit flow starting:', { userAddress, vaultAddress, usdcAddress, amountUusdc });
    console.log('WalletClient chain:', walletClient.chain);

    const usdcAmount = BigInt(amountUusdc);

    const allowance = await publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [userAddress, vaultAddress],
    });

    console.log('Current allowance:', allowance.toString(), 'Need:', usdcAmount.toString());

    if (allowance < usdcAmount) {
      console.log('Requesting approval...');
      const hash = await walletClient.writeContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [vaultAddress, maxUint256],
        account: userAddress,
        chain: null,
      });
      console.log('Approve tx hash:', hash);
      await publicClient.waitForTransactionReceipt({ hash });
      console.log('Approval confirmed');
    }

    console.log('Requesting deposit...');
    const txHash = await walletClient.writeContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'depositUSDC',
      args: [usdcAmount],
      account: userAddress,
      chain: null,
    });
    console.log('Deposit tx hash:', txHash);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log('Deposit confirmed');
    return txHash;
  }

  async executeWithdrawFlow(params: {
    walletClient: WalletClient;
    publicClient: PublicClient;
    userAddress: `0x${string}`;
    chain: SupportedChain;
    amountUusdc: number;
  }): Promise<`0x${string}`> {
    const { walletClient, publicClient, userAddress, chain, amountUusdc } = params;

    const vaultAddress = (await this.getChainInfo(chain)).vaultAddress;

    console.log('Withdraw flow starting:', { userAddress, vaultAddress, amountUusdc });
    console.log('WalletClient chain:', walletClient.chain);

    const amountUsdcBaseUnits = BigInt(amountUusdc);

    console.log('Getting withdraw authorization from API...');
    const { uuid, signature, expiresAt, maxWithdrawAmount } = await this.getWithdrawAuthorization({
      chain,
      userAddress,
      amountUusdc,
    });

    console.log('Withdraw authorization received:', {
      maxWithdrawAmount,
      expiresAt,
    });

    const maxWithdrawAmountBigInt = BigInt(maxWithdrawAmount);
    if (amountUsdcBaseUnits > maxWithdrawAmountBigInt) {
      throw new Error(
        `Requested withdraw amount (${String(amountUusdc)} µUSDC) exceeds maximum allowed (${String(maxWithdrawAmount)} µUSDC)`,
      );
    }

    console.log('Requesting withdraw...');
    const txHash = await walletClient.writeContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'withdrawUSDC',

      args: [uuid, amountUsdcBaseUnits, BigInt(expiresAt), signature as `0x${string}`],
      account: userAddress,
      chain: null,
    });
    console.log('Withdraw tx hash:', txHash);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log('Withdraw confirmed');
    return txHash;
  }

  async getPositionTokenAddress(params: {
    publicClient: PublicClient;
    chain: SupportedChain;
    marketId: string;
    side: 'yes' | 'no';
  }): Promise<`0x${string}` | null> {
    const { publicClient, chain, marketId, side } = params;

    const vaultAddress = (await this.getChainInfo(chain)).vaultAddress;

    const tokenAddress = await publicClient.readContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'getPositionToken',
      args: [marketId, side === 'yes'],
    });

    if (tokenAddress === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    return tokenAddress;
  }

  async getTokenBalance(params: {
    publicClient: PublicClient;
    tokenAddress: `0x${string}`;
    userAddress: `0x${string}`;
  }): Promise<bigint> {
    const { publicClient, tokenAddress, userAddress } = params;

    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [userAddress],
    });

    return balance;
  }

  async addTokenToWallet(params: {
    tokenAddress: `0x${string}`;
    marketId: string;
    side: 'yes' | 'no';
  }): Promise<boolean> {
    const { tokenAddress, marketId, side } = params;

    if (typeof window === 'undefined') {
      throw new Error('Cannot add token in non-browser environment');
    }

    if (!window.ethereum) {
      throw new Error(
        'No Ethereum wallet detected. Please install MetaMask or another web3 wallet.',
      );
    }

    try {
      const result = await window.ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: tokenAddress,
            symbol: `${marketId.slice(0, 7).replace(/-+$/, '')}-${side === 'yes' ? 'Y' : 'N'}`,
            decimals: 0,
          },
        },
      });

      return result;
    } catch (error) {
      console.error('Failed to add token to wallet:', error);
      throw error;
    }
  }
}

export const createBisonClient = (options: BisonClientOptions) => new BisonClient(options);
