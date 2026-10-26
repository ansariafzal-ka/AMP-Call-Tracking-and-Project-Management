import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { colors } from './src/theme';

function MainNavigator() {
  const { user, isLoading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<'login' | 'register'>('login');
  const [authenticatedScreen, setAuthenticatedScreen] = useState<'dashboard' | 'settings'>('dashboard');

  useEffect(() => {
    if (!user) {
      setAuthenticatedScreen('dashboard');
    }
  }, [user]);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary.main} />
      </View>
    );
  }

  if (user) {
    if (authenticatedScreen === 'settings') {
      return <SettingsScreen onBack={() => setAuthenticatedScreen('dashboard')} />;
    }
    return <DashboardScreen onNavigateToSettings={() => setAuthenticatedScreen('settings')} />;
  }

  if (currentScreen === 'register') {
    return <RegisterScreen onNavigateToLogin={() => setCurrentScreen('login')} />;
  }

  return <LoginScreen onNavigateToRegister={() => setCurrentScreen('register')} />;
}

export default function App() {
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <AuthProvider>
        <MainNavigator />
      </AuthProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
