import { requireNativeModule } from 'expo-modules-core';

let NativeModule: any = null;
try {
  NativeModule = requireNativeModule('CallLog');
} catch {
  NativeModule = null;
}

export default {
  load(limit: number): Promise<any[]> {
    if (!NativeModule || typeof NativeModule.load !== 'function') {
      return Promise.reject(new Error('CallLog native module not available'));
    }
    return NativeModule.load(limit);
  },
};
