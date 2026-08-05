import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function OfflineBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Offline — showing cached maps &amp; data</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#b45309',
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  text: { color: 'white', fontSize: 13, fontWeight: '600' },
});
