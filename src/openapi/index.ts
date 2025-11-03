import createClient from 'openapi-fetch';
import type { paths as OpenAPIPaths } from './generated/schema';

export const createBisonOAPIClient = (baseUrl: string) =>
  createClient<OpenAPIPaths>({
    baseUrl,
  });
