// Thin typed client over the DC Opportunities REST API. Every request carries
// the Entra access token as a Bearer header; App Service Easy Auth validates it.
import { config } from '../config';
import { GeoJSONFeatureCollection, Datacenter, Property } from './types';

export type TokenProvider = () => Promise<string | null>;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class ApiClient {
  constructor(private getToken: TokenProvider, private baseUrl: string = config.apiBaseUrl) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.getToken();
    if (!token) throw new ApiError(401, 'Not authenticated');
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 401 || res.status === 403) {
      throw new ApiError(res.status, 'Access denied');
    }
    if (!res.ok) throw new ApiError(res.status, `Request failed: ${res.status}`);
    return (await res.json()) as T;
  }

  // Map layers ---------------------------------------------------------------
  getDatacenters(lat: number, lng: number, radiusM = 50000): Promise<Datacenter[]> {
    return this.request(`/api/datacenters?lat=${lat}&lng=${lng}&radius=${radiusM}`);
  }

  getSubseaCables(): Promise<GeoJSONFeatureCollection> {
    return this.request('/api/subsea-cables');
  }

  getLandingPoints(): Promise<GeoJSONFeatureCollection> {
    return this.request('/api/landing-points');
  }

  getFiberBackbone(): Promise<GeoJSONFeatureCollection> {
    return this.request('/api/fiber-backbone');
  }

  getProperties(lat: number, lng: number, radiusM = 50000, country?: string): Promise<Property[]> {
    const c = country ? `&country=${country}` : '';
    return this.request(`/api/properties?lat=${lat}&lng=${lng}&radius=${radiusM}${c}`);
  }

  getCommercial(lat: number, lng: number, radiusM = 50000, country?: string): Promise<Property[]> {
    const c = country ? `&country=${country}` : '';
    return this.request(`/api/commercial?lat=${lat}&lng=${lng}&radius=${radiusM}${c}`);
  }

  // Customer portfolio (owner-curated shares) --------------------------------
  getPortfolio(customerId: string): Promise<{ items: Property[] }> {
    return this.request(`/api/portfolio?customer_id=${encodeURIComponent(customerId)}`);
  }

  // Invite redemption check (app-layer IAM). Returns the invite if valid.
  getInvites(): Promise<any[]> {
    return this.request('/api/iam/invites');
  }
}
