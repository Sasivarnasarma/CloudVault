import type { HealthResponse } from '../types';
import { request } from './http';

export function fetchHealthStatus(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health', undefined, 'Health check failed');
}
