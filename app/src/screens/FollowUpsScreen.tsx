import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Platform,
  StatusBar,
  Modal,
  ScrollView,
  Alert,
  AppState,
  AppStateStatus,
  PermissionsAndroid,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import {
  fetchFollowUps,
  completeFollowUp,
  rescheduleFollowUp,
  FollowUpItem,
  FollowUpFilterTab,
  FollowUpSummaryCounts,
} from '../services/followUpsApi';
import { savePendingCall, getPendingCall, clearPendingCall, popPendingCall } from '../services/storage';
import {
  createCallRecord,
  updateCallRecord,
  CallItem,
  CallOutcome,
} from '../services/callsApi';
import { findMatchingRecentOutgoingCall } from '../services/callLogService';
import {
  scheduleFollowUpNotification,
  cancelFollowUpNotification,
  syncUpcomingFollowUpNotifications,
} from '../services/notificationService';

const OUTCOME_OPTIONS: { key: CallOutcome; label: string }[] = [
  { key: 'interested', label: 'Interested' },
  { key: 'follow_up_required', label: 'Follow-up Required' },
  { key: 'not_interested', label: 'Not Interested' },
  { key: 'unanswered', label: 'Unanswered' },
];

function formatDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds || 0));
  if (sec === 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

const TABS: { key: FollowUpFilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
];

export const FollowUpsScreen: React.FC = () => {
  const { token } = useAuth();
  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 20;

  // Active filter tab
  const [activeTab, setActiveTab] = useState<FollowUpFilterTab>('today');

  // Data states
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [summary, setSummary] = useState<FollowUpSummaryCounts>({
    today: 0,
    overdue: 0,
    upcoming: 0,
    completed: 0,
  });
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Reschedule Modal states
  const [rescheduleModalVisible, setRescheduleModalVisible] = useState<boolean>(false);
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUpItem | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<Date>(new Date());
  const [rescheduleNotes, setRescheduleNotes] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState<boolean>(false);

  // Complete Modal states
  const [completeModalVisible, setCompleteModalVisible] = useState<boolean>(false);
  const [completingFollowUp, setCompletingFollowUp] = useState<FollowUpItem | null>(null);
  const [completionNotes, setCompletionNotes] = useState<string>('');
  const [isSubmittingComplete, setIsSubmittingComplete] = useState<boolean>(false);

  // Post-Call Disposition Sheet states
  const [isDispositionVisible, setIsDispositionVisible] = useState<boolean>(false);
  const [activeCallItem, setActiveCallItem] = useState<CallItem | null>(null);
  const [dispositionFollowUp, setDispositionFollowUp] = useState<FollowUpItem | null>(null);
  const [noteText, setNoteText] = useState<string>('');
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcome>(null);
  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);
  const [isSavingDisposition, setIsSavingDisposition] = useState<boolean>(false);
  const [dispositionError, setDispositionError] = useState<string | null>(null);
  const [showDispositionDatePicker, setShowDispositionDatePicker] = useState<boolean>(false);
  const [showDispositionTimePicker, setShowDispositionTimePicker] = useState<boolean>(false);

  // Sync / detection feedback banner
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  // Fetch follow-ups from API
  const loadFollowUps = useCallback(
    async (isPullToRefresh = false) => {
      if (!token) return;

      if (isPullToRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const res = await fetchFollowUps(token, {
          status: activeTab,
          page: 1,
          limit: 100,
        });

        if (res.success && res.data) {
          const list = res.data.followUps || [];
          setFollowUps(list);
          setSummary(
            res.data.summary || { today: 0, overdue: 0, upcoming: 0, completed: 0 }
          );
          setTotalCount(res.data.pagination?.total || 0);

          // Sync local notifications for all active follow-ups
          syncUpcomingFollowUpNotifications(list);
        }
      } catch (err: any) {
        console.error('Failed to fetch follow-ups on mobile:', err);
        Alert.alert('Error', 'Could not load follow-up reminders. Please try again.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, activeTab]
  );

  useEffect(() => {
    loadFollowUps(false);
  }, [loadFollowUps]);

  const handleRefresh = () => {
    loadFollowUps(true);
  };

  // Open Post-Call Disposition Sheet
  const handleOpenDisposition = useCallback((call: CallItem, item?: FollowUpItem | null) => {
    setActiveCallItem(call);
    if (item) {
      setDispositionFollowUp(item);
    } else {
      const match = followUps.find(
        (f) => f.contact_mobile.replace(/\D/g, '') === call.contact_number.replace(/\D/g, '')
      );
      setDispositionFollowUp(match || null);
    }
    setNoteText(call.purpose || '');
    setSelectedOutcome(call.outcome || null);
    setFollowUpDate(call.follow_up_date ? new Date(call.follow_up_date) : null);
    setDispositionError(null);
    setIsDispositionVisible(true);
  }, [followUps]);

  // Check and sync any pending call when returning from phone dialer
  const checkAndSyncPendingCall = useCallback(async () => {
    if (isSyncingRef.current || !token) return;

    try {
      isSyncingRef.current = true;
      const pending = await popPendingCall();
      if (!pending) {
        isSyncingRef.current = false;
        return;
      }

      const now = Date.now();
      const elapsed = now - pending.started_at;
      if (elapsed > 3600 * 1000) {
        console.log('Discarding expired pending call (>1hr)');
        isSyncingRef.current = false;
        return;
      }

      // If user returned immediately (< 3.5s), dialer chooser was dismissed without calling
      if (elapsed < 3500) {
        console.log('Returned in <3.5s, dialer was cancelled without calling.');
        isSyncingRef.current = false;
        return;
      }

      // Check silently in the background (wait 1.5s for native log flush)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const match = await findMatchingRecentOutgoingCall(pending.number, pending.started_at);

      if (match) {
        setSyncMessage('Call recorded! Opening disposition...');
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
          setTimeout(() => setSyncMessage(null), 2500);

          // Refresh follow-ups to show updated counts immediately
          await loadFollowUps(false);

          // Automatically prompt user with Post-Call Disposition Modal
          if (createdCall && createdCall.id) {
            handleOpenDisposition(createdCall);
          }
        } catch (postErr: any) {
          console.error('Failed to post call record to server:', postErr);
          setSyncMessage('Failed to record call. Will retry when app returns.');
          setTimeout(() => setSyncMessage(null), 4000);
        }
      } else {
        console.log('No matching call found in log. Discarding pending call.');
      }
    } catch (err) {
      console.warn('Error checking pending call in FollowUps:', err);
    } finally {
      isSyncingRef.current = false;
      setSyncMessage(null);
    }
  }, [token, loadFollowUps, handleOpenDisposition]);

  // AppState listener for auto-detection when returning to foreground
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

  // Dial contact via native dialer with call log tracking
  const handleDial = async (item: FollowUpItem) => {
    const cleanNumber = item.contact_mobile.replace(/[^0-9+]/g, '');

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
            Alert.alert(
              'Permission Required',
              'Call log permission is required to track calls placed through this app.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Settings', onPress: () => Linking.openSettings() },
              ]
            );
            return;
          }
        }
      } catch (err) {
        console.warn('Permission request error:', err);
      }
    }

    try {
      await savePendingCall({
        number: cleanNumber,
        started_at: Date.now(),
      });

      const url = `tel:${cleanNumber}`;
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        await clearPendingCall();
        Alert.alert('Unable to Dial', 'Direct phone dialing is not supported on this device.');
        return;
      }
      await Linking.openURL(url);
    } catch (err: any) {
      console.error('Error opening dialer:', err);
      await clearPendingCall();
      Alert.alert('Dialer Error', `Could not open dialer: ${err?.message || err}`);
    }
  };

  // Helper formatting for backend datetime and preview
  const formatDateTimeForApi = (date: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
  };

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

  // Disposition Date & Time Handlers
  const handleDispositionDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDispositionDatePicker(false);
    if (event.type === 'set' && selectedDate) {
      const currentHours = followUpDate ? followUpDate.getHours() : 11;
      const currentMinutes = followUpDate ? followUpDate.getMinutes() : 0;
      selectedDate.setHours(currentHours, currentMinutes, 0, 0);
      setFollowUpDate(selectedDate);

      setTimeout(() => setShowDispositionTimePicker(true), 300);
    }
  };

  const handleDispositionTimeChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    setShowDispositionTimePicker(false);
    if (event.type === 'set' && selectedTime) {
      const base = followUpDate ? new Date(followUpDate) : new Date();
      base.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
      setFollowUpDate(base);
    }
  };

  // Save Post-Call Disposition
  const handleSaveDisposition = async () => {
    if (!activeCallItem || !token) return;

    if (!selectedOutcome) {
      setDispositionError('Please select a call outcome.');
      return;
    }

    if (selectedOutcome === 'follow_up_required' && !followUpDate) {
      setDispositionError('Please schedule a follow-up date and time.');
      return;
    }

    setIsSavingDisposition(true);
    setDispositionError(null);

    try {
      const followUpDateStr =
        selectedOutcome === 'follow_up_required' && followUpDate
          ? formatDateTimeForApi(followUpDate)
          : null;

      await updateCallRecord(
        activeCallItem.id,
        {
          purpose: noteText.trim() || null,
          outcome: selectedOutcome,
          follow_up_date: followUpDateStr,
        },
        token
      );

      // Close disposition modal
      setIsDispositionVisible(false);
      setActiveCallItem(null);
      setDispositionFollowUp(null);

      // Reload follow-ups
      await loadFollowUps(false);
    } catch (err: any) {
      console.error('Failed to update call disposition in FollowUps:', err);
      const msg = err.response?.data?.message || err.message || 'Failed to save disposition.';
      setDispositionError(msg);
    } finally {
      setIsSavingDisposition(false);
    }
  };

  // Open Reschedule Modal
  const handleOpenReschedule = (item: FollowUpItem) => {
    setSelectedFollowUp(item);
    const existingDate = item.due_at ? new Date(item.due_at) : new Date();
    setRescheduleDate(!isNaN(existingDate.getTime()) ? existingDate : new Date());
    setRescheduleNotes('');
    setRescheduleModalVisible(true);
  };

  // Date/Time Change Handlers
  const onDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShowDatePicker(false);
    if (event.type === 'set' && selected) {
      const updated = new Date(rescheduleDate);
      updated.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setRescheduleDate(updated);
      if (Platform.OS === 'android') {
        setShowTimePicker(true);
      }
    }
  };

  const onTimeChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShowTimePicker(false);
    if (event.type === 'set' && selected) {
      const updated = new Date(rescheduleDate);
      updated.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setRescheduleDate(updated);
    }
  };

  // Submit Reschedule
  const handleSubmitReschedule = async () => {
    if (!token || !selectedFollowUp) return;

    setIsSubmittingReschedule(true);
    try {
      const pad = (n: number) => String(n).padStart(2, '0');
      const formattedDate = `${rescheduleDate.getFullYear()}-${pad(rescheduleDate.getMonth() + 1)}-${pad(rescheduleDate.getDate())} ${pad(rescheduleDate.getHours())}:${pad(rescheduleDate.getMinutes())}:00`;

      await rescheduleFollowUp(
        token,
        selectedFollowUp.id,
        formattedDate,
        rescheduleNotes.trim() ? rescheduleNotes.trim() : undefined
      );

      // Schedule local system notification for the rescheduled callback
      scheduleFollowUpNotification({
        followUpId: selectedFollowUp.id,
        contactName: selectedFollowUp.contact_name,
        contactMobile: selectedFollowUp.contact_mobile,
        dueAt: rescheduleDate,
        notes: rescheduleNotes.trim() || selectedFollowUp.notes,
      }).catch(() => {});

      setRescheduleModalVisible(false);
      Alert.alert('Success', 'Callback rescheduled successfully.');
      loadFollowUps(false);
    } catch (err: any) {
      console.error('Failed to reschedule callback:', err);
      Alert.alert('Error', err.response?.data?.message || 'Failed to reschedule callback.');
    } finally {
      setIsSubmittingReschedule(false);
    }
  };

  // Open Complete Modal
  const handleOpenComplete = (item: FollowUpItem) => {
    setCompletingFollowUp(item);
    setCompletionNotes('');
    setCompleteModalVisible(true);
  };

  // Submit Complete
  const handleSubmitComplete = async () => {
    if (!token || !completingFollowUp) return;

    setIsSubmittingComplete(true);
    try {
      await completeFollowUp(
        token,
        completingFollowUp.id,
        completionNotes.trim() ? completionNotes.trim() : undefined
      );

      // Cancel local system notification when completed
      cancelFollowUpNotification(completingFollowUp.id).catch(() => {});

      setCompleteModalVisible(false);
      Alert.alert('Completed', 'Callback marked as completed.');
      loadFollowUps(false);
    } catch (err: any) {
      console.error('Failed to complete callback:', err);
      Alert.alert('Error', err.response?.data?.message || 'Failed to complete callback.');
    } finally {
      setIsSubmittingComplete(false);
    }
  };

  // Format Helper for Due Date display
  const formatDueDisplay = (dueAtStr: string) => {
    if (!dueAtStr) return { dateStr: '-', timeStr: '', isOverdue: false, isToday: false };

    const due = new Date(dueAtStr);
    if (isNaN(due.getTime())) return { dateStr: dueAtStr, timeStr: '', isOverdue: false, isToday: false };

    const now = new Date();
    const isOverdue = due.getTime() < now.getTime();

    const isToday =
      due.getFullYear() === now.getFullYear() &&
      due.getMonth() === now.getMonth() &&
      due.getDate() === now.getDate();

    const dateStr = due.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const timeStr = due.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    return { dateStr, timeStr, isOverdue, isToday };
  };

  // Get Tab Count Badge Value
  const getTabBadge = (tabKey: FollowUpFilterTab) => {
    switch (tabKey) {
      case 'today':
        return summary.today;
      case 'overdue':
        return summary.overdue;
      case 'upcoming':
        return summary.upcoming;
      case 'completed':
        return summary.completed;
      default:
        return null;
    }
  };

  // Category Badge Styler
  const getCategoryStyles = (category?: string | null) => {
    switch (category?.toLowerCase()) {
      case 'donor':
        return { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' };
      case 'beneficiary':
        return { bg: '#D1FAE5', text: '#047857', border: '#A7F3D0' };
      case 'student':
        return { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' };
      case 'volunteer':
        return { bg: '#F3E8FF', text: '#7E22CE', border: '#E9D5FF' };
      default:
        return { bg: '#F1F5F9', text: '#475569', border: '#E2E8F0' };
    }
  };

  // Render Single Follow-up Card
  const renderItem = ({ item }: { item: FollowUpItem }) => {
    const isCompleted = item.status === 'completed';
    const isPending = item.status === 'pending';
    const isCancelled = item.status === 'cancelled';
    const { dateStr, timeStr, isOverdue, isToday } = formatDueDisplay(item.due_at);
    const catStyle = getCategoryStyles(item.contact_category);

    return (
      <View style={[styles.card, isOverdue && isPending && styles.cardOverdueBorder]}>
        {/* Top Header: Contact Name & Status/Category Badge */}
        <View style={styles.cardTopRow}>
          <View style={styles.cardNameContainer}>
            <Text style={styles.contactName} numberOfLines={1}>
              {item.contact_name}
            </Text>
            {(() => {
              const loc = [item.contact_state, item.contact_city].filter(Boolean).join(', ') + (item.contact_pin_code ? ` - ${item.contact_pin_code}` : '');
              return loc ? (
                <View style={styles.locationRow}>
                  <Feather name="map-pin" size={11} color="#64748B" />
                  <Text style={styles.locationText} numberOfLines={1}>{loc}</Text>
                </View>
              ) : null;
            })()}
          </View>

          <View style={styles.badgeGroup}>
            {item.project_name ? (
              <View style={styles.projectBadge}>
                <Feather name="folder" size={10} color="#475569" style={{ marginRight: 3.5 }} />
                <Text style={styles.projectBadgeText} numberOfLines={1}>
                  {item.project_name}
                </Text>
              </View>
            ) : null}
            {item.contact_category ? (
              <View
                style={[
                  styles.categoryBadge,
                  { backgroundColor: catStyle.bg, borderColor: catStyle.border },
                ]}
              >
                <Text style={[styles.categoryBadgeText, { color: catStyle.text }]}>
                  {item.contact_category}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Mobile Number Row */}
        <View style={styles.phoneRow}>
          <Feather name="phone" size={12} color="#64748B" style={{ marginRight: 6 }} />
          <Text style={styles.phoneNumber}>{item.contact_mobile}</Text>
        </View>

        {/* Due Date & Time Banner */}
        <View style={styles.dueRow}>
          <View style={styles.dueDateGroup}>
            <Feather
              name="clock"
              size={13}
              color={isOverdue && isPending ? '#DC2626' : colors.primary.main}
              style={{ marginRight: 5 }}
            />
            <Text
              style={[
                styles.dueText,
                isOverdue && isPending && styles.dueTextOverdue,
              ]}
            >
              {dateStr} {timeStr ? `at ${timeStr}` : ''}
            </Text>
          </View>

          {/* Overdue / Due Today Pill */}
          {isPending && isOverdue && (
            <View style={styles.pillOverdue}>
              <Feather name="alert-triangle" size={10} color="#DC2626" style={{ marginRight: 3 }} />
              <Text style={styles.pillOverdueText}>OVERDUE</Text>
            </View>
          )}

          {isPending && !isOverdue && isToday && (
            <View style={styles.pillToday}>
              <Feather name="clock" size={10} color="#B45309" style={{ marginRight: 3 }} />
              <Text style={styles.pillTodayText}>DUE TODAY</Text>
            </View>
          )}

          {isCompleted && (
            <View style={styles.pillCompleted}>
              <Feather name="check" size={10} color="#059669" style={{ marginRight: 3 }} />
              <Text style={styles.pillCompletedText}>COMPLETED</Text>
            </View>
          )}

          {isCancelled && (
            <View style={[styles.pillCompleted, { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]}>
              <Text style={[styles.pillCompletedText, { color: '#64748B' }]}>CANCELLED</Text>
            </View>
          )}
        </View>

        {/* Notes / Context */}
        {item.notes ? (
          <View style={styles.notesContainer}>
            <Text style={styles.notesLabel}>Notes:</Text>
            <Text style={styles.notesText} numberOfLines={2}>
              {item.notes}
            </Text>
          </View>
        ) : null}

        {/* Bottom Actions Row */}
        <View style={styles.cardActionsRow}>
          {/* Left Action Buttons: Done & Reschedule */}
          <View style={styles.leftActions}>
            {isPending ? (
              <>
                <TouchableOpacity
                  style={styles.btnDone}
                  onPress={() => handleOpenComplete(item)}
                  activeOpacity={0.8}
                >
                  <Feather name="check" size={13} color="#047857" style={{ marginRight: 4 }} />
                  <Text style={styles.btnDoneText}>Done</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnReschedule}
                  onPress={() => handleOpenReschedule(item)}
                  activeOpacity={0.8}
                >
                  <Feather name="calendar" size={12} color={colors.primary.main} style={{ marginRight: 4 }} />
                  <Text style={styles.btnRescheduleText}>Reschedule</Text>
                </TouchableOpacity>
              </>
            ) : isCompleted ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  style={styles.btnReschedule}
                  onPress={() => handleOpenReschedule(item)}
                  activeOpacity={0.8}
                >
                  <Feather name="calendar" size={12} color={colors.primary.main} style={{ marginRight: 4 }} />
                  <Text style={styles.btnRescheduleText}>Reschedule</Text>
                </TouchableOpacity>
                <Text style={styles.completedSubtext}>
                  Resolved {item.completed_at ? `on ${new Date(item.completed_at).toLocaleDateString('en-IN')}` : ''}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Right Action: Call Button */}
          <TouchableOpacity
            style={styles.actionCallBtn}
            onPress={() => handleDial(item)}
            activeOpacity={0.85}
            accessibilityLabel={`Call ${item.contact_name}`}
          >
            <Feather name="phone-call" size={17} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: topInset + 10 }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Follow-ups & Callbacks</Text>
          <Text style={styles.headerSubtitle}>
            {loading && followUps.length === 0
              ? 'Loading callbacks...'
              : `${totalCount} ${totalCount === 1 ? 'callback' : 'callbacks'} in queue`}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={handleRefresh}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Feather
            name="rotate-cw"
            size={16}
            color={loading ? colors.primary.main : colors.text.secondary}
          />
        </TouchableOpacity>
      </View>

      {/* Processing / Sync Banner */}
      {syncMessage && (
        <View style={styles.syncBanner}>
          <ActivityIndicator size="small" color="#991B1B" style={{ marginRight: 8 }} />
          <Text style={styles.syncBannerText}>{syncMessage}</Text>
        </View>
      )}

      {/* Filter Tabs Horizontal Bar */}
      <View style={styles.tabScrollContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScroll}
        >
          {TABS.map((tab) => {
            const isSelected = activeTab === tab.key;
            const badgeVal = getTabBadge(tab.key);
            const isOverdueTab = tab.key === 'overdue';

            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabChip,
                  isSelected && styles.tabChipActive,
                  isSelected && isOverdueTab && styles.tabChipOverdueActive,
                ]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.tabChipText,
                    isSelected && styles.tabChipTextActive,
                  ]}
                >
                  {tab.label}
                </Text>

                {badgeVal !== null && badgeVal > 0 && (
                  <View
                    style={[
                      styles.tabBadge,
                      isSelected && styles.tabBadgeActive,
                      isOverdueTab && styles.tabBadgeOverdue,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabBadgeText,
                        isSelected && styles.tabBadgeTextActive,
                        isOverdueTab && styles.tabBadgeTextOverdue,
                      ]}
                    >
                      {badgeVal}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main List */}
      {loading && followUps.length === 0 ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.primary.main} />
          <Text style={styles.loadingText}>Fetching follow-ups...</Text>
        </View>
      ) : (
        <FlatList
          data={followUps}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[
            styles.listContent,
            followUps.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary.main]}
              tintColor={colors.primary.main}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Feather
                  name={activeTab === 'completed' ? 'check-circle' : 'calendar'}
                  size={32}
                  color={colors.accent.gold}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {activeTab === 'overdue'
                  ? 'No Overdue Callbacks!'
                  : activeTab === 'today'
                  ? 'No Callbacks Due Today'
                  : 'No Follow-ups Found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'overdue'
                  ? 'Great work staying on schedule with all your contacts.'
                  : activeTab === 'today'
                  ? 'All scheduled callbacks for today are complete.'
                  : 'Follow-ups scheduled after calls will appear here.'}
              </Text>
            </View>
          }
        />
      )}

      {/* ======================================================== */}
      {/* Reschedule Modal */}
      {/* ======================================================== */}
      <Modal
        visible={rescheduleModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRescheduleModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.modalTitle}>Reschedule Callback</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedFollowUp?.contact_name} ({selectedFollowUp?.contact_mobile})
                </Text>
                {(selectedFollowUp?.project_name || selectedFollowUp?.contact_category) && (
                  <View style={styles.modalHeaderBadgeRow}>
                    {selectedFollowUp?.project_name ? (
                      <View style={styles.projectBadge}>
                        <Feather name="folder" size={10} color="#475569" style={{ marginRight: 3.5 }} />
                        <Text style={styles.projectBadgeText} numberOfLines={1}>
                          {selectedFollowUp.project_name}
                        </Text>
                      </View>
                    ) : null}
                    {selectedFollowUp?.contact_category ? (
                      <View style={[styles.categoryBadge, { backgroundColor: getCategoryStyles(selectedFollowUp.contact_category).bg, borderColor: getCategoryStyles(selectedFollowUp.contact_category).border }]}>
                        <Text style={[styles.categoryBadgeText, { color: getCategoryStyles(selectedFollowUp.contact_category).text }]}>
                          {selectedFollowUp.contact_category}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={() => setRescheduleModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Date & Time Picker Buttons */}
            <View style={styles.pickerSection}>
              <Text style={styles.inputLabel}>New Callback Date & Time</Text>
              <View style={styles.dateTimeBtnRow}>
                <TouchableOpacity
                  style={styles.dateTimeBtn}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.75}
                >
                  <Feather name="calendar" size={15} color={colors.primary.main} style={{ marginRight: 8 }} />
                  <Text style={styles.dateTimeBtnText}>
                    {rescheduleDate.toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dateTimeBtn}
                  onPress={() => setShowTimePicker(true)}
                  activeOpacity={0.75}
                >
                  <Feather name="clock" size={15} color={colors.primary.main} style={{ marginRight: 8 }} />
                  <Text style={styles.dateTimeBtnText}>
                    {rescheduleDate.toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </Text>
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={rescheduleDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  minimumDate={new Date()}
                  onChange={onDateChange}
                />
              )}

              {showTimePicker && (
                <DateTimePicker
                  value={rescheduleDate}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onTimeChange}
                />
              )}
            </View>

            {/* Reschedule Context / Notes */}
            <View style={styles.notesInputSection}>
              <Text style={styles.inputLabel}>Reason / Notes (Optional)</Text>
              <TextInput
                style={styles.notesTextInput}
                placeholder="e.g., Contact asked to call back tomorrow afternoon"
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                value={rescheduleNotes}
                onChangeText={setRescheduleNotes}
              />
            </View>

            {/* Modal Actions */}
            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRescheduleModalVisible(false)}
                disabled={isSubmittingReschedule}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleSubmitReschedule}
                disabled={isSubmittingReschedule}
              >
                {isSubmittingReschedule ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>Save Reschedule</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ======================================================== */}
      {/* Complete Follow-up Modal */}
      {/* ======================================================== */}
      <Modal
        visible={completeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCompleteModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.modalTitle}>Mark Callback as Completed</Text>
                <Text style={styles.modalSubtitle}>
                  {completingFollowUp?.contact_name} ({completingFollowUp?.contact_mobile})
                </Text>
                {(completingFollowUp?.project_name || completingFollowUp?.contact_category) && (
                  <View style={styles.modalHeaderBadgeRow}>
                    {completingFollowUp?.project_name ? (
                      <View style={styles.projectBadge}>
                        <Feather name="folder" size={10} color="#475569" style={{ marginRight: 3.5 }} />
                        <Text style={styles.projectBadgeText} numberOfLines={1}>
                          {completingFollowUp.project_name}
                        </Text>
                      </View>
                    ) : null}
                    {completingFollowUp?.contact_category ? (
                      <View style={[styles.categoryBadge, { backgroundColor: getCategoryStyles(completingFollowUp.contact_category).bg, borderColor: getCategoryStyles(completingFollowUp.contact_category).border }]}>
                        <Text style={[styles.categoryBadgeText, { color: getCategoryStyles(completingFollowUp.contact_category).text }]}>
                          {completingFollowUp.contact_category}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={() => setCompleteModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.notesInputSection}>
              <Text style={styles.inputLabel}>Completion Notes / Outcome (Optional)</Text>
              <TextInput
                style={styles.notesTextInput}
                placeholder="e.g., Reconnected, answered questions, agreed to participate"
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                value={completionNotes}
                onChangeText={setCompletionNotes}
              />
            </View>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCompleteModalVisible(false)}
                disabled={isSubmittingComplete}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: '#059669' }]}
                onPress={handleSubmitComplete}
                disabled={isSubmittingComplete}
              >
                {isSubmittingComplete ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>Confirm Complete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Post-Call Disposition Bottom Sheet Modal */}
      <Modal
        visible={isDispositionVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          if (!isSavingDisposition) setIsDispositionVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.dispositionModalBackdrop}
        >
          <View style={styles.dispositionSheetContent}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Header */}
              <View style={styles.dispositionHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.dispositionTitle}>Update Call Details</Text>
                  <Text style={styles.dispositionSubtitle}>
                    {dispositionFollowUp ? `${dispositionFollowUp.contact_name} • ` : ''}
                    {activeCallItem?.contact_number}
                    {activeCallItem?.duration_seconds
                      ? ` (${formatDuration(activeCallItem.duration_seconds)})`
                      : ''}
                  </Text>
                  {(dispositionFollowUp?.project_name || activeCallItem?.project_name || dispositionFollowUp?.contact_category) && (
                    <View style={styles.modalHeaderBadgeRow}>
                      {(dispositionFollowUp?.project_name || activeCallItem?.project_name) ? (
                        <View style={styles.projectBadge}>
                          <Feather name="folder" size={10} color="#475569" style={{ marginRight: 3.5 }} />
                          <Text style={styles.projectBadgeText} numberOfLines={1}>
                            {dispositionFollowUp?.project_name || activeCallItem?.project_name}
                          </Text>
                        </View>
                      ) : null}
                      {dispositionFollowUp?.contact_category ? (
                        <View style={[styles.categoryBadge, { backgroundColor: getCategoryStyles(dispositionFollowUp.contact_category).bg, borderColor: getCategoryStyles(dispositionFollowUp.contact_category).border }]}>
                          <Text style={[styles.categoryBadgeText, { color: getCategoryStyles(dispositionFollowUp.contact_category).text }]}>
                            {dispositionFollowUp.contact_category}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setIsDispositionVisible(false)}
                  disabled={isSavingDisposition}
                >
                  <Feather name="x" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Note input field */}
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
                  value={noteText}
                  onChangeText={setNoteText}
                  textAlignVertical="top"
                />
                <Text style={styles.charCounter}>{noteText.length}/255</Text>
              </View>

              {/* Outcome Selector */}
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

              {/* Follow-up Section if Follow-up Required */}
              {selectedOutcome === 'follow_up_required' && (
                <View style={styles.followUpSection}>
                  <Text style={styles.followUpSectionTitle}>
                    Schedule Follow-up <Text style={styles.requiredAsterisk}>*</Text>
                  </Text>

                  <View style={styles.followUpSelectedBadge}>
                    <Feather name="clock" size={14} color="#B45309" style={{ marginRight: 6 }} />
                    <Text style={styles.followUpSelectedText}>
                      {followUpDate ? formatFollowUpDisplay(followUpDate) : 'No date selected'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.pickDateBtn}
                    onPress={() => setShowDispositionDatePicker(true)}
                    activeOpacity={0.7}
                  >
                    <Feather name="edit-3" size={13} color={colors.primary.main} style={{ marginRight: 5 }} />
                    <Text style={styles.pickDateBtnText}>Pick Date & Time</Text>
                  </TouchableOpacity>

                  {showDispositionDatePicker && (
                    <DateTimePicker
                      value={followUpDate || new Date()}
                      mode="date"
                      display="default"
                      minimumDate={new Date()}
                      onChange={handleDispositionDateChange}
                    />
                  )}

                  {showDispositionTimePicker && (
                    <DateTimePicker
                      value={followUpDate || new Date()}
                      mode="time"
                      display="default"
                      is24Hour={false}
                      onChange={handleDispositionTimeChange}
                    />
                  )}
                </View>
              )}

              {/* Error display */}
              {dispositionError && (
                <Text style={styles.dispositionErrorText}>{dispositionError}</Text>
              )}

              {/* Action Buttons */}
              <View style={styles.dispositionButtonsRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsDispositionVisible(false)}
                  disabled={isSavingDisposition}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    (!selectedOutcome || isSavingDisposition)
                      ? styles.saveBtnDisabled
                      : styles.saveBtnEnabled,
                  ]}
                  onPress={handleSaveDisposition}
                  disabled={!selectedOutcome || isSavingDisposition}
                  activeOpacity={0.85}
                >
                  {isSavingDisposition ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text
                      style={[
                        styles.saveBtnText,
                        (!selectedOutcome || isSavingDisposition) && styles.saveBtnDisabledText,
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
  root: {
    flex: 1,
    backgroundColor: colors.background.default, // Soft blush '#FBF2F3'
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },

  // Tabs Bar
  tabScrollContainer: {
    marginBottom: 12,
  },
  tabScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabChipActive: {
    backgroundColor: colors.primary.main,
    borderColor: colors.primary.main,
  },
  tabChipOverdueActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  tabChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabChipTextActive: {
    color: '#FFFFFF',
  },
  tabBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  tabBadgeOverdue: {
    backgroundColor: '#FEE2E2',
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },
  tabBadgeTextOverdue: {
    color: '#DC2626',
  },

  // List
  listContent: {
    paddingBottom: 90,
  },
  listContentEmpty: {
    flexGrow: 1,
  },

  // Follow-up Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1E3E5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardOverdueBorder: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFFDFD',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  cardNameContainer: {
    flex: 1,
    marginRight: 8,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  locationText: {
    fontSize: 11,
    color: '#64748B',
    marginLeft: 3,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  projectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 6,
    maxWidth: 130,
  },
  projectBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#334155',
  },
  modalHeaderBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },

  // Phone Row
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  phoneNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    letterSpacing: 0.2,
  },
  copyBtn: {
    marginLeft: 8,
    padding: 2,
  },

  // Due Date & Time Banner
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  dueDateGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dueText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary.main,
  },
  dueTextOverdue: {
    color: '#DC2626',
    fontWeight: '700',
  },
  pillOverdue: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  pillOverdueText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.3,
  },
  pillToday: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  pillTodayText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  pillCompleted: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  pillCompletedText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.3,
  },

  // Notes
  notesContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  notesLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  notesText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 16,
  },

  // Bottom Actions
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnDone: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnDoneText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  btnReschedule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnRescheduleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary.main,
  },
  completedSubtext: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
  },
  actionCallBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty & Loading
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  loadingText: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(200, 157, 75, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },

  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  pickerSection: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 6,
  },
  dateTimeBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateTimeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateTimeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  notesInputSection: {
    marginBottom: 20,
  },
  notesTextInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: '#1E293B',
    textAlignVertical: 'top',
    minHeight: 70,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  modalConfirmBtn: {
    flex: 1.5,
    backgroundColor: colors.primary.main,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Sync banner
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  syncBannerText: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '600',
  },

  // Post-Call Disposition Bottom Sheet Styles
  modalCloseBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  dispositionModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  dispositionSheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  dispositionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dispositionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  dispositionSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 6,
  },
  optionalBadge: {
    fontSize: 11,
    color: '#94A3B8',
  },
  requiredAsterisk: {
    color: '#EF4444',
  },
  multilineInputWrapper: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#F8FAFC',
    marginBottom: 14,
  },
  multilineInput: {
    fontSize: 13,
    color: colors.text.primary,
    minHeight: 55,
  },
  charCounter: {
    alignSelf: 'flex-end',
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },
  outcomesList: {
    gap: 6,
    marginBottom: 14,
  },
  outcomeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  outcomeOptionRowSelected: {
    borderColor: colors.primary.main,
    backgroundColor: 'rgba(128, 19, 33, 0.05)',
  },
  outcomeOptionText: {
    fontSize: 13,
    color: colors.text.primary,
    fontWeight: '500',
  },
  outcomeOptionTextSelected: {
    color: colors.primary.main,
    fontWeight: '700',
  },
  followUpSection: {
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    marginBottom: 14,
  },
  followUpSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 8,
  },
  followUpSelectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
  },
  followUpSelectedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
  pickDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.primary.main,
    borderRadius: 6,
    paddingVertical: 7,
  },
  pickDateBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary.main,
  },
  dispositionErrorText: {
    color: '#EF4444',
    fontSize: 12,
    marginBottom: 10,
    textAlign: 'center',
  },
  dispositionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  saveBtn: {
    flex: 2,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnEnabled: {
    backgroundColor: colors.primary.main,
  },
  saveBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  saveBtnDisabledText: {
    color: '#94A3B8',
  },
});
