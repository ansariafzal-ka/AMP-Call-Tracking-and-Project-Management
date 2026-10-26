/**
 * AMP Brand Color System
 * Extracted from official AMP portal (https://ampworld.in/)
 */

export const colors = {
  // Brand Primary (Maroon / Burgundy)
  primary: {
    main: '#801321',
    dark: '#4B0A12',
    deep: '#3B070D',
    light: '#9E1528',
    crimson: '#B81E34',
  },

  // Secondary & Accents (Gold / Amber)
  accent: {
    gold: '#C89D4B',
    amber: '#D4A854',
    lightGold: '#E5B869',
    goldTint: '#FEF9EE',
  },

  // Surfaces & Backgrounds
  background: {
    default: '#FBF2F3', // Soft blush off-white signature background
    paper: '#FFFFFF',   // Cards, modals, lists
    subtle: '#F3E8E9',
  },

  // Typography & Neutrals
  text: {
    primary: '#1E293B',   // High-contrast slate
    secondary: '#64748B', // Muted subtitle slate
    inverse: '#FFFFFF',   // White text on dark/colored background
    brand: '#801321',     // Brand maroon text
    accent: '#C89D4B',    // Accent gold text
  },

  // Borders & Dividers
  border: {
    subtle: '#F1E3E5',
    default: '#E2E8F0',
    strong: '#CBD5E1',
    accent: '#D4A854',
  },

  // Status & Feedback
  status: {
    success: '#10B981',
    successBg: '#ECFDF5',
    error: '#EF4444',
    errorBg: '#FEF2F2',
    warning: '#F59E0B',
    warningBg: '#FFFBEB',
    info: '#3B82F6',
    infoBg: '#EFF6FF',
  },
} as const;

export type Colors = typeof colors;
