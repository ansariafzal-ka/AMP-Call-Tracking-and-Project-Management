import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'amp_auth_token';
const USER_KEY = 'amp_auth_user';
const PENDING_CALL_KEY = 'amp_pending_call';

export interface PendingCall {
  number: string; // digits only
  started_at: number; // timestamp in ms
}

export async function saveAuthToken(token: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(TOKEN_KEY, token);
      }
    } else {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    }
  } catch (error) {
    console.error('Error saving auth token:', error);
  }
}

export async function getAuthToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(TOKEN_KEY);
      }
      return null;
    } else {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    }
  } catch (error) {
    console.error('Error retrieving auth token:', error);
    return null;
  }
}

export async function removeAuthToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(TOKEN_KEY);
      }
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  } catch (error) {
    console.error('Error deleting auth token:', error);
  }
}

export async function saveUserData(user: any): Promise<void> {
  try {
    const json = JSON.stringify(user);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(USER_KEY, json);
      }
    } else {
      await SecureStore.setItemAsync(USER_KEY, json);
    }
  } catch (error) {
    console.error('Error saving user data:', error);
  }
}

export async function getUserData(): Promise<any | null> {
  try {
    let json: string | null = null;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        json = window.localStorage.getItem(USER_KEY);
      }
    } else {
      json = await SecureStore.getItemAsync(USER_KEY);
    }
    return json ? JSON.parse(json) : null;
  } catch (error) {
    console.error('Error reading user data:', error);
    return null;
  }
}

export async function removeUserData(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(USER_KEY);
      }
    } else {
      await SecureStore.deleteItemAsync(USER_KEY);
    }
  } catch (error) {
    console.error('Error removing user data:', error);
  }
}

export async function savePendingCall(call: PendingCall): Promise<void> {
  try {
    const json = JSON.stringify(call);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(PENDING_CALL_KEY, json);
      }
    } else {
      await SecureStore.setItemAsync(PENDING_CALL_KEY, json);
    }
  } catch (error) {
    console.error('Error saving pending call:', error);
  }
}

export async function getPendingCall(): Promise<PendingCall | null> {
  try {
    let json: string | null = null;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        json = window.localStorage.getItem(PENDING_CALL_KEY);
      }
    } else {
      json = await SecureStore.getItemAsync(PENDING_CALL_KEY);
    }
    return json ? JSON.parse(json) : null;
  } catch (error) {
    console.error('Error reading pending call:', error);
    return null;
  }
}

export async function clearPendingCall(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(PENDING_CALL_KEY);
      }
    } else {
      await SecureStore.deleteItemAsync(PENDING_CALL_KEY);
    }
  } catch (error) {
    console.error('Error clearing pending call:', error);
  }
}

export async function popPendingCall(): Promise<PendingCall | null> {
  try {
    const call = await getPendingCall();
    if (call) {
      await clearPendingCall();
    }
    return call;
  } catch (error) {
    console.error('Error popping pending call:', error);
    return null;
  }
}

const LAST_CONTACT_COUNT_PREFIX = 'amp_last_contact_count_';

export async function getLastContactCount(userId: number | string): Promise<number | null> {
  try {
    const key = `${LAST_CONTACT_COUNT_PREFIX}${userId}`;
    let val: string | null = null;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        val = window.localStorage.getItem(key);
      }
    } else {
      val = await SecureStore.getItemAsync(key);
    }
    return val !== null && !isNaN(parseInt(val, 10)) ? parseInt(val, 10) : null;
  } catch (error) {
    console.warn('Error reading last contact count:', error);
    return null;
  }
}

export async function saveLastContactCount(userId: number | string, count: number): Promise<void> {
  try {
    const key = `${LAST_CONTACT_COUNT_PREFIX}${userId}`;
    const str = String(count);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, str);
      }
    } else {
      await SecureStore.setItemAsync(key, str);
    }
  } catch (error) {
    console.warn('Error saving last contact count:', error);
  }
}
