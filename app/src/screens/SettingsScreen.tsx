import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Linking,
  PermissionsAndroid,
  AppState,
  AppStateStatus,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import { changePasswordApi } from '../services/auth';

interface SettingsScreenProps {
  onBack: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack }) => {
  const { user, token, logout } = useAuth();
  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 20;

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Permission state
  const [hasCallLogPermission, setHasCallLogPermission] = useState<boolean | null>(null);

  const checkPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_CALL_LOG
        );
        setHasCallLogPermission(granted);
      } catch (err) {
        console.warn('Failed to check READ_CALL_LOG permission:', err);
        setHasCallLogPermission(false);
      }
    } else {
      setHasCallLogPermission(true);
    }
  }, []);

  useEffect(() => {
    checkPermission();

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkPermission();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [checkPermission]);

  // Handle password change submit
  const handleUpdatePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    const cleanCurrent = currentPassword.trim();
    const cleanNew = newPassword.trim();
    const cleanConfirm = confirmPassword.trim();

    if (!cleanCurrent || !cleanNew || !cleanConfirm) {
      setPasswordError('All password fields are required');
      return;
    }

    if (cleanNew.length < 8) {
      setPasswordError('New password must be at least 8 characters long');
      return;
    }

    if (cleanNew !== cleanConfirm) {
      setPasswordError('New password and confirm password do not match');
      return;
    }

    if (cleanNew === cleanCurrent) {
      setPasswordError('New password must be different from current password');
      return;
    }

    if (!token) {
      setPasswordError('You are not logged in. Please sign in again.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await changePasswordApi(
        {
          current_password: cleanCurrent,
          new_password: cleanNew,
        },
        token
      );

      setPasswordSuccess('Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to update password. Please try again.';
      setPasswordError(msg);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.contentContainer,
          {
            paddingTop: topInset + 16,
            paddingBottom: 40,
            paddingHorizontal: 20,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header with Back Button */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="arrow-left" size={22} color={colors.primary.main} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.headerRightPlaceholder} />
        </View>

        {/* SECTION A: Profile Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Profile</Text>

          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>NAME</Text>
            <Text style={styles.profileValue} numberOfLines={1}>
              {user?.fullName || user?.name || '—'}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>EMAIL</Text>
            <Text style={styles.profileValue} numberOfLines={1}>
              {user?.email || '—'}
            </Text>
          </View>

          {Boolean(user?.role) && (
            <>
              <View style={styles.divider} />
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>ROLE</Text>
                <Text style={styles.profileValue} numberOfLines={1}>
                  {user?.role}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* SECTION B: Change Password Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Change Password</Text>

          {/* Current Password Input */}
          <Text style={styles.inputLabel}>Current password</Text>
          <View style={styles.passwordInputContainer}>
            <TextInput
              style={styles.passwordTextInput}
              placeholder="Enter current password"
              placeholderTextColor={colors.text.secondary}
              secureTextEntry={!showCurrentPassword}
              value={currentPassword}
              onChangeText={(text) => {
                setCurrentPassword(text);
                if (passwordError) setPasswordError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowCurrentPassword((prev) => !prev)}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather
                name={showCurrentPassword ? 'eye-off' : 'eye'}
                size={18}
                color={colors.text.secondary}
              />
            </TouchableOpacity>
          </View>

          {/* New Password Input */}
          <Text style={styles.inputLabel}>New password</Text>
          <View style={styles.passwordInputContainer}>
            <TextInput
              style={styles.passwordTextInput}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.text.secondary}
              secureTextEntry={!showNewPassword}
              value={newPassword}
              onChangeText={(text) => {
                setNewPassword(text);
                if (passwordError) setPasswordError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowNewPassword((prev) => !prev)}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather
                name={showNewPassword ? 'eye-off' : 'eye'}
                size={18}
                color={colors.text.secondary}
              />
            </TouchableOpacity>
          </View>

          {/* Confirm New Password Input */}
          <Text style={styles.inputLabel}>Confirm new password</Text>
          <View style={styles.passwordInputContainer}>
            <TextInput
              style={styles.passwordTextInput}
              placeholder="Re-enter new password"
              placeholderTextColor={colors.text.secondary}
              secureTextEntry={!showConfirmPassword}
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                if (passwordError) setPasswordError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowConfirmPassword((prev) => !prev)}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather
                name={showConfirmPassword ? 'eye-off' : 'eye'}
                size={18}
                color={colors.text.secondary}
              />
            </TouchableOpacity>
          </View>

          {/* Update Password Button */}
          <TouchableOpacity
            style={[styles.updatePasswordBtn, isUpdatingPassword && styles.updatePasswordBtnDisabled]}
            onPress={handleUpdatePassword}
            disabled={isUpdatingPassword}
            activeOpacity={0.85}
          >
            {isUpdatingPassword ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.updatePasswordBtnText}>Update Password</Text>
            )}
          </TouchableOpacity>

          {/* Red Error Message under button */}
          {Boolean(passwordError) && (
            <Text style={styles.errorMessageText}>{passwordError}</Text>
          )}

          {/* Green Success Message under button */}
          {Boolean(passwordSuccess) && (
            <Text style={styles.successMessageText}>{passwordSuccess}</Text>
          )}
        </View>

        {/* SECTION C: Permissions Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Permissions</Text>

          <View style={styles.permissionRow}>
            <Text style={styles.permissionLabel}>Call log access</Text>
            {hasCallLogPermission === null ? (
              <ActivityIndicator size="small" color={colors.primary.main} />
            ) : hasCallLogPermission ? (
              <View style={[styles.statusPill, styles.pillGranted]}>
                <Feather name="check" size={12} color="#065F46" style={{ marginRight: 4 }} />
                <Text style={styles.pillTextGranted}>Granted</Text>
              </View>
            ) : (
              <View style={[styles.statusPill, styles.pillNotGranted]}>
                <Feather name="x" size={12} color="#991B1B" style={{ marginRight: 4 }} />
                <Text style={styles.pillTextNotGranted}>Not granted</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.openSettingsBtn}
            onPress={() => Linking.openSettings()}
            activeOpacity={0.85}
          >
            <Text style={styles.openSettingsBtnText}>Open Phone Settings</Text>
          </TouchableOpacity>
        </View>

        {/* SECTION D: About Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>About</Text>

          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App version</Text>
            <Text style={styles.aboutValue}>{appVersion}</Text>
          </View>
        </View>

        {/* SECTION E: Sign Out Button at Bottom */}
        <TouchableOpacity
          style={styles.bottomSignOutBtn}
          onPress={logout}
          activeOpacity={0.8}
        >
          <Feather name="log-out" size={18} color={colors.primary.main} style={{ marginRight: 8 }} />
          <Text style={styles.bottomSignOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    padding: 6,
    marginLeft: -6,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary.main,
  },
  headerRightPlaceholder: {
    width: 32,
  },

  // Card
  card: {
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 14,
  },

  // Profile Section
  profileRow: {
    paddingVertical: 4,
  },
  profileLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  profileValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },

  // Change Password Section
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 6,
    marginTop: 6,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 10,
  },
  passwordTextInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
    height: 48,
    paddingVertical: 0,
  },
  eyeBtn: {
    padding: 6,
  },
  updatePasswordBtn: {
    height: 48,
    backgroundColor: colors.primary.main,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  updatePasswordBtnDisabled: {
    opacity: 0.7,
  },
  updatePasswordBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  errorMessageText: {
    fontSize: 13,
    color: colors.status.error,
    marginTop: 10,
    textAlign: 'center',
    fontWeight: '500',
  },
  successMessageText: {
    fontSize: 13,
    color: '#16A34A',
    marginTop: 10,
    textAlign: 'center',
    fontWeight: '600',
  },

  // Permissions Section
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  permissionLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.primary,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 9999,
  },
  pillGranted: {
    backgroundColor: '#ECFDF5',
  },
  pillNotGranted: {
    backgroundColor: '#FEF2F2',
  },
  pillTextGranted: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
  },
  pillTextNotGranted: {
    fontSize: 12,
    fontWeight: '600',
    color: '#991B1B',
  },
  openSettingsBtn: {
    height: 44,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openSettingsBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary.main,
  },

  // About Section
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  aboutLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.primary,
  },
  aboutValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.secondary,
  },

  // Sign Out Button at Bottom
  bottomSignOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    marginTop: 4,
    marginBottom: 16,
  },
  bottomSignOutText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary.main,
  },
});
