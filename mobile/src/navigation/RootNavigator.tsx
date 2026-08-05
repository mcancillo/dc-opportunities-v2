import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { MapScreen } from '../screens/MapScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export function MainTabs() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: route.name !== 'Map',
          tabBarActiveTintColor: '#2563eb',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>{route.name === 'Map' ? '🗺️' : '⚙️'}</Text>
          ),
        })}
      >
        <Tab.Screen name="Map" component={MapScreen} />
        <Tab.Screen name="Offline &amp; Account" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
