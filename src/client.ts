import 'viem/window';
import { createBisonOAPIClient, OpenAPIPaths } from './openapi';
import type { WalletClient, PublicClient } from 'viem';
import { maxUint256 } from 'viem';
import { signTypedData } from 'viem/accounts';
import { VAULT_ABI, ERC20_ABI } from './constants';

export interface DevFlags {
  privateKey: `0x${string}`;
  devAccountId: string;
}

export interface BisonClientOptions {
  baseUrl: string;
  devAccountId?: string | undefined;
  devFlags?: DevFlags;
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
  newBalanceUusdc: number;
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

export type GetUserOrdersParams = Omit<
  NonNullable<OpenAPIPaths['/kalshi/orders']['get']['parameters']['query']>,
  'userId'
>;

export type GetUserOrdersResponse =
  OpenAPIPaths['/kalshi/orders']['get']['responses']['200']['content']['application/json'];

export type GetUserPositionsResponse =
  OpenAPIPaths['/kalshi/positions']['get']['responses']['200']['content']['application/json'];

export type GetCreatedTokensResponse =
  OpenAPIPaths['/created-tokens']['get']['responses']['200']['content']['application/json'];

export type GetMarketsResponse =
  OpenAPIPaths['/kalshi/markets']['get']['responses']['200']['content']['application/json'];

export type ScheduleWithdrawRequest = NonNullable<
  OpenAPIPaths['/schedule-withdraw']['post']['requestBody']
>['content']['application/json'];

export type ScheduleWithdrawResponse =
  OpenAPIPaths['/schedule-withdraw']['post']['responses']['200']['content']['application/json'];

export type GetPendingWithdrawsResponse =
  OpenAPIPaths['/pending-withdraws/{userAddress}']['get']['responses']['200']['content']['application/json'];

export type GetFeeClaimAuthorizationResponse =
  OpenAPIPaths['/dev/fee-claim-authorization']['post']['responses']['200']['content']['application/json'];

export type GetDevAccountFeesResponse =
  OpenAPIPaths['/dev/fees']['get']['responses']['200']['content']['application/json'];

export type GetDevAccountInfoResponse =
  OpenAPIPaths['/dev/info']['get']['responses']['200']['content']['application/json'];

export type GetDevFeeClaimHistoryResponse =
  OpenAPIPaths['/dev/fee-claim-history']['get']['responses']['200']['content']['application/json'];

export type GetUserHistoryParams = Omit<
  NonNullable<OpenAPIPaths['/user/history']['get']['parameters']['query']>,
  'userId'
>;

export type GetUserHistoryResponse =
  OpenAPIPaths['/user/history']['get']['responses']['200']['content']['application/json'];

export type GetUserPnlParams = Omit<
  NonNullable<OpenAPIPaths['/user/pnl']['get']['parameters']['query']>,
  'userId'
>;

export type GetUserPnlResponse =
  OpenAPIPaths['/user/pnl']['get']['responses']['200']['content']['application/json'];

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

export interface OrderbookLevel {
  price_uusdc: number;
  quantity: number;
}

export interface OrderbookSnapshot {
  type: 'orderbook_snapshot';
  market_ticker: string;
  yes?: OrderbookLevel[];
  no?: OrderbookLevel[];
}

export interface OrderbookDelta {
  type: 'orderbook_delta';
  market_ticker: string;
  price_uusdc: number;
  delta: number;
  side: 'yes' | 'no';
}

export type OrderbookUpdate = OrderbookSnapshot | OrderbookDelta;

// Module-level cache for /info responses, keyed by baseUrl
const infoCache = new Map<string, GetInfoResponse>();

function formatApiError(fallbackMsg: string, error: unknown): Error {
  if (!error || typeof error !== 'object') {
    return new Error(fallbackMsg);
  }

  const errObj = error as Record<string, unknown>;
  const parts: string[] = [];

  if (errObj.error && typeof errObj.error === 'string') {
    parts.push(errObj.error);
  } else {
    parts.push(fallbackMsg);
  }

  if (typeof errObj.status === 'number') {
    parts.push(`(HTTP ${errObj.status.toString()})`);
  }

  if (errObj.message && typeof errObj.message === 'string' && errObj.message !== errObj.error) {
    parts.push(`- ${errObj.message}`);
  }

  if (errObj.details) {
    parts.push(`- Details: ${JSON.stringify(errObj.details)}`);
  }

  return new Error(parts.join(' '));
}

const DEV_AUTH_DOMAIN = {
  name: 'BisonDevAuth',
  version: '1',
} as const;

const DEV_AUTH_TYPES = {
  DevAccountAuth: [
    { name: 'devAccountId', type: 'string' },
    { name: 'action', type: 'string' },
    { name: 'expiry', type: 'uint256' },
  ],
} as const;

export class BisonClient {
  private readonly client: ReturnType<typeof createBisonOAPIClient>;
  private readonly baseUrl: string;
  private readonly devAccountId?: string | undefined;
  private readonly devFlags: DevFlags | undefined;
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

