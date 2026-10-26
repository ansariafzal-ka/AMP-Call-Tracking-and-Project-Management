import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  TouchableOpacity,
} from 'react-native';
import { colors } from '../theme';

interface AppInputProps extends TextInputProps {
  label: string;
  error?: string | null;
  isPassword?: boolean;
}

export const AppInput: React.FC<AppInputProps> = ({
  label,
  error,
  isPassword = false,
  style,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputContainer,
          Boolean(error) && styles.inputError,
        ]}
      >
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.text.secondary}
          secureTextEntry={isPassword && !showPassword}
          autoCapitalize="none"
          showSoftInputOnFocus={true}
          {...props}
        />
        {isPassword && (
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword((prev) => !prev)}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {Boolean(error) && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    width: '100%',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.paper,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
  },
  inputError: {
    borderColor: colors.status.error,
  },
  input: {
    flex: 1,
    height: 48,
    paddingVertical: 0,
    color: colors.text.primary,
    fontSize: 15,
  },
  eyeButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  eyeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary.light,
  },
  errorText: {
    fontSize: 12,
    color: colors.status.error,
    marginTop: 4,
    marginLeft: 2,
  },
});
