// Entra ID (Azure AD) sign-in for the mobile client using the MSAL-compatible
// OAuth2 authorization-code + PKCE flow via expo-auth-session.
//
// Invite-only enforcement: the mobile app registration has
// `appRoleAssignmentRequired = true`. Only users who have been invited (B2B)
// AND assigned to the app can obtain a token. Entra returns AADSTS50105 for a
// valid-but-unassigned user; we surface that as a distinct `notInvited` state
// so the UI can show a friendly "request access" screen instead of an error.

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { config, endpoints, scopes } from '../config';
import { clearTokens, loadTokens, saveTokens, TokenSet } from './tokenStore';

WebBrowser.maybeCompleteAuthSession();

export type UserProfile = {
  name?: string;
  email?: string;
  oid?: string;
};

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'notInvited'; reason: string }
  | { status: 'signedIn'; profile: UserProfile };

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: endpoints.authorization,
  tokenEndpoint: endpoints.token,
};

function decodeJwt(jwt?: string): Record<string, any> | null {
  if (!jwt) return null;
  try {
    const payload = jwt.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(normalized)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function profileFromIdToken(idToken?: string): UserProfile {
  const claims = decodeJwt(idToken) ?? {};
  return {
    name: claims.name,
    email: claims.preferred_username || claims.email || claims.upn,
    oid: claims.oid,
  };
}

// AADSTS50105 => user is not assigned to the app (i.e. not invited/approved).
function isNotInvited(errorBody: string): boolean {
  return /AADSTS50105|not assigned to a role|does not exist in tenant/i.test(errorBody);
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const redirectUri = useMemo(
    () =>
      AuthSession.makeRedirectUri({
        scheme: 'com.dcopportunities.app',
        path: 'auth',
      }),
    []
  );

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: config.clientId,
      scopes,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: { prompt: 'select_account' },
    },
    discovery
  );

  const applyTokenResponse = useCallback(async (data: any) => {
    const tokens: TokenSet = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      expiresAt: Date.now() + (Number(data.expires_in ?? 3600) - 60) * 1000,
    };
    await saveTokens(tokens);
    setState({ status: 'signedIn', profile: profileFromIdToken(tokens.idToken) });
  }, []);

  // Restore a session on launch, refreshing silently if needed.
  useEffect(() => {
    (async () => {
      const existing = await loadTokens();
      if (!existing) {
        setState({ status: 'signedOut' });
        return;
      }
      if (existing.expiresAt > Date.now()) {
        setState({ status: 'signedIn', profile: profileFromIdToken(existing.idToken) });
        return;
      }
      const refreshed = await refresh(existing);
      if (!refreshed) setState({ status: 'signedOut' });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(
    async (current: TokenSet): Promise<boolean> => {
      if (!current.refreshToken) return false;
      try {
        const res = await fetch(endpoints.token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: config.clientId,
            grant_type: 'refresh_token',
            refresh_token: current.refreshToken,
            scope: scopes.join(' '),
          }).toString(),
        });
        const body = await res.text();
        if (!res.ok) {
          if (isNotInvited(body)) setState({ status: 'notInvited', reason: 'access-revoked' });
          return false;
        }
        await applyTokenResponse(JSON.parse(body));
        return true;
      } catch {
        return false;
      }
    },
    [applyTokenResponse]
  );

  const signIn = useCallback(async () => {
    if (!request) return;
    setState({ status: 'loading' });
    const result = await promptAsync();
    if (result.type !== 'success' || !result.params.code) {
      if (result.type === 'error' && isNotInvited(JSON.stringify(result.params))) {
        setState({ status: 'notInvited', reason: 'not-assigned' });
        return;
      }
      setState({ status: 'signedOut' });
      return;
    }
    try {
      const res = await fetch(endpoints.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          grant_type: 'authorization_code',
          code: result.params.code,
          redirect_uri: redirectUri,
          scope: scopes.join(' '),
          code_verifier: request.codeVerifier ?? '',
        }).toString(),
      });
      const body = await res.text();
      if (!res.ok) {
        setState(
          isNotInvited(body)
            ? { status: 'notInvited', reason: 'not-assigned' }
            : { status: 'signedOut' }
        );
        return;
      }
      await applyTokenResponse(JSON.parse(body));
    } catch {
      setState({ status: 'signedOut' });
    }
  }, [applyTokenResponse, promptAsync, redirectUri, request]);

  const signOut = useCallback(async () => {
    await clearTokens();
    setState({ status: 'signedOut' });
  }, []);

  // Returns a valid access token, refreshing on demand. Used by the API client.
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const current = await loadTokens();
    if (!current) return null;
    if (current.expiresAt > Date.now()) return current.accessToken;
    const ok = await refresh(current);
    if (!ok) return null;
    const next = await loadTokens();
    return next?.accessToken ?? null;
  }, [refresh]);

  return { state, signIn, signOut, getAccessToken, canPrompt: !!request };
}
