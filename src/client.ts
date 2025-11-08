import { createBisonOAPIClient, OpenAPIPaths } from './openapi';

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
  priceMyrs: number;
}

export interface BisonMarketEvent {
  type: 'market_settled' | 'market_closed' | 'market_opened';
  marketId: string;
  result?: 'yes' | 'no';
}

export interface BisonUSDCEvent {
  type: 'usdc_deposited' | 'usdc_withdrawn';
  userAddress: string;
  myrsAmount: number;
}

export interface BisonPositionEvent {
  type: 'position_minted' | 'position_burned';
  userAddress: string;
  marketId: string;
  side: 'yes' | 'no';
  number: number;
}

export type BisonEvent = BisonOrderEvent | BisonMarketEvent | BisonUSDCEvent | BisonPositionEvent;

export type GetEventResponse =
  OpenAPIPaths['/get-event']['get']['responses']['200']['content']['application/json'];

export type GetEventMetadataResponse =
  OpenAPIPaths['/get-event-metadata']['get']['responses']['200']['content']['application/json'];

export type GetTokenAuthorizationRequest = NonNullable<
  OpenAPIPaths['/get-token-authorization']['post']['requestBody']
>['content']['application/json'];

export type GetTokenAuthorizationResponse =
  OpenAPIPaths['/get-token-authorization']['post']['responses']['200']['content']['application/json'];

export type PlaceOrderRequest = NonNullable<
  OpenAPIPaths['/kalshi/order/limit']['post']['requestBody']
>['content']['application/json'];

export type PlaceOrderResponse =
  OpenAPIPaths['/kalshi/order/limit']['post']['responses']['200']['content']['application/json'];

export type GetInfoResponse =
  OpenAPIPaths['/info']['get']['responses']['200']['content']['application/json'];

export type GetDepositedUsdcBalanceResponse =
  OpenAPIPaths['/deposited-balance']['get']['responses']['200']['content']['application/json'];

export interface KalshiTickerUpdate {
  market_ticker: string;
  yes_bid_myrs?: number;
  yes_ask_myrs?: number;
  no_bid_myrs?: number;
  no_ask_myrs?: number;
  last_price_myrs?: number;
  volume?: number;
  open_interest?: number;
}

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

  async getTokenAuthorization(
    options: GetTokenAuthorizationRequest,
  ): Promise<GetTokenAuthorizationResponse> {
    const { data, error } = await this.client.POST('/get-token-authorization', {
      body: options,
    });

    if (error) {
      const errorMsg = (error as { error?: string }).error ?? 'Failed to get token authorization';
      throw new Error(errorMsg);
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
    }

    return data;
  }

  async getInfo(): Promise<GetInfoResponse> {
    const { data, error } = await this.client.GET('/info');

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (error) {
      throw new Error('Failed to get system info');
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
}

export const createBisonClient = (options: BisonClientOptions) => new BisonClient(options);
