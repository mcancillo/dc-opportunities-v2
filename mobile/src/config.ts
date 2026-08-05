import Constants from 'expo-constants';

type Extra = {
  tenantId: string;
  mobileClientId: string;
  apiScope: string;
  apiBaseUrl: string;
  adminApiBaseUrl: string;
  mapStyleUrl: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Extra>;

export const config = {
  tenantId: extra.tenantId ?? '16b3c013-d300-468d-ac64-7eda0820b6d3',
  clientId: extra.mobileClientId ?? '3004922c-9d02-4d3e-8b22-8dd90c4bf78d',
  apiScope: extra.apiScope ?? 'api://0934e54f-36e2-4e8d-8aec-574895e062ef/access_as_user',
  apiBaseUrl: extra.apiBaseUrl ?? 'https://customer-m4b2vdcrzbbii-hhhtb7dfc0ecf5e9.b01.azurefd.net',
  adminApiBaseUrl: extra.adminApiBaseUrl ?? 'https://admin-m4b2vdcrzbbii-bpcvbueqhfbjbeef.b01.azurefd.net',
  mapStyleUrl: extra.mapStyleUrl ?? 'https://tiles.openfreemap.org/styles/liberty',
};

// Entra v2 OAuth endpoints (MSAL-compatible auth-code + PKCE flow).
export const authority = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
export const endpoints = {
  authorization: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`,
  token: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
};

// Scopes requested at sign-in. offline_access gives a refresh token so the
// app can silently renew and keep working after the access token expires.
export const scopes = ['openid', 'profile', 'offline_access', config.apiScope];
