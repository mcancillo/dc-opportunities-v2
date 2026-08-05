import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAppAuth } from './src/auth/AuthContext';
import { SignInScreen } from './src/screens/SignInScreen';
import { NotInvitedScreen } from './src/screens/NotInvitedScreen';
import { MainTabs } from './src/navigation/RootNavigator';

function Gate() {
  const { state } = useAppAuth();
  switch (state.status) {
    case 'loading':
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      );
    case 'signedOut':
      return <SignInScreen />;
    case 'notInvited':
      return <NotInvitedScreen reason={state.reason} />;
    case 'signedIn':
      return <MainTabs />;
  }
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b1f33' },
});
