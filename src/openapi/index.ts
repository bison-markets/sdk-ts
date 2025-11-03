import createClient from 'openapi-fetch';
import type { paths } from './generated/schema';

export type OpenAPIPaths = paths;

export const createBisonOAPIClient = (baseUrl: string) =>
  createClient<OpenAPIPaths>({
    baseUrl,
  });
