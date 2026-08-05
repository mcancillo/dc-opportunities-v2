import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useAppAuth } from '../auth/AuthContext';
import { syncAll, SyncArea, SyncProgress, isOnline } from '../cache/sync';
import { getAllLayerMeta, getMeta, clearCache } from '../cache/db';
import { LAYER_META } from '../components/LayerToggle';
import { LayerKey } from '../api/types';

// Default sync extent: Western Europe (where the opportunity data is focused).
const DEFAULT_AREA: SyncArea = {
  lat: 52.1326,
  lng: 5.2913,
  radiusM: 250000,
  country: 'NL',
  bounds: [
    [-1.5, 48.5],
    [12.5, 55.5],
  ],
  minZoom: 4,
  maxZoom: 11,
};

export function SettingsScreen() {
  const { state, signOut, api } = useAppAuth();
  const profile = state.status === 'signedIn' ? state.profile : undefined;

  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress[]>([]);
  const [meta, setMetaRows] = useState<Array<{ layer: LayerKey; featureCount: number; updatedAt: number }>>([]);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [online, setOnline] = useState(true);

  const refreshMeta = useCallback(async () => {
    setMetaRows(await getAllLayerMeta());
    const ls = await getMeta('lastSync');
    setLastSync(ls ? Number(ls) : null);
    setOnline(await isOnline());
  }, []);

  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  const onSync = useCallback(async () => {
    setSyncing(true);
    setProgress([]);
    const res = await syncAll(api, DEFAULT_AREA, (p) =>
      setProgress((prev) => [...prev, p])
    );
    setSyncing(false);
    if (res.offline) {
      setProgress((prev) => [...prev, { layer: 'mapPack', status: 'skipped', detail: 'offline' }]);
    }
    await refreshMeta();
  }, [api, refreshMeta]);

  const onClear = useCallback(async () => {
    await clearCache();
    await refreshMeta();
    setProgress([]);
  }, [refreshMeta]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.section}>Account</Text>
      <View style={styles.card}>
        <Text style={styles.name}>{profile?.name ?? 'Signed in'}</Text>
        {profile?.email && <Text style={styles.email}>{profile.email}</Text>}
      </View>

      <Text style={styles.section}>Offline data</Text>
      <View style={styles.card}>
        <Text style={styles.metaLine}>
          Status: {online ? 'Online' : 'Offline (cached)'}
        </Text>
        <Text style={styles.metaLine}>
          Last sync: {lastSync ? new Date(lastSync).toLocaleString() : 'never'}
        </Text>
        {meta.length === 0 ? (
          <Text style={styles.metaDim}>No layers cached yet.</Text>
        ) : (
          meta.map((m) => (
            <Text key={m.layer} style={styles.metaLine}>
              • {LAYER_META[m.layer]?.label ?? m.layer}: {m.featureCount} features
            </Text>
          ))
        )}
      </View>

      <TouchableOpacity style={[styles.button, syncing && styles.buttonDisabled]} onPress={onSync} disabled={syncing}>
        {syncing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sync &amp; cache current maps</Text>
        )}
      </TouchableOpacity>

      {progress.length > 0 && (
        <View style={styles.card}>
          {progress.map((p, i) => (
            <Text key={i} style={styles.progress}>
              {p.status === 'done' ? '✓' : p.status === 'error' ? '✕' : p.status === 'skipped' ? '–' : '…'}{' '}
              {p.layer} {p.detail ? `— ${p.detail}` : ''}
            </Text>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.secondary} onPress={onClear}>
        <Text style={styles.secondaryText}>Clear offline cache</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.secondary, { marginTop: 24 }]} onPress={signOut}>
        <Text style={[styles.secondaryText, { color: '#dc2626' }]}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  section: { fontSize: 13, fontWeight: '700', color: '#64748b', marginTop: 18, marginBottom: 8, textTransform: 'uppercase' },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 8 },
  name: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  email: { fontSize: 14, color: '#64748b', marginTop: 2 },
  metaLine: { fontSize: 14, color: '#334155', marginVertical: 2 },
  metaDim: { fontSize: 14, color: '#94a3b8', marginTop: 4 },
  button: { backgroundColor: '#2563eb', paddingVertical: 15, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 15 },
  progress: { fontSize: 13, color: '#334155', marginVertical: 2, fontFamily: 'monospace' },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: '#2563eb', fontWeight: '700', fontSize: 15 },
});
