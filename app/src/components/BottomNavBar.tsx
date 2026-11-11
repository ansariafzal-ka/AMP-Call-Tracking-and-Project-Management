import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme';

export type TabType = 'dashboard' | 'contacts' | 'followups';

interface TabItemConfig {
  key: TabType;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}

const TABS: TabItemConfig[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { key: 'contacts', label: 'Contacts', icon: 'users' },
  { key: 'followups', label: 'Follow-ups', icon: 'clock' },
];

interface BottomNavBarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onSelectTab,
}) => {
  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const iconColor = isActive ? colors.primary.main : colors.text.secondary;

        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabButton}
            onPress={() => onSelectTab(tab.key)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            {isActive && <View style={styles.activeBar} />}
            <View style={[styles.iconWrapper, isActive && styles.activeIconWrapper]}>
              <Feather name={tab.icon} size={20} color={iconColor} />
            </View>
            <Text
              style={[
                styles.tabLabel,
                isActive ? styles.activeTabLabel : styles.inactiveTabLabel,
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    position: 'relative',
  },
  activeBar: {
    position: 'absolute',
    top: -6,
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary.main,
  },
  iconWrapper: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIconWrapper: {
    transform: [{ scale: 1.05 }],
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 1,
  },
  activeTabLabel: {
    color: colors.primary.main,
    fontWeight: '700',
  },
  inactiveTabLabel: {
    color: colors.text.secondary,
    fontWeight: '500',
  },
});

