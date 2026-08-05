import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppAuth } from '../auth/AuthContext';

export function SignInScreen() {
  const { signIn, canPrompt, state } = useAppAuth();
  const loading = state.status === 'loading';
  return (
    <View style={styles.container}>
      <Text style={styles.title}>DC Opportunities</Text>
      <Text style={styles.subtitle}>
        Data centers, fiber rings, subsea cables and real-estate opportunities — online and offline.
      </Text>
      <TouchableOpacity
        style={[styles.button, (!canPrompt || loading) && styles.buttonDisabled]}
        onPress={signIn}
        disabled={!canPrompt || loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign in with Microsoft</Text>
        )}
      </TouchableOpacity>
      <Text style={styles.note}>Access is invite-only. Sign in with an approved account.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#0b1f33' },
  title: { fontSize: 32, fontWeight: '800', color: 'white', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#cbd5e1', marginBottom: 40, lineHeight: 22 },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '700' },
  note: { color: '#94a3b8', fontSize: 13, marginTop: 20, textAlign: 'center' },
});
