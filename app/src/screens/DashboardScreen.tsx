import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Platform,
  PermissionsAndroid,
  AppState,
  AppStateStatus,
  Alert,
  StatusBar,
  Image,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import {
  fetchCalls,
  createCallRecord,
  updateCallRecord,
  CallItem,
  CallSummary,
  CallOutcome,
} from '../services/callsApi';
import {
  savePendingCall,
  getPendingCall,
  clearPendingCall,
} from '../services/storage';
import { findMatchingRecentOutgoingCall } from '../services/callLogService';

export function formatDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  if (sec === 0) return '0s';

  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const remainingSec = sec % 60;

  if (hours > 0) {
    const formattedMinutes = String(minutes).padStart(2, '0');
    return `${hours}h ${formattedMinutes}m`;
  }

  if (minutes > 0) {
    const formattedSeconds = String(remainingSec).padStart(2, '0');
    return `${minutes}m ${formattedSeconds}s`;
  }

  return `${remainingSec}s`;
}

export function formatDisplayDateTime(rawDate: string | Date | number | undefined): string {
  if (!rawDate) return '—';

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Direct parse if string like "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss" to preserve exact phone clock time
  if (typeof rawDate === 'string') {
    const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      const year = match[1];
      const monthIdx = parseInt(match[2], 10) - 1;
      const day = match[3];
      let hours = parseInt(match[4], 10);
      const minutes = match[5];
      const month = months[monthIdx] || match[2];
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const formattedHours = String(hours).padStart(2, '0');
      return `${day} ${month} ${year}, ${formattedHours}:${minutes} ${ampm}`;
    }
  }

  const date = new Date(rawDate);
  if (isNaN(date.getTime())) return String(rawDate);

  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const formattedHours = String(hours).padStart(2, '0');

  return `${day} ${month} ${year}, ${formattedHours}:${minutes} ${ampm}`;
}

const OUTCOME_OPTIONS: { key: CallOutcome; label: string }[] = [
  { key: 'interested', label: 'Interested' },
  { key: 'not_interested', label: 'Not Interested' },
  { key: 'unanswered', label: 'Unanswered' },
  { key: 'follow_up_required', label: 'Follow-up Required' },
];

const FILTER_OUTCOME_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'interested', label: 'Interested' },
  { key: 'not_interested', label: 'Not Interested' },
  { key: 'unanswered', label: 'Unanswered' },
  { key: 'follow_up_required', label: 'Follow-up Required' },
  { key: 'not_set', label: 'Not set' },
];

const FILTER_STATUS_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'answered', label: 'Answered' },
  { key: 'not_answered', label: 'Not answered' },
];

const OUTCOME_FILTER_LABELS: Record<string, string> = {
  interested: 'Interested',
  not_interested: 'Not Interested',
  unanswered: 'Unanswered',
  follow_up_required: 'Follow-up Required',
  not_set: 'Not set',
};

const STATUS_FILTER_LABELS: Record<string, string> = {
  answered: 'Answered',
  not_answered: 'Not answered',
};

// ==========================================
// Isolated Dialer Card
// ==========================================
interface DialerCardProps {
  onCall: (cleanNumber: string) => Promise<boolean>;
  disabled?: boolean;
}

