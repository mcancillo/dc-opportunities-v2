import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { config } from '../config';
import { LayerKey } from '../api/types';
import { LAYER_META } from '../components/LayerToggle';
import { OfflineBanner } from '../components/OfflineBanner';
import { readCachedLayer, isOnline } from '../cache/sync';
import { normalizeFeatureCollection, pointsToFeatureCollection } from '../cache/geo';

// MapLibre needs no access token (non-Mapbox styles).
MapLibreGL.setAccessToken(null);

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };

const LINE_LAYERS: LayerKey[] = ['subseaCables', 'fiberBackbone'];
const POINT_LAYERS: LayerKey[] = ['landingPoints', 'datacenters', 'properties', 'commercial'];
const ALL: LayerKey[] = [...LINE_LAYERS, ...POINT_LAYERS];

export function MapScreen() {
  const [shapes, setShapes] = useState<Record<LayerKey, any>>({} as any);
  const [enabled, setEnabled] = useState<Record<LayerKey, boolean>>({
    datacenters: true,
    subseaCables: true,
    landingPoints: true,
    fiberBackbone: true,
    properties: true,
    commercial: true,
  });
  const [offline, setOffline] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);

  const loadCache = useCallback(async () => {
    setOffline(!(await isOnline()));
    const next: Record<string, any> = {};
    for (const layer of ALL) {
      const raw = await readCachedLayer(layer);
      if (LINE_LAYERS.includes(layer) || layer === 'landingPoints') {
        next[layer] = normalizeFeatureCollection(raw);
      } else {
        next[layer] = pointsToFeatureCollection(raw ?? []);
      }
    }
    setShapes(next as Record<LayerKey, any>);
  }, []);

  useEffect(() => {
    loadCache();
  }, [loadCache]);

  const onPressFeature = (e: any) => {
    const f = e?.features?.[0];
    if (f) setSelected(f.properties ?? {});
  };

  return (
    <View style={styles.container}>
      <OfflineBanner visible={offline} />
      <MapLibreGL.MapView style={styles.map} mapStyle={config.mapStyleUrl} logoEnabled={false}>
        <MapLibreGL.Camera defaultSettings={{ centerCoordinate: [5.2913, 52.1326], zoomLevel: 5 }} />

        {LINE_LAYERS.map((layer) =>
          enabled[layer] ? (
            <MapLibreGL.ShapeSource
              key={layer}
              id={`src-${layer}`}
              shape={shapes[layer] ?? EMPTY_FC}
              onPress={onPressFeature}
            >
              <MapLibreGL.LineLayer
                id={`line-${layer}`}
                style={{ lineColor: LAYER_META[layer].color, lineWidth: 1.6, lineOpacity: 0.85 }}
              />
            </MapLibreGL.ShapeSource>
          ) : null
        )}

        {POINT_LAYERS.map((layer) =>
          enabled[layer] ? (
            <MapLibreGL.ShapeSource
              key={layer}
              id={`src-${layer}`}
              shape={shapes[layer] ?? EMPTY_FC}
              onPress={onPressFeature}
            >
              <MapLibreGL.CircleLayer
                id={`circle-${layer}`}
                style={{
                  circleColor: LAYER_META[layer].color,
                  circleRadius: layer === 'datacenters' ? 6 : 5,
                  circleStrokeColor: '#ffffff',
                  circleStrokeWidth: 1.2,
                  circleOpacity: 0.9,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null
        )}
      </MapLibreGL.MapView>

      {/* Legend / layer toggles */}
      <View style={styles.legend}>
        <TouchableOpacity onPress={() => setLegendOpen((o) => !o)} style={styles.legendHeader}>
          <Text style={styles.legendTitle}>Layers</Text>
          <Text style={styles.legendChevron}>{legendOpen ? '▾' : '▸'}</Text>
        </TouchableOpacity>
        {legendOpen &&
          ALL.map((layer) => {
            const count = shapes[layer]?.features?.length ?? 0;
            return (
              <TouchableOpacity
                key={layer}
                style={styles.legendRow}
                onPress={() => setEnabled((s) => ({ ...s, [layer]: !s[layer] }))}
              >
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: LAYER_META[layer].color, opacity: enabled[layer] ? 1 : 0.25 },
                  ]}
                />
                <Text style={[styles.legendLabel, !enabled[layer] && styles.legendLabelOff]}>
                  {LAYER_META[layer].label}
                </Text>
                <Text style={styles.legendCount}>{count}</Text>
              </TouchableOpacity>
            );
          })}
      </View>

      {/* Feature detail sheet */}
      {selected && (
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <ScrollView style={{ maxHeight: 220 }}>
            <Text style={styles.sheetTitle}>{selected.name ?? 'Feature'}</Text>
            {Object.entries(selected)
              .filter(([k]) => !['name', 'score'].includes(k))
              .slice(0, 12)
              .map(([k, v]) => (
                <Text key={k} style={styles.sheetRow}>
                  <Text style={styles.sheetKey}>{k}: </Text>
                  {String(v)}
                </Text>
              ))}
          </ScrollView>
          <TouchableOpacity style={styles.sheetClose} onPress={() => setSelected(null)}>
            <Text style={styles.sheetCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  legend: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 10,
    padding: 10,
    minWidth: 180,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  legendHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legendTitle: { fontWeight: '800', fontSize: 14, color: '#0f172a' },
  legendChevron: { fontSize: 14, color: '#334155' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  legendLabel: { flex: 1, fontSize: 13, color: '#0f172a' },
  legendLabelOff: { color: '#94a3b8', textDecorationLine: 'line-through' },
  legendCount: { fontSize: 11, color: '#64748b' },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 20,
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  sheetRow: { fontSize: 13, color: '#334155', marginBottom: 3 },
  sheetKey: { fontWeight: '700', color: '#0f172a' },
  sheetClose: { marginTop: 10, alignSelf: 'flex-end' },
  sheetCloseText: { color: '#2563eb', fontWeight: '700' },
});