  private orderbookWs: WebSocket | null = null;
  private orderbookReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private orderbookHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private shouldReconnectOrderbook = false;
  private orderbookReconnectAttempts = 0;

  constructor(options: BisonClientOptions) {
    this.baseUrl = options.baseUrl;
    this.devAccountId = 'devAccountId' in options ? options.devAccountId : undefined;
    this.devFlags = options.devFlags;
    this.client = createBisonOAPIClient(options.baseUrl);
  }

  private async signDevAuth(action: string): Promise<string> {
    if (!this.devFlags) {
      throw new Error('devFlags not configured');
    }

    const expiry = Math.floor(Date.now() / 1000) + 300;

    const signature = await signTypedData({
      privateKey: this.devFlags.privateKey,
      domain: DEV_AUTH_DOMAIN,
      types: DEV_AUTH_TYPES,
      primaryType: 'DevAccountAuth',
      message: {
        devAccountId: this.devFlags.devAccountId,
        action,
        expiry: BigInt(expiry),
      },
    });

    return JSON.stringify({
      devAccountId: this.devFlags.devAccountId,
      action,
      expiry,
      signature,
    });
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
      throw formatApiError('Failed to get token authorization', error);
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
      throw formatApiError('Failed to get withdraw authorization', error);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getWithdrawAuthorization');
    }

    return data;
  }

  async getFeeClaimAuthorization(): Promise<GetFeeClaimAuthorizationResponse> {
    if (!this.devFlags) {
      throw new Error('devFlags required for getFeeClaimAuthorization');
    }

    const authHeader = await this.signDevAuth('fee-claim-authorization');

    const { data, error } = await this.client.POST('/dev/fee-claim-authorization', {
      params: { header: { 'x-dev-auth': authHeader } },
    });

    if (typeof error !== 'undefined') {
      throw formatApiError('Failed to get fee claim authorization', error);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getFeeClaimAuthorization');
    }

    return data;
  }

  async getDevAccountFees(): Promise<GetDevAccountFeesResponse> {
    if (!this.devFlags) {
      throw new Error('devFlags required for getDevAccountFees');
    }

    const authHeader = await this.signDevAuth('fees');

    const { data, error } = await this.client.GET('/dev/fees', {
      params: { header: { 'x-dev-auth': authHeader } },
    });

    if (typeof error !== 'undefined') {
      throw formatApiError('Failed to get dev account fees', error);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getDevAccountFees');
    }

    return data;
  }

  async getDevAccountInfo(): Promise<GetDevAccountInfoResponse> {
    if (!this.devFlags) {
      throw new Error('devFlags required for getDevAccountInfo');
    }

    const authHeader = await this.signDevAuth('info');

    const { data, error } = await this.client.GET('/dev/info', {
      params: { header: { 'x-dev-auth': authHeader } },
    });

    if (typeof error !== 'undefined') {
      throw formatApiError('Failed to get dev account info', error);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getDevAccountInfo');
    }

    return data;
  }

