// Secure token storage backed by the platform keychain / keystore via
// expo-secure-store. Access + refresh tokens never touch AsyncStorage.
import * as SecureStore from 'expo-secure-store';

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number; // epoch ms
};

const KEY = 'dcopps.tokens';

export async function saveTokens(t: TokenSet): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(t), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadTokens(): Promise<TokenSet | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenSet;
  } catch {
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