const DialerCard: React.FC<DialerCardProps> = React.memo(({ onCall, disabled }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const cleanDigits = phoneNumber.replace(/\D/g, '');
  const isValid = cleanDigits.length >= 10;

  const handlePress = async () => {
    if (!isValid) {
      Alert.alert('Invalid Number', 'Please enter at least 10 digits.');
      return;
    }
    const success = await onCall(cleanDigits);
    if (success) {
      setPhoneNumber('');
    }
  };

  const isEnabled = isValid && !disabled;
  const iconAndTextColor = isEnabled ? '#FFFFFF' : '#94A3B8';

  return (
    <View style={styles.card}>
      <View style={styles.dialerHeader}>
        <Text style={styles.dialerTitle}>Initiate Call</Text>
        <Text style={styles.dialerSubtitle}>Only calls started here are tracked</Text>
      </View>

      <View style={styles.inputRow}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.phoneInput}
            placeholder="Enter phone number"
            placeholderTextColor={colors.text.secondary}
            keyboardType="phone-pad"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            maxLength={15}
            autoCorrect={false}
          />
          {phoneNumber.length > 0 && (
            <TouchableOpacity
              onPress={() => setPhoneNumber('')}
              style={styles.clearBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.callBtn, isEnabled ? styles.callBtnEnabled : styles.callBtnDisabled]}
          disabled={!isEnabled}
          onPress={handlePress}
          activeOpacity={0.85}
        >
          <Feather name="phone" size={18} color={iconAndTextColor} />
          <Text style={[styles.callBtnText, { color: iconAndTextColor }]}>Call</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ==========================================
// Main Dashboard Screen
// ==========================================
interface DashboardScreenProps {
  onNavigateToSettings?: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ onNavigateToSettings }) => {
  const { user, token, logout } = useAuth();
  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 20;

  const [permissionDenied, setPermissionDenied] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [summary, setSummary] = useState<CallSummary>({ total_calls: 0, total_duration_seconds: 0 });
  const [filteredTotal, setFilteredTotal] = useState<number>(0);
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Search state (debounced by 400ms)
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Active filters
  const [selectedOutcomeFilter, setSelectedOutcomeFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  // Filter bottom sheet modal state
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [draftOutcome, setDraftOutcome] = useState<string>('all');
  const [draftStatus, setDraftStatus] = useState<string>('all');

  const activeFilterCount =
    (selectedOutcomeFilter !== 'all' ? 1 : 0) + (selectedStatusFilter !== 'all' ? 1 : 0);

  // Debounce search input by 400ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 400);

    return () => {
      clearTimeout(handler);
    };
  }, [searchInput]);

  const handleOpenFilterModal = useCallback(() => {
    setDraftOutcome(selectedOutcomeFilter);
    setDraftStatus(selectedStatusFilter);
    setIsFilterModalVisible(true);
  }, [selectedOutcomeFilter, selectedStatusFilter]);

  const handleCloseFilterModal = useCallback(() => {
    setIsFilterModalVisible(false);
  }, []);

  const handleClearFilterDrafts = useCallback(() => {
    setDraftOutcome('all');
    setDraftStatus('all');
  }, []);

  const handleApplyFilters = useCallback(() => {
    setSelectedOutcomeFilter(draftOutcome);
    setSelectedStatusFilter(draftStatus);
    setIsFilterModalVisible(false);
  }, [draftOutcome, draftStatus]);

  const handleClearAllFiltersAndSearch = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    setSelectedOutcomeFilter('all');
    setSelectedStatusFilter('all');
  }, []);

  // Update Call bottom sheet state
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [selectedCall, setSelectedCall] = useState<CallItem | null>(null);
  const [isAutoPrompt, setIsAutoPrompt] = useState(false);
  const [purposeText, setPurposeText] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcome>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // Required field validation for Update Call
  const isPurposeValid = purposeText.trim().length > 0;
  const isOutcomeValid = selectedOutcome !== null;
  const isUpdateValid = isPurposeValid && isOutcomeValid;

  const isSyncingRef = useRef(false);

  // Open Update Call bottom sheet
  const handleOpenUpdateSheet = useCallback((call: CallItem, isAuto: boolean = false) => {
    setSelectedCall(call);
    setPurposeText(call.purpose || '');
    setSelectedOutcome(call.outcome || null);
    setIsAutoPrompt(isAuto);
    setSheetError(null);
    setIsSheetVisible(true);
  }, []);

  const handleCloseSheet = useCallback(() => {
    if (isSaving) return;
    setIsSheetVisible(false);
    setSelectedCall(null);
    setSheetError(null);
  }, [isSaving]);

  // Load calls and summary
  const loadCalls = useCallback(
    async (
      offset: number = 0,
      isRefresh: boolean = false,
      search: string = debouncedSearch,
      outcome: string = selectedOutcomeFilter,
      status: string = selectedStatusFilter
    ) => {
      if (!token) return;

      try {
        if (offset === 0 && !isRefresh) {
          setIsLoading(true);
        }

        const data = await fetchCalls(
          {
            limit: 50,
            offset,
            search: search.trim() ? search.trim() : undefined,
            outcome: outcome !== 'all' ? outcome : undefined,
            status: status !== 'all' ? status : undefined,
          },
          token
        );

        if (offset === 0) {
          setCalls(data.calls);
          setSummary(data.summary);
          setFilteredTotal(data.filtered_total);
          setHasMore(data.calls.length < data.filtered_total);
        } else {
          setCalls((prev) => {
            const next = [...prev, ...data.calls];
            setHasMore(next.length < data.filtered_total);
            return next;
          });
          setFilteredTotal(data.filtered_total);
        }
      } catch (err: any) {
        console.error('Error fetching calls:', err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    },
    [token, debouncedSearch, selectedOutcomeFilter, selectedStatusFilter]
  );

  useEffect(() => {
    if (token) {
      loadCalls(0, false, debouncedSearch, selectedOutcomeFilter, selectedStatusFilter);
    }
  }, [token, debouncedSearch, selectedOutcomeFilter, selectedStatusFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadCalls(0, true, debouncedSearch, selectedOutcomeFilter, selectedStatusFilter);
  };

  const handleLoadMore = async () => {
    if (isLoading || isRefreshing || isLoadingMore || !hasMore || !token) return;
    setIsLoadingMore(true);
    await loadCalls(calls.length, false, debouncedSearch, selectedOutcomeFilter, selectedStatusFilter);
  };

  // Check and sync any pending call when returning to foreground
  const checkAndSyncPendingCall = useCallback(async () => {
    if (isSyncingRef.current || !token) return;

    try {
      const pending = await getPendingCall();
      if (!pending) return;

      const now = Date.now();
      if (now - pending.started_at > 3600 * 1000) {
        console.log('Discarding expired pending call (>1hr)');
        await clearPendingCall();
        return;
      }

      isSyncingRef.current = true;
      setSyncMessage('Processing recent call log...');

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const match = await findMatchingRecentOutgoingCall(pending.number, pending.started_at);

      if (match) {
        try {
          const createdCall = await createCallRecord(
            {
              contact_number: match.contact_number,
              duration_seconds: match.duration_seconds,
              status: match.status,
              called_at: match.called_at,
            },
            token
          );
          await clearPendingCall();
          setSyncMessage('Call recorded successfully!');
          setTimeout(() => setSyncMessage(null), 3000);
          await loadCalls(0, true);

          // Automatic prompt: when a new call is saved successfully, automatically open Update Call sheet
          if (createdCall && createdCall.id) {
            handleOpenUpdateSheet(createdCall, true);
          }
        } catch (postErr: any) {
          console.error('Failed to post call record to server:', postErr);
          setSyncError('Failed to record call. Will retry when app returns.');
          setTimeout(() => setSyncError(null), 5000);
        }
      } else {
        console.log('No matching call found in log. Discarding pending call.');
        await clearPendingCall();
      }
    } catch (err) {
      console.warn('Error checking pending call:', err);
    } finally {
      isSyncingRef.current = false;
      setSyncMessage(null);
    }
  }, [token, loadCalls, handleOpenUpdateSheet]);

  useEffect(() => {
    checkAndSyncPendingCall();

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkAndSyncPendingCall();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [checkAndSyncPendingCall]);

  // Handle call initiation
  const handleInitiateCall = async (cleanNumber: string): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const hasPermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_CALL_LOG
        );

        if (!hasPermission) {
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
            {
              title: 'Call Log Permission Required',
              message:
                'AMP Call Tracker needs access to your call log to detect and record call duration.',
              buttonPositive: 'Grant Permission',
              buttonNegative: 'Cancel',
            }
          );

          if (result !== PermissionsAndroid.RESULTS.GRANTED) {
            setPermissionDenied(true);
            Alert.alert(
              'Permission Required',
              'Call log permission is required to track calls placed through this app. Please enable it in Settings.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
            );
            return false;
          }
        }
        setPermissionDenied(false);
      } catch (err: any) {
        console.warn('Permission request error:', err);
        setPermissionDenied(true);
        Alert.alert('Permission Error', err?.message || 'Could not verify call log permissions.');
        return false;
      }
    }

    try {
      await savePendingCall({
        number: cleanNumber,
        started_at: Date.now(),
      });

      const telUrl = `tel:${cleanNumber}`;
      await Linking.openURL(telUrl);
      return true;
    } catch (err: any) {
      console.error('Failed to open dialer:', err);
      await clearPendingCall();
      Alert.alert('Dialer Error', `Could not open dialer: ${err?.message || err}`);
      return false;
    }
  };

  // Handle Save in Update Call Sheet
  const handleSaveUpdate = async () => {
    if (!selectedCall || !token) return;

    const cleanPurpose = purposeText.trim();
    if (!cleanPurpose) {
      setSheetError('Purpose of call is required.');
      return;
    }

    if (!selectedOutcome) {
      setSheetError('Please select an outcome.');
      return;
    }

    setIsSaving(true);
    setSheetError(null);

    try {
      const updated = await updateCallRecord(
        selectedCall.id,
        {
          purpose: cleanPurpose,
          outcome: selectedOutcome,
        },
        token
      );

      // Close the sheet
      setIsSheetVisible(false);
      setSelectedCall(null);

      // Update card in list in-place without reloading whole list
      setCalls((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
      );
    } catch (err: any) {
      console.error('Failed to update call:', err);
      const msg =
        err.response?.data?.message || err.message || 'Failed to update call. Please try again.';
      setSheetError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const renderStatusPill = (isAnswered: boolean) => {
    const pillColor = isAnswered ? '#065F46' : '#6B7280';
    const pillBg = isAnswered ? '#ECFDF5' : '#F3F4F6';
    const iconName = isAnswered ? 'phone-incoming' : 'phone-missed';
    const label = isAnswered ? 'Answered' : 'Not answered';

    return (
      <View style={[styles.pillBase, { backgroundColor: pillBg }]}>
        <Feather name={iconName} size={12} color={pillColor} style={{ marginRight: 4 }} />
        <Text style={[styles.pillText, { color: pillColor }]}>{label}</Text>
      </View>
    );
  };

  const renderOutcomePill = (outcome: CallOutcome) => {
    let color = '#6B7280';
    let bg = '#F9FAFB';
    let label = 'Not set';

    switch (outcome) {
      case 'interested':
        color = '#065F46';
        bg = '#ECFDF5';
        label = 'Interested';
        break;
      case 'not_interested':
        color = '#991B1B';
        bg = '#FEF2F2';
        label = 'Not Interested';
        break;
      case 'follow_up_required':
        color = '#92400E';
        bg = '#FEF3C7';
        label = 'Follow-up Required';
        break;
      case 'unanswered':
        color = '#374151';
        bg = '#F3F4F6';
        label = 'Unanswered';
        break;
      default:
        break;
    }

    return (
      <View style={[styles.pillBase, { backgroundColor: bg }]}>
        <Text style={[styles.pillText, { color }]}>{label}</Text>
      </View>
    );
  };

  const renderCallItem = ({ item }: { item: CallItem }) => {
    const isAnswered = item.status === 'answered';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => handleOpenUpdateSheet(item, false)}
      >
        {/* Row 1: Contact Number, Status Pill */}
        <View style={[styles.cardRow, styles.cardRowHeader]}>
          <Text style={styles.contactNumberText}>{item.contact_number}</Text>
          {renderStatusPill(isAnswered)}
        </View>

        {/* Row 2: Outcome Pill, Purpose */}
        <View style={styles.cardRow}>
          {renderOutcomePill(item.outcome)}
          <Text style={styles.purposeText} numberOfLines={1} ellipsizeMode="tail">
            Purpose: {item.purpose || '—'}
          </Text>
        </View>

        {/* Thin 1px Divider */}
        <View style={styles.cardDivider} />

        {/* Row 3: Duration with Clock Icon, Date & Time, and Redial Button */}
        <View style={styles.cardRow}>
          <View style={styles.leftGroup}>
            <Feather name="clock" size={14} color={colors.primary.main} style={{ marginRight: 6 }} />
            <Text style={styles.durationText}>{formatDuration(item.duration_seconds)}</Text>
          </View>
          <View style={styles.cardBottomRight}>
            <Text style={styles.dateTimeText}>{formatDisplayDateTime(item.called_at)}</Text>
            <TouchableOpacity
              style={styles.redialBtn}
              accessibilityLabel="Redial"
              activeOpacity={0.7}
              onPress={(e) => {
                e?.stopPropagation?.();
                handleInitiateCall(item.contact_number);
              }}
            >
              <Feather name="phone-call" size={16} color={colors.primary.main} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyComponent = () => {
    if (isLoading) return null;
    const hasFilterOrSearch =
      debouncedSearch.trim().length > 0 ||
      selectedOutcomeFilter !== 'all' ||
      selectedStatusFilter !== 'all';

    if (hasFilterOrSearch) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No calls match your filters</Text>
          <TouchableOpacity
            style={styles.clearFiltersBtn}
            onPress={handleClearAllFiltersAndSearch}
            activeOpacity={0.7}
          >
            <Text style={styles.clearFiltersBtnText}>Clear filters</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No calls yet</Text>
        <Text style={styles.emptySubtitle}>
          Make your first call using the dialer above.
        </Text>
      </View>
    );
  };

  const renderFooterComponent = () => {
    if (!isLoadingMore) return <View style={{ height: 16 }} />;
    return (
      <View style={styles.loadingMoreContainer}>
        <ActivityIndicator size="small" color={colors.primary.main} />
        <Text style={styles.loadingMoreText}>Loading more calls...</Text>
      </View>
    );
  };

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: topInset + 16,
          paddingBottom: 24,
          paddingHorizontal: 20,
        },
      ]}
    >
      {/* Top Header & Controls */}
      <View style={styles.staticHeader}>
        {/* Header (Dashboard) */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image
              source={require('../../assets/amp-short-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <View>
              <Text style={styles.title}>Call Tracker</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {user?.fullName || user?.email || 'Logged in'}
              </Text>
            </View>
          </View>

          {/* Settings button */}
          <TouchableOpacity
            style={styles.settingsHeaderBtn}
            onPress={onNavigateToSettings}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="settings" size={22} color={colors.primary.main} />
          </TouchableOpacity>
        </View>

        {/* Permission Denied Banner */}
        {permissionDenied && (
          <View style={styles.bannerError}>
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.bannerErrorTitle}>Call log permission denied</Text>
              <Text style={styles.bannerErrorText}>
                Permission is required to automatically capture and record calls placed through this app.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => Linking.openSettings()}
              activeOpacity={0.85}
            >
              <Text style={styles.settingsButtonText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Sync Status Banner */}
        {syncMessage && (
          <View style={styles.bannerInfo}>
            <ActivityIndicator size="small" color={colors.primary.main} style={{ marginRight: 8 }} />
            <Text style={styles.bannerInfoText}>{syncMessage}</Text>
          </View>
        )}

        {syncError && (
          <View style={styles.bannerWarning}>
            <Text style={styles.bannerWarningText}>{syncError}</Text>
          </View>
        )}

        {/* "Initiate Call" Card */}
        <DialerCard onCall={handleInitiateCall} />

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.card, styles.summaryCard]}>
            <Text style={styles.summaryLabel}>TOTAL CALLS</Text>
            <Text style={styles.summaryValue}>{summary.total_calls}</Text>
          </View>

          <View style={[styles.card, styles.summaryCard]}>
            <Text style={styles.summaryLabel}>TOTAL TALK TIME</Text>
            <Text style={styles.summaryValue}>
              {formatDuration(summary.total_duration_seconds)}
            </Text>
          </View>
        </View>

        {/* Section Header */}
        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitle}>Call History</Text>
          <Text style={styles.historyCount}>{filteredTotal} recorded</Text>
        </View>

        {/* Search Row */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputContainer}>
            <Feather name="search" size={16} color={colors.text.secondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search number or purpose"
              placeholderTextColor={colors.text.secondary}
              value={searchInput}
              onChangeText={setSearchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchInput.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchInput('')}
                style={styles.searchClearBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={14} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.filterBtn}
            onPress={handleOpenFilterModal}
            activeOpacity={0.8}
            accessibilityLabel="Filter calls"
          >
            <Feather name="sliders" size={18} color="#FFFFFF" />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Active Filters Row */}
        {activeFilterCount > 0 && (
          <View style={styles.activeFiltersRow}>
            {selectedOutcomeFilter !== 'all' && (
              <TouchableOpacity
                style={styles.activeFilterPill}
                onPress={() => setSelectedOutcomeFilter('all')}
                activeOpacity={0.7}
              >
                <Text style={styles.activeFilterPillText}>
                  {OUTCOME_FILTER_LABELS[selectedOutcomeFilter] || selectedOutcomeFilter}
                </Text>
                <Feather name="x" size={12} color={colors.primary.main} />
              </TouchableOpacity>
            )}

            {selectedStatusFilter !== 'all' && (
              <TouchableOpacity
                style={styles.activeFilterPill}
                onPress={() => setSelectedStatusFilter('all')}
                activeOpacity={0.7}
              >
                <Text style={styles.activeFilterPillText}>
                  {STATUS_FILTER_LABELS[selectedStatusFilter] || selectedStatusFilter}
                </Text>
                <Feather name="x" size={12} color={colors.primary.main} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => {
                setSelectedOutcomeFilter('all');
                setSelectedStatusFilter('all');
              }}
              activeOpacity={0.7}
              style={styles.clearAllBtn}
            >
              <Text style={styles.clearAllText}>Clear all</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* History List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary.main} />
          <Text style={styles.loadingText}>Loading call history...</Text>
        </View>
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderCallItem}
          ListEmptyComponent={renderEmptyComponent}
          ListFooterComponent={renderFooterComponent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary.main]}
              tintColor={colors.primary.main}
            />
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Filter Bottom Sheet Modal */}
      <Modal
        visible={isFilterModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCloseFilterModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          {/* Dimmed backdrop area (tap to close) */}
          <TouchableOpacity
            style={styles.backdropDismiss}
            activeOpacity={1}
            onPress={handleCloseFilterModal}
          />

          {/* Sheet Content */}
          <View style={styles.sheetContent}>
            {/* Header: Title "Filters" and "x" button */}
            <View style={styles.filterSheetHeader}>
              <Text style={styles.sheetTitle}>Filters</Text>
              <TouchableOpacity
                onPress={handleCloseFilterModal}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name="x" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            {/* Section: OUTCOME */}
            <Text style={styles.filterSectionLabel}>OUTCOME</Text>
            <View style={styles.chipsRow}>
              {FILTER_OUTCOME_OPTIONS.map((opt) => {
                const isSelected = draftOutcome === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.filterChip,
                      isSelected ? styles.filterChipSelected : styles.filterChipUnselected,
                    ]}
                    onPress={() => setDraftOutcome(opt.key)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        isSelected ? styles.filterChipTextSelected : styles.filterChipTextUnselected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Section: STATUS */}
            <Text style={styles.filterSectionLabel}>STATUS</Text>
            <View style={styles.chipsRow}>
              {FILTER_STATUS_OPTIONS.map((opt) => {
                const isSelected = draftStatus === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.filterChip,
                      isSelected ? styles.filterChipSelected : styles.filterChipUnselected,
                    ]}
                    onPress={() => setDraftStatus(opt.key)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        isSelected ? styles.filterChipTextSelected : styles.filterChipTextUnselected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Bottom Buttons: Clear and Apply filters */}
            <View style={styles.filterButtonsRow}>
              <TouchableOpacity
                style={styles.clearFilterBtn}
                onPress={handleClearFilterDrafts}
                activeOpacity={0.7}
              >
                <Text style={styles.clearFilterBtnText}>Clear</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.applyFilterBtn}
                onPress={handleApplyFilters}
                activeOpacity={0.85}
              >
                <Text style={styles.applyFilterBtnText}>Apply filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Update Call Bottom Sheet Modal */}
      <Modal
        visible={isSheetVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCloseSheet}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          {/* Dimmed backdrop area (tap to close only if not auto-prompt) */}
          <TouchableOpacity
            style={styles.backdropDismiss}
            activeOpacity={1}
            onPress={isAutoPrompt ? undefined : handleCloseSheet}
          />

          {/* Sheet Content */}
          <View style={styles.sheetContent}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Title & Call Info */}
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Update Call</Text>
                <Text style={styles.sheetSubtitle}>
                  {selectedCall
                    ? `${selectedCall.contact_number} • ${formatDisplayDateTime(selectedCall.called_at)}`
                    : ''}
                </Text>
              </View>

              {/* Purpose of call */}
              <Text style={styles.fieldLabel}>
                Purpose of call <Text style={styles.requiredAsterisk}>*</Text>
              </Text>
              <View style={styles.multilineInputWrapper}>
                <TextInput
                  style={styles.multilineInput}
                  placeholder="Enter purpose of the call..."
                  placeholderTextColor="#94A3B8"
                  multiline={true}
                  numberOfLines={3}
                  maxLength={255}
                  value={purposeText}
                  onChangeText={setPurposeText}
                  textAlignVertical="top"
                />
                <Text style={styles.charCounter}>{purposeText.length}/255</Text>
              </View>

              {/* Outcome */}
              <Text style={styles.fieldLabel}>
                Outcome <Text style={styles.requiredAsterisk}>*</Text>
              </Text>
              <View style={styles.outcomesList}>
                {OUTCOME_OPTIONS.map((opt) => {
                  const isSelected = selectedOutcome === opt.key;
                  return (
                    <TouchableOpacity
                      key={String(opt.key)}
                      style={[
                        styles.outcomeOptionRow,
                        isSelected && styles.outcomeOptionRowSelected,
                      ]}
                      onPress={() => {
                        setSelectedOutcome(opt.key);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.outcomeOptionText,
                          isSelected && styles.outcomeOptionTextSelected,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      {isSelected && (
                        <Feather name="check" size={16} color={colors.primary.main} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Error message if request fails */}
              {sheetError && (
                <Text style={styles.sheetErrorText}>{sheetError}</Text>
              )}

              {/* Bottom Buttons: Cancel (only if manual open) and Save */}
              <View style={styles.sheetButtonsRow}>
                {!isAutoPrompt && (
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={handleCloseSheet}
                    disabled={isSaving}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    (!isUpdateValid || isSaving) ? styles.saveBtnDisabled : styles.saveBtnEnabled,
                    isAutoPrompt && { width: '100%' },
                  ]}
                  onPress={handleSaveUpdate}
                  disabled={!isUpdateValid || isSaving}
                  activeOpacity={0.85}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text
                      style={[
                        styles.saveBtnText,
                        (!isUpdateValid || isSaving) && styles.saveBtnDisabledText,
                      ]}
                    >
                      Save
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  staticHeader: {
    backgroundColor: colors.background.default,
  },
  listContent: {
    paddingBottom: 16,
    flexGrow: 1,
  },

  // Header (Dashboard)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  logoImage: {
    width: 48,
    height: 36,
    marginRight: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.primary.main,
  },
  userName: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 1,
  },
  settingsHeaderBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },


  // Cards and spacing
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },

  // "Initiate Call" Card
  dialerHeader: {
    marginBottom: 10,
  },
  dialerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.primary,
  },
  dialerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: 12,
    marginRight: 10,
  },
  phoneInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '500',
  },
  clearBtn: {
    padding: 6,
  },
  clearBtnText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '700',
  },
  callBtn: {
    height: 48,
    borderRadius: 10,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  callBtnEnabled: {
    backgroundColor: colors.primary.main,
  },
  callBtnDisabled: {
    backgroundColor: '#E2E8F0',
  },
  callBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Summary Cards
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    marginBottom: 0,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.primary.main,
  },

  // Section Header "Call History"
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  historyCount: {
    fontSize: 13,
    color: '#64748B',
  },

  // Call History Cards
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardRowHeader: {
    marginBottom: 8,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactNumberText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.primary,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  purposeText: {
    fontSize: 13,
    color: '#64748B',
    flex: 1,
    marginLeft: 12,
    textAlign: 'right',
  },
  durationText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary.main,
  },
  dateTimeText: {
    fontSize: 13,
    color: '#64748B',
  },
  cardBottomRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  redialBtn: {
    width: 34,
    height: 34,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.primary.main,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Pills: 12px text, 4px by 10px padding, fully rounded
  pillBase: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 9999,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Bottom Sheet Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  backdropDismiss: {
    flex: 1,
  },
  sheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'android' ? 24 : 34,
    maxHeight: '85%',
  },
  sheetHeader: {
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 2,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#64748B',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
    marginTop: 12,
  },
  multilineInputWrapper: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: 12,
    minHeight: 92,
  },
  multilineInput: {
    fontSize: 14,
    color: colors.text.primary,
    minHeight: 60,
    padding: 0,
  },
  charCounter: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  outcomesList: {
    marginBottom: 4,
  },
  outcomeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  outcomeOptionRowSelected: {
    borderColor: colors.primary.main,
    backgroundColor: '#FEF9EE',
  },
  outcomeOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
  },
  outcomeOptionTextSelected: {
    fontWeight: '600',
    color: colors.primary.main,
  },
  sheetErrorText: {
    fontSize: 13,
    color: colors.status.error,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  saveBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnEnabled: {
    backgroundColor: colors.primary.main,
  },
  saveBtnDisabled: {
    backgroundColor: '#E2E8F0',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveBtnDisabledText: {
    color: '#94A3B8',
  },

  // Search Row & Filter Button
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
    paddingVertical: 0,
  },
  searchClearBtn: {
    padding: 4,
  },
  filterBtn: {
    width: 40,
    height: 40,
    backgroundColor: colors.primary.main,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: colors.accent.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 12,
  },

  // Active filters removable chip row
  activeFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: -2,
    marginBottom: 10,
  },
  activeFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8E9',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 9999,
  },
  activeFilterPillText: {
    fontSize: 12,
    color: colors.primary.main,
    fontWeight: '600',
    marginRight: 4,
  },
  clearAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  clearAllText: {
    fontSize: 12,
    color: colors.primary.main,
    fontWeight: '600',
  },

  // Filter Bottom Sheet Modal Styles
  filterSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  filterSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipSelected: {
    backgroundColor: colors.primary.main,
  },
  filterChipUnselected: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipText: {
    fontSize: 12,
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  filterChipTextUnselected: {
    color: '#1E293B',
    fontWeight: '500',
  },
  filterButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 12,
  },
  clearFilterBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearFilterBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  applyFilterBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyFilterBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  requiredAsterisk: {
    color: colors.status.error,
    fontWeight: '700',
  },

  // Banners & Empty States
  bannerError: {
    backgroundColor: colors.status.errorBg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 12,
  },
  bannerErrorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.status.error,
    marginBottom: 2,
  },
  bannerErrorText: {
    fontSize: 12,
    color: '#7F1D1D',
    lineHeight: 16,
  },
  settingsButton: {
    backgroundColor: colors.status.error,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  settingsButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  bannerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent.goldTint,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.accent.lightGold,
    marginBottom: 12,
  },
  bannerInfoText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary.dark,
  },
  bannerWarning: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  bannerWarningText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 18,
  },
  clearFiltersBtn: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  clearFiltersBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary.main,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  loadingMoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  loadingMoreText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
});
