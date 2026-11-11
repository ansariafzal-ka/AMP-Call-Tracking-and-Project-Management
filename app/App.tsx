import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { ContactsScreen } from './src/screens/ContactsScreen';
import { FollowUpsScreen } from './src/screens/FollowUpsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { BottomNavBar, TabType } from './src/components/BottomNavBar';
import { colors } from './src/theme';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync } from './src/services/notificationService';

function MainNavigator() {
  const { user, isLoading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [showSettings, setShowSettings] = useState<boolean>(false);

  useEffect(() => {
    // Request notification permissions & configure Android channel on app launch
    registerForPushNotificationsAsync();

    // Listen for notification taps to navigate directly to Follow-ups tab
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.screen === 'followups') {
        setShowSettings(false);
        setActiveTab('followups');
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setActiveTab('dashboard');
      setShowSettings(false);
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
    if (showSettings) {
      return <SettingsScreen onBack={() => setShowSettings(false)} />;
    }

    const renderActiveScreen = () => {
      switch (activeTab) {
        case 'contacts':
          return <ContactsScreen />;
        case 'followups':
          return <FollowUpsScreen />;
        case 'dashboard':
        default:
          return <DashboardScreen onNavigateToSettings={() => setShowSettings(true)} />;
      }
    };

    return (
      <View style={styles.authenticatedRoot}>
        <View style={styles.screenContainer}>
          {renderActiveScreen()}
        </View>
        <BottomNavBar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setShowSettings(false);
            setActiveTab(tab);
          }}
        />
      </View>
    );
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
  authenticatedRoot: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  screenContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
