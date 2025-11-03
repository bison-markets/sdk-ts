import { createBisonOAPIClient, OpenAPIPaths } from './openapi';

export interface BisonClientOptions {
  baseUrl: string;
}

export class BisonClient {
  private readonly client: ReturnType<typeof createBisonOAPIClient>;

  constructor(options: BisonClientOptions) {
    this.client = createBisonOAPIClient(options.baseUrl);
  }

  async getAuthorization(
    options: NonNullable<
      OpenAPIPaths['/get-authorization']['post']['requestBody']
    >['content']['application/json'],
  ) {
    const { data, error } = await this.client.POST('/get-authorization', {
      body: options,
    });

    if (error) {
      throw new Error(error.error);
    }

    return data;
  }
}

export const createBisonClient = (options: BisonClientOptions) => new BisonClient(options);
