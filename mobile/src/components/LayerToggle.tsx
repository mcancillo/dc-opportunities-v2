import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { LayerKey } from '../api/types';

export const LAYER_META: Record<LayerKey, { label: string; color: string }> = {
  datacenters: { label: 'Data centers', color: '#2563eb' },
  subseaCables: { label: 'Subsea cables', color: '#0891b2' },
  landingPoints: { label: 'Cable landing points', color: '#0d9488' },
  fiberBackbone: { label: 'Fiber rings / backbone', color: '#7c3aed' },
  properties: { label: 'Industrial real estate', color: '#ea580c' },
  commercial: { label: 'Commercial real estate', color: '#dc2626' },
};

export function LayerToggle({
  layer,
  enabled,
  count,
  onToggle,
}: {
  layer: LayerKey;
  enabled: boolean;
  count?: number;
  onToggle: (v: boolean) => void;
}) {
  const meta = LAYER_META[layer];
  return (
    <View style={styles.row}>
      <View style={[styles.swatch, { backgroundColor: meta.color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{meta.label}</Text>
        {count != null && <Text style={styles.count}>{count} cached</Text>}
      </View>
      <Switch value={enabled} onValueChange={onToggle} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  label: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  count: { fontSize: 12, color: '#64748b' },
});
