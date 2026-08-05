import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useAppAuth } from '../auth/AuthContext';

// Shown when Entra returns AADSTS50105 — the account is valid but has not been
// invited / assigned to the app. This is the app-facing side of the invite-only
// security model (Entra appRoleAssignmentRequired + B2B invitation).
export function NotInvitedScreen({ reason }: { reason: string }) {
  const { signOut } = useAppAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔒</Text>
      <Text style={styles.title}>Access is invite-only</Text>
      <Text style={styles.body}>
        {reason === 'access-revoked'
          ? 'Your access to DC Opportunities has been revoked. Contact your administrator to be re-invited.'
          : 'Your account is not yet approved for DC Opportunities. Ask an administrator to send you an invitation, then sign in again.'}
      </Text>
      <TouchableOpacity
        style={styles.link}
        onPress={() => Linking.openURL('mailto:macancil@microsoft.com?subject=DC%20Opportunities%20access%20request')}
      >
        <Text style={styles.linkText}>Request access</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={signOut}>
        <Text style={styles.secondaryText}>Use a different account</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: '#0b1f33' },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: 'white', marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 15, color: '#cbd5e1', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  link: { backgroundColor: '#2563eb', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 10 },
  linkText: { color: 'white', fontWeight: '700', fontSize: 15 },
  secondary: { marginTop: 16 },
  secondaryText: { color: '#94a3b8', fontSize: 14 },
});