  async getDevFeeClaimHistory(params?: {
    limit?: number;
    cursor?: string;
  }): Promise<GetDevFeeClaimHistoryResponse> {
    if (!this.devFlags) {
      throw new Error('devFlags required for getDevFeeClaimHistory');
    }

    const authHeader = await this.signDevAuth('fee-claim-history');

    const { data, error } = await this.client.GET('/dev/fee-claim-history', {
      params: {
        header: { 'x-dev-auth': authHeader },
        query: {
          ...(params?.limit !== undefined && { limit: params.limit.toString() }),
          ...(params?.cursor !== undefined && { cursor: params.cursor }),
        },
      },
    });

    if (typeof error !== 'undefined') {
      throw formatApiError('Failed to get fee claim history', error);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getDevFeeClaimHistory');
    }

    return data;
  }

  async placeOrder(
    options: PlaceOrderRequest & { devAccountId?: string },
  ): Promise<PlaceOrderResponse> {
    const requestBody: PlaceOrderRequest & { devAccountId?: string } = { ...options };
    if (this.devAccountId && !requestBody.devAccountId) {
      requestBody.devAccountId = this.devAccountId;
    }

    const { data, error } = await this.client.POST('/kalshi/order/limit', {
      body: requestBody as PlaceOrderRequest,
    });

    if (error) {
      throw formatApiError('Failed to place order', error);
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

    if (error) {
      throw formatApiError('Failed to get event', error);
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
      throw formatApiError('Failed to get event metadata', error);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getEventMetadata');
    }

    return data;
  }

  async getInfo(): Promise<GetInfoResponse> {
    const { data, error } = await this.client.GET('/info');

    if (typeof error !== 'undefined') {
      throw formatApiError('Failed to get system info', error);
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

    if (error) {
      throw formatApiError('Failed to get deposited USDC balance', error);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getDepositedUsdcBalance');
    }

    return data;
  }

  async getUserOrders(
    userId: string,
    params?: GetUserOrdersParams,
  ): Promise<GetUserOrdersResponse> {
    const { data, error } = await this.client.GET('/kalshi/orders', {
      params: {
        query: { userId, ...params },
      },
    });

    if (error) {
      throw formatApiError('Failed to get user orders', error);
    }

    return data;
  }

  async getUserPositions(userId: string): Promise<GetUserPositionsResponse> {
    const { data, error } = await this.client.GET('/kalshi/positions', {
      params: {
        query: { userId },
      },
    });

    if (error) {
      throw formatApiError('Failed to get user positions', error);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getUserPositions');
    }

    return data;
  }

  async getUserHistory(
    userId: string,
    params?: GetUserHistoryParams,
  ): Promise<GetUserHistoryResponse> {
    const { data, error } = await this.client.GET('/user/history', {
      params: {
        query: { userId, ...params },
      },
    });

    if (error) {
      throw formatApiError('Failed to get user history', error);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getUserHistory');
    }

    return data;
  }

  async getUserPnl(userId: string, params?: GetUserPnlParams): Promise<GetUserPnlResponse> {
    const { data, error } = await this.client.GET('/user/pnl', {
      params: {
        query: { userId, ...params },
      },
    });

    if (error) {
      throw formatApiError('Failed to get user PNL', error);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getUserPnl');
    }

    return data;
  }

  async getCreatedTokens(chain?: SupportedChain): Promise<GetCreatedTokensResponse> {
    const { data, error } = await this.client.GET(
      '/created-tokens',
      chain ? { params: { query: { chain } } } : {},
    );

    if (typeof error !== 'undefined') {
      throw formatApiError('Failed to get created tokens', error);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getCreatedTokens');
    }

    return data;
  }

  async getMarkets(params?: {
    series_ticker?: string;
    event_ticker?: string;
    status?: 'active' | 'closed' | 'settled';
    limit?: string;
    query?: string;
  }): Promise<GetMarketsResponse> {
    const { data, error } = await this.client.GET(
      '/kalshi/markets',
      params ? { params: { query: params } } : {},
    );

    if (error) {
      throw formatApiError('Failed to get markets', error);
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

  listenToOrderbook(
    marketTicker: string,
    onUpdate: (update: OrderbookUpdate) => void,
    options?: {
      onError?: (error: Error) => void;
      onConnect?: () => void;
      onDisconnect?: () => void;
      reconnect?: boolean;
    },
  ): () => void {
    this.shouldReconnectOrderbook = options?.reconnect ?? true;
    this.orderbookReconnectAttempts = 0;

    const connect = () => {
      const wsUrl = `${this.baseUrl.replace(/^http/, 'ws')}/ws/kalshi/orderbook/${marketTicker}`;

      if (
        this.orderbookWs?.readyState === WebSocket.OPEN ||
        this.orderbookWs?.readyState === WebSocket.CONNECTING
      ) {
        return;
      }

      this.orderbookWs = new WebSocket(wsUrl);

      this.orderbookWs.onopen = () => {
        this.orderbookReconnectAttempts = 0;
        options?.onConnect?.();

        if (options?.reconnect !== false) {
          this.orderbookHeartbeatTimer = setInterval(() => {
            if (this.orderbookWs?.readyState === WebSocket.OPEN) {
              this.orderbookWs.send(JSON.stringify({ type: 'ping' }));
            }
          }, 30000);
        }
      };

      this.orderbookWs.onmessage = (event) => {
        try {
          const data: unknown = JSON.parse(String(event.data));
          if (data && typeof data === 'object' && 'type' in data) {
            if (data.type === 'orderbook_snapshot' || data.type === 'orderbook_delta') {
              onUpdate(data as OrderbookUpdate);
            } else if (data.type === 'orderbook_error') {
              const errorData = data as { type: 'orderbook_error'; message: string };
              options?.onError?.(new Error(errorData.message));
            }
          }
        } catch (error) {
          options?.onError?.(error as Error);
        }
      };

      this.orderbookWs.onerror = () => {
        options?.onError?.(new Error('WebSocket error'));
      };

      this.orderbookWs.onclose = () => {
        if (this.orderbookHeartbeatTimer) {
          clearInterval(this.orderbookHeartbeatTimer);
          this.orderbookHeartbeatTimer = null;
        }

        options?.onDisconnect?.();

        if (
          this.shouldReconnectOrderbook &&
          this.orderbookReconnectAttempts < this.maxReconnectAttempts
        ) {
          this.orderbookReconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.orderbookReconnectAttempts - 1), 30000);

          this.orderbookReconnectTimer = setTimeout(() => {
            connect();
          }, delay);
        }
      };
    };

    connect();

    return () => {
      this.shouldReconnectOrderbook = false;

      if (this.orderbookReconnectTimer) {
        clearTimeout(this.orderbookReconnectTimer);
        this.orderbookReconnectTimer = null;
      }

      if (this.orderbookHeartbeatTimer) {
        clearInterval(this.orderbookHeartbeatTimer);
        this.orderbookHeartbeatTimer = null;
      }

      if (this.orderbookWs) {
        this.orderbookWs.close();
        this.orderbookWs = null;
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

    if (error) {
      throw formatApiError('Failed to cancel order', error);
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
      chain: walletClient.chain,
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
      chain: walletClient.chain,
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
        chain: walletClient.chain,
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
      chain: walletClient.chain,
    });
    console.log('Deposit tx hash:', txHash);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log('Deposit confirmed');
    return txHash;
  }

  async scheduleWithdraw(params: {
    walletClient: WalletClient;
    userAddress: `0x${string}`;
    chain: SupportedChain;
    amountUusdc: number;
  }): Promise<ScheduleWithdrawResponse> {
    const { walletClient, userAddress, chain, amountUusdc } = params;

    console.log('Schedule withdraw starting:', { userAddress, chain, amountUusdc });

    const chainId = walletClient.chain?.id ?? 31337;
    const expiry = Math.floor(Date.now() / 1000) + 600;

    const domain = {
      name: 'BisonScheduleWithdraw',
      version: '1',
      chainId,
    } as const;

    const types = {
      ScheduleWithdraw: [
        { name: 'userAddress', type: 'address' },
        { name: 'chain', type: 'string' },
        { name: 'amountUusdc', type: 'uint256' },
        { name: 'expiry', type: 'uint256' },
      ],
    } as const;

    const message = {
      userAddress,
      chain,
      amountUusdc: BigInt(amountUusdc),
      expiry: BigInt(expiry),
    };

    const signature = await walletClient.signTypedData({
      account: userAddress,
      domain,
      types,
      primaryType: 'ScheduleWithdraw',
      message,
    });

    console.log('Signature generated, calling API...');

    const { data, error } = await this.client.POST('/schedule-withdraw', {
      body: {
        userAddress,
        chain,
        amountUusdc,
        signature,
        expiry,
      },
    });

    if (error) {
      throw formatApiError('Failed to schedule withdraw', error);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from scheduleWithdraw');
    }

    console.log('Withdraw scheduled:', data);
    return data;
  }

  async getPendingWithdraws(params: {
    userAddress: `0x${string}`;
  }): Promise<GetPendingWithdrawsResponse> {
    const { userAddress } = params;

    const { data, error } = await this.client.GET('/pending-withdraws/{userAddress}', {
      params: {
        path: {
          userAddress,
        },
      },
    });

    if (error) {
      throw formatApiError('Failed to get pending withdraws', error);
    } else if (typeof data === 'undefined') {
      throw new Error('No data returned from getPendingWithdraws');
    }

    return data;
  }

  async claimWithdraw(params: {
    walletClient: WalletClient;
    publicClient: PublicClient;
    userAddress: `0x${string}`;
    chain: SupportedChain;
  }): Promise<`0x${string}`> {
    const { walletClient, publicClient, userAddress, chain } = params;

    const vaultAddress = (await this.getChainInfo(chain)).vaultAddress;

    console.log('Claim withdraw starting:', { userAddress, vaultAddress, chain });
    console.log('WalletClient chain:', walletClient.chain);

    console.log('Getting withdraw authorization from API...');
    const { uuid, signature, expiresAt, maxWithdrawAmount } = await this.getWithdrawAuthorization({
      chain,
      userAddress,
    });

    console.log('Withdraw authorization received:', {
      maxWithdrawAmount,
      expiresAt,
    });

    if (maxWithdrawAmount === 0) {
      throw new Error('No unclaimed withdrawals available');
    }

    console.log('Requesting withdraw...');
    const txHash = await walletClient.writeContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'withdrawUSDC',
      args: [
        uuid,
        BigInt(maxWithdrawAmount),
        userAddress,
        BigInt(expiresAt),
        signature as `0x${string}`,
      ],
      account: userAddress,
      chain: walletClient.chain,
    });
    console.log('Withdraw tx hash:', txHash);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log('Withdraw confirmed');
    return txHash;
  }

  /**
   * Claim accumulated dev fees from the vault.
   * Requires devFlags to be configured on the client.
   */
  async claimDevFees(params: {
    walletClient: WalletClient;
    publicClient: PublicClient;
  }): Promise<`0x${string}`> {
    if (!this.devFlags) {
      throw new Error('devFlags required for claimDevFees');
    }

    const { walletClient, publicClient } = params;

    console.log('Claim dev fees starting:', { devAccountId: this.devFlags.devAccountId });

    const { uuid, signature, expiresAt, amount, chain, signerAddress } =
      await this.getFeeClaimAuthorization();

    console.log('Fee authorization received:', { amount, chain, signerAddress });

    if (amount === 0) {
      throw new Error('No unclaimed fees available');
    }

    const vaultAddress = (await this.getChainInfo(chain as SupportedChain)).vaultAddress;

    console.log('Claiming fees from vault...');
    const txHash = await walletClient.writeContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'withdrawUSDC',
      args: [
        uuid,
        BigInt(amount),
        signerAddress as `0x${string}`,
        BigInt(expiresAt),
        signature as `0x${string}`,
      ],
      account: signerAddress as `0x${string}`,
      chain: walletClient.chain,
    });

    console.log('Fee claim tx hash:', txHash);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log('Fee claim confirmed');
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
