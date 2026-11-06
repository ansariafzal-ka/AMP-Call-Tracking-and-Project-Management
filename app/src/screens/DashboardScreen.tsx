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
import { Feather, MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
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
  // Only direct-parse if plain string without timezone info (no Z, no offset)
  if (typeof rawDate === 'string' && !rawDate.includes('Z') && !/[+-]\d{2}(:\d{2})?$/.test(rawDate.trim())) {
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

// Keypad grid layout (3 columns by 4 rows)
const KEYPAD_ROWS = [
  [
    { key: '1', sub: '' },
    { key: '2', sub: 'ABC' },
    { key: '3', sub: 'DEF' },
  ],
  [
    { key: '4', sub: 'GHI' },
    { key: '5', sub: 'JKL' },
    { key: '6', sub: 'MNO' },
  ],
  [
    { key: '7', sub: 'PQRS' },
    { key: '8', sub: 'TUV' },
    { key: '9', sub: 'WXYZ' },
  ],
  [
    { key: '*', sub: '' },
    { key: '0', sub: '+' },
    { key: '#', sub: '' },
  ],
];

// ==========================================
// Main Dashboard Screen
// ==========================================
interface DashboardScreenProps {
  onNavigateToSettings?: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ onNavigateToSettings }) => {
  const { user, token, logout } = useAuth();
  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 20;
  const bottomInset = Platform.OS === 'ios' ? 34 : 0;

  // Keypad bottom sheet state
  const [isKeypadVisible, setIsKeypadVisible] = useState(false);
  const [keypadNumber, setKeypadNumber] = useState('');

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
  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);

  // Native Date and Time Picker states
  const [showNativeDatePicker, setShowNativeDatePicker] = useState(false);
  const [showNativeTimePicker, setShowNativeTimePicker] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // Field validation for Update Call
  // Note is optional; Outcome is required; if Outcome is follow_up_required, followUpDate is required
  const isOutcomeValid = selectedOutcome !== null;
  const isFollowUpValid = selectedOutcome !== 'follow_up_required' || followUpDate !== null;
  const isUpdateValid = isOutcomeValid && isFollowUpValid;

  const isSyncingRef = useRef(false);

  // Open Update Call bottom sheet
  const handleOpenUpdateSheet = useCallback((call: CallItem, isAuto: boolean = false) => {
    setSelectedCall(call);
    setPurposeText(call.purpose || '');
    setSelectedOutcome(call.outcome || null);

    // Parse existing follow_up_date if present
    if (call.follow_up_date) {
      const parsed = new Date(call.follow_up_date);
      setFollowUpDate(isNaN(parsed.getTime()) ? null : parsed);
    } else {
      setFollowUpDate(null);
    }

    setShowNativeDatePicker(false);
    setShowNativeTimePicker(false);
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

  // Keypad handlers
  const handleOpenKeypad = useCallback(() => {
    setKeypadNumber('');
    setIsKeypadVisible(true);
  }, []);

  const handleCloseKeypad = useCallback(() => {
    setIsKeypadVisible(false);
  }, []);

  const handleKeyPress = useCallback((char: string) => {
    setKeypadNumber((prev) => {
      if (prev.length >= 15) return prev;
      return prev + char;
    });
  }, []);

  const handleLongPressZero = useCallback(() => {
    setKeypadNumber((prev) => {
      if (prev.length === 0) return '+';
      return prev;
    });
  }, []);

  const handleKeypadCall = useCallback(async () => {
    const cleanDigits = keypadNumber.replace(/\D/g, '');
    if (cleanDigits.length < 10) return;
    const numberToCall = keypadNumber;
    setIsKeypadVisible(false);
    setKeypadNumber('');
    await handleInitiateCall(numberToCall);
  }, [keypadNumber]);

  const keypadDigitsCount = keypadNumber.replace(/\D/g, '').length;
  const isKeypadCallEnabled = keypadDigitsCount >= 10;

  // Helper to format Date to YYYY-MM-DD HH:mm:ss for backend
  const formatDateTimeForApi = (date: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
  };

  // Helper to format Date for user display (e.g. 31 Oct 2026, 11:00 AM)
  const formatFollowUpDisplay = (date: Date): string => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = date.getDate();
    const m = months[date.getMonth()];
    const y = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${d} ${m} ${y}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  };

  // Native Picker Change Handlers
  const handleNativeDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowNativeDatePicker(false);
    if (event.type === 'set' && selectedDate) {
      // Keep existing hours/minutes if already set, or default to 11:00 AM
      const currentHours = followUpDate ? followUpDate.getHours() : 11;
      const currentMinutes = followUpDate ? followUpDate.getMinutes() : 0;
      selectedDate.setHours(currentHours, currentMinutes, 0, 0);
      setFollowUpDate(selectedDate);

      // Automatically prompt for time right after date is picked
      setTimeout(() => {
        setShowNativeTimePicker(true);
      }, 300);
    }
  };

  const handleNativeTimeChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    setShowNativeTimePicker(false);
    if (event.type === 'set' && selectedTime) {
      const base = followUpDate ? new Date(followUpDate) : new Date();
      base.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
      setFollowUpDate(base);
    }
  };

  // Handle Save in Update Call Sheet
  const handleSaveUpdate = async () => {
    if (!selectedCall || !token) return;

    const cleanPurpose = purposeText.trim();

    if (!selectedOutcome) {
      setSheetError('Please select an outcome.');
      return;
    }

    if (selectedOutcome === 'follow_up_required' && !followUpDate) {
      setSheetError('Please select a follow-up date and time.');
      return;
    }

    setIsSaving(true);
    setSheetError(null);

    try {
      const followUpDateStr =
        selectedOutcome === 'follow_up_required' && followUpDate
          ? formatDateTimeForApi(followUpDate)
          : null;

      const updated = await updateCallRecord(
        selectedCall.id,
        {
          purpose: cleanPurpose || null,
          outcome: selectedOutcome,
          follow_up_date: followUpDateStr,
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

        {/* Row 2: Outcome Pill, Note / Purpose */}
        <View style={styles.cardRow}>
          {renderOutcomePill(item.outcome)}
          <Text style={styles.purposeText} numberOfLines={1} ellipsizeMode="tail">
            {item.purpose ? `Note: ${item.purpose}` : 'No notes'}
          </Text>
        </View>

        {/* Optional Follow-up Date & Time if scheduled */}
        {item.outcome === 'follow_up_required' && item.follow_up_date && (
          <View style={styles.cardFollowUpRow}>
            <Feather name="calendar" size={12} color="#92400E" style={{ marginRight: 5 }} />
            <Text style={styles.cardFollowUpText}>
              {formatDisplayDateTime(item.follow_up_date)}
            </Text>
          </View>
        )}

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
          Make your first call using the keypad.
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
    <View style={styles.screen}>
      <View
        style={[
          styles.mainContent,
          {
            paddingTop: topInset + 16,
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
      </View>

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

              {/* Note (previously Purpose of call) */}
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Note</Text>
                <Text style={styles.optionalBadge}>(Optional)</Text>
              </View>
              <View style={styles.multilineInputWrapper}>
                <TextInput
                  style={styles.multilineInput}
                  placeholder="Add notes about the call..."
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
                        // If selecting Follow-up Required and no date set yet, default to Tomorrow 11:00 AM
                        if (opt.key === 'follow_up_required' && !followUpDate) {
                          const tom = new Date();
                          tom.setDate(tom.getDate() + 1);
                          tom.setHours(11, 0, 0, 0);
                          setFollowUpDate(tom);
                        }
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

              {/* Follow-up Date & Time Picker (visible only when Outcome is Follow-up Required) */}
              {selectedOutcome === 'follow_up_required' && (
                <View style={styles.followUpSection}>
                  <Text style={styles.followUpSectionTitle}>
                    Schedule Follow-up <Text style={styles.requiredAsterisk}>*</Text>
                  </Text>

                  {/* Current Selected Follow-up Preview */}
                  <View style={styles.followUpSelectedBadge}>
                    <Feather name="clock" size={14} color="#B45309" style={{ marginRight: 6 }} />
                    <Text style={styles.followUpSelectedText}>
                      {followUpDate
                        ? formatFollowUpDisplay(followUpDate)
                        : 'No date selected'}
                    </Text>
                  </View>

                  {/* Pick Date & Time Button */}
                  <View style={styles.quickChipsRow}>
                    <TouchableOpacity
                      style={styles.quickChip}
                      onPress={() => setShowNativeDatePicker(true)}
                      activeOpacity={0.7}
                    >
                      <Feather name="edit-3" size={13} color={colors.primary.main} style={{ marginRight: 5 }} />
                      <Text style={styles.quickChipText}>Pick Date & Time</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Native DateTimePicker for Date (Android/iOS) */}
                  {showNativeDatePicker && (
                    <DateTimePicker
                      value={followUpDate || new Date()}
                      mode="date"
                      display="default"
                      minimumDate={new Date()}
                      onChange={handleNativeDateChange}
                    />
                  )}

                  {/* Native DateTimePicker for Time (Android/iOS) */}
                  {showNativeTimePicker && (
                    <DateTimePicker
                      value={followUpDate || new Date()}
                      mode="time"
                      display="default"
                      is24Hour={false}
                      onChange={handleNativeTimeChange}
                    />
                  )}
                </View>
              )}

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

      {/* Floating Keypad Button */}
      <TouchableOpacity
        style={[styles.floatingKeypadBtn, { bottom: 24 + bottomInset }]}
        onPress={handleOpenKeypad}
        activeOpacity={0.85}
        accessibilityLabel="Open keypad"
      >
        <MaterialIcons name="dialpad" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Keypad Bottom Sheet Modal */}
      <Modal
        visible={isKeypadVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCloseKeypad}
      >
        <View style={styles.modalBackdrop}>
          {/* Dimmed backdrop area (tap to close) */}
          <TouchableOpacity
            style={styles.backdropDismiss}
            activeOpacity={1}
            onPress={handleCloseKeypad}
          />

          {/* Keypad Sheet Content */}
          <View
            style={[
              styles.keypadSheetContent,
              { paddingBottom: 16 + bottomInset },
            ]}
          >
            {/* a. Close handle (chevron-down) */}
            <TouchableOpacity
              style={styles.keypadHandleContainer}
              onPress={handleCloseKeypad}
              hitSlop={{ top: 12, bottom: 12, left: 30, right: 30 }}
              accessibilityLabel="Close keypad"
            >
              <Feather name="chevron-down" size={22} color="#94A3B8" />
            </TouchableOpacity>

            {/* b. Number display */}
            <View style={styles.keypadDisplayContainer}>
              {keypadNumber.length === 0 ? (
                <Text style={styles.keypadPlaceholder}>Enter number</Text>
              ) : (
                <Text
                  style={styles.keypadNumberText}
                  numberOfLines={1}
                  ellipsizeMode="head"
                >
                  {keypadNumber}
                </Text>
              )}

              {keypadNumber.length > 0 && (
                <TouchableOpacity
                  style={styles.keypadDeleteBtn}
                  onPress={() => setKeypadNumber((prev) => prev.slice(0, -1))}
                  onLongPress={() => setKeypadNumber('')}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Delete"
                >
                  <Feather name="delete" size={22} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            {/* c. Keypad Grid */}
            <View style={styles.keypadGrid}>
              {KEYPAD_ROWS.map((row, rowIdx) => (
                <View key={rowIdx} style={styles.keypadRow}>
                  {row.map((item) => (
                    <TouchableOpacity
                      key={item.key}
                      style={styles.keypadKey}
                      activeOpacity={0.65}
                      onPress={() => handleKeyPress(item.key)}
                      onLongPress={item.key === '0' ? handleLongPressZero : undefined}
                    >
                      <Text style={styles.keypadKeyDigit}>{item.key}</Text>
                      <Text style={[styles.keypadKeySub, !item.sub && { opacity: 0 }]}>
                        {item.sub || ' '}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>

            {/* e. Full-width Call Button */}
            <TouchableOpacity
              style={[
                styles.keypadCallBtn,
                isKeypadCallEnabled
                  ? styles.keypadCallBtnEnabled
                  : styles.keypadCallBtnDisabled,
              ]}
              disabled={!isKeypadCallEnabled}
              onPress={handleKeypadCall}
              activeOpacity={0.85}
              accessibilityLabel="Call"
            >
              <Feather
                name="phone-call"
                size={20}
                color={isKeypadCallEnabled ? '#FFFFFF' : '#94A3B8'}
                style={{ marginRight: 8 }}
              />
              <Text
                style={[
                  styles.keypadCallBtnText,
                  { color: isKeypadCallEnabled ? '#FFFFFF' : '#94A3B8' },
                ]}
              >
                Call
              </Text>
            </TouchableOpacity>
          </View>
        </View>
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
  mainContent: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 100,
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

  // Floating Keypad Button
  floatingKeypadBtn: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 99,
  },

  // Keypad Bottom Sheet
  keypadSheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  keypadHandleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  keypadDisplayContainer: {
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 12,
    paddingHorizontal: 40,
    position: 'relative',
  },
  keypadPlaceholder: {
    fontSize: 18,
    color: '#94A3B8',
    textAlign: 'center',
  },
  keypadNumberText: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
  },
  keypadDeleteBtn: {
    position: 'absolute',
    right: 0,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  keypadGrid: {
    gap: 6,
    marginBottom: 16,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: 10,
  },
  keypadKey: {
    flex: 1,
    height: 52,
    backgroundColor: '#F6F2F3',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadKeyDigit: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text.primary,
    lineHeight: 25,
  },
  keypadKeySub: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
    lineHeight: 11,
  },
  keypadCallBtn: {
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  keypadCallBtnEnabled: {
    backgroundColor: colors.primary.main,
  },
  keypadCallBtnDisabled: {
    backgroundColor: '#E2E8F0',
  },
  keypadCallBtnText: {
    fontSize: 16,
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

  // Call Card Follow-up Reminder row
  cardFollowUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 2,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  cardFollowUpText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
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
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 8,
  },
  optionalBadge: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  followUpSection: {
    marginTop: 14,
    padding: 14,
    backgroundColor: '#FEF9EE',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  followUpSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 8,
  },
  followUpSelectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  followUpSelectedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
  },
  quickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4A854',
  },
  quickChipSelected: {
    backgroundColor: colors.primary.main,
    borderColor: colors.primary.main,
  },
  quickChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary.main,
  },
  quickChipTextSelected: {
    color: '#FFFFFF',
  },
  customDateBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  customFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  customDateTextInput: {
    height: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D4A854',
    paddingHorizontal: 10,
    fontSize: 14,
    color: colors.text.primary,
  },
  setCustomDateBtn: {
    backgroundColor: colors.primary.main,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  setCustomDateBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
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
