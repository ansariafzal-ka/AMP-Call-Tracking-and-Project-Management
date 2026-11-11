import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  StatusBar,
  Modal,
  ScrollView,
  Alert,
  AppState,
  AppStateStatus,
  PermissionsAndroid,
  KeyboardAvoidingView,
} from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import {
  fetchAssignedContacts,
  fetchContactDetails,
  CallerContactItem,
  ContactCallHistoryRecord,
} from '../services/contactsApi';
import {
  createCallRecord,
  updateCallRecord,
  CallOutcome,
  CallItem,
} from '../services/callsApi';
import {
  savePendingCall,
  getPendingCall,
  clearPendingCall,
  popPendingCall,
  getLastContactCount,
  saveLastContactCount,
} from '../services/storage';
import {
  findMatchingRecentOutgoingCall,
  formatDateTime,
  formatDuration,
} from '../services/callLogService';
import { scheduleFollowUpNotification } from '../services/notificationService';

const CATEGORIES = ['All', 'Donor', 'Beneficiary', 'Student', 'Volunteer', 'Other'];

const OUTCOME_OPTIONS: { key: CallOutcome; label: string }[] = [
  { key: 'interested', label: 'Interested' },
  { key: 'follow_up_required', label: 'Follow-up Required' },
  { key: 'not_interested', label: 'Not Interested' },
  { key: 'unanswered', label: 'Unanswered' },
];

export const ContactsScreen: React.FC = () => {
  const { token, user } = useAuth();
  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 20;

  // Data states
  const [contacts, setContacts] = useState<CallerContactItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [newAssignmentCount, setNewAssignmentCount] = useState<number | null>(null);

  // Search & Filter states
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // History Modal states
  const [historyModalVisible, setHistoryModalVisible] = useState<boolean>(false);
  const [selectedContact, setSelectedContact] = useState<CallerContactItem | null>(null);
  const [callHistory, setCallHistory] = useState<ContactCallHistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Post-Call Disposition Sheet states
  const [isDispositionVisible, setIsDispositionVisible] = useState<boolean>(false);
  const [activeCallItem, setActiveCallItem] = useState<CallItem | null>(null);
  const [dispositionContact, setDispositionContact] = useState<CallerContactItem | null>(null);
  const [noteText, setNoteText] = useState<string>('');
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcome>(null);
  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);
  const [isSavingDisposition, setIsSavingDisposition] = useState<boolean>(false);
  const [dispositionError, setDispositionError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);

  // Sync / detection feedback banner
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  // Search debouncing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Load Contacts
  const loadContacts = useCallback(
    async (pageNum = 1, append = false) => {
      if (!token) return;

      if (pageNum === 1 && !append) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const res = await fetchAssignedContacts(
          {
            page: pageNum,
            limit: 20,
            search: debouncedSearch,
            category: selectedCategory,
          },
          token
        );

        if (append) {
          setContacts((prev) => [...prev, ...res.contacts]);
        } else {
          setContacts(res.contacts);
        }

        setTotalCount(res.total);
        setTotalPages(res.totalPages);
        setPage(pageNum);

        // Check if new contacts were assigned to this user's queue
        if (!debouncedSearch && selectedCategory === 'All' && pageNum === 1 && user?.id) {
          const lastCount = await getLastContactCount(user.id);
          if (lastCount !== null && res.total > lastCount) {
            const diff = res.total - lastCount;
            setNewAssignmentCount(diff);
          }
          await saveLastContactCount(user.id, res.total);
        }
      } catch (err: any) {
        console.error('Error fetching contacts:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [token, debouncedSearch, selectedCategory, user?.id]
  );

  useEffect(() => {
    loadContacts(1, false);
  }, [loadContacts]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadContacts(1, false);
  };

  const handleLoadMore = () => {
    if (!loadingMore && page < totalPages) {
      loadContacts(page + 1, true);
    }
  };

  // Open Post-Call Disposition Sheet
  const handleOpenDisposition = useCallback((call: CallItem, contact?: CallerContactItem | null) => {
    setActiveCallItem(call);
    if (contact) {
      setDispositionContact(contact);
    } else {
      const match = contacts.find(
        (c) => c.mobile_number.replace(/\D/g, '') === call.contact_number.replace(/\D/g, '')
      );
      setDispositionContact(match || null);
    }
    setNoteText(call.purpose || '');
    setSelectedOutcome(call.outcome || null);
    setFollowUpDate(call.follow_up_date ? new Date(call.follow_up_date) : null);
    setDispositionError(null);
    setIsDispositionVisible(true);
  }, [contacts]);

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

          // Refresh contacts queue to show updated attempt counts immediately
          await loadContacts(1, false);

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
      console.warn('Error checking pending call in Contacts:', err);
    } finally {
      isSyncingRef.current = false;
      setSyncMessage(null);
    }
  }, [token, loadContacts, handleOpenDisposition]);

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
  const handleDial = async (contact: CallerContactItem) => {
    const cleanNumber = contact.mobile_number.replace(/[^0-9+]/g, '');

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
              'Call log permission is required to track calls placed through this app. Please enable it in Settings.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
            );
            return;
          }
        }
      } catch (err: any) {
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

  // Open Contact History Modal
  const handleOpenHistory = async (contact: CallerContactItem) => {
    if (!token) return;
    setSelectedContact(contact);
    setHistoryModalVisible(true);
    setLoadingHistory(true);

    try {
      const res = await fetchContactDetails(contact.id, token);
      setCallHistory(res.callHistory || []);
    } catch (err) {
      console.error('Failed to fetch contact history:', err);
      Alert.alert('Error', 'Failed to retrieve call history for this contact.');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Format Helper for backend YYYY-MM-DD HH:mm:ss
  const formatDateTimeForApi = (date: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
  };

  // Format Helper for user preview
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

  // Native Date & Time picker handlers for Follow-up
  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (event.type === 'set' && selectedDate) {
      const currentHours = followUpDate ? followUpDate.getHours() : 11;
      const currentMinutes = followUpDate ? followUpDate.getMinutes() : 0;
      selectedDate.setHours(currentHours, currentMinutes, 0, 0);
      setFollowUpDate(selectedDate);

      // Automatically prompt time picker after date is chosen
      setTimeout(() => setShowTimePicker(true), 300);
    }
  };

  const handleTimeChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    setShowTimePicker(false);
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

      // Schedule local system notification for this newly scheduled follow-up
      if (selectedOutcome === 'follow_up_required' && followUpDate) {
        scheduleFollowUpNotification({
          followUpId: `call_${activeCallItem.id}`,
          contactName: dispositionContact?.name || activeCallItem.contact_number,
          contactMobile: activeCallItem.contact_number,
          dueAt: followUpDate,
          notes: noteText.trim() || undefined,
        }).catch(() => {});
      }

      // Close modal
      setIsDispositionVisible(false);
      setActiveCallItem(null);
      setDispositionContact(null);

      // Refresh contacts to update attempt counter, outcome badge, and surface the next uncalled contact
      await loadContacts(1, false);
    } catch (err: any) {
      console.error('Failed to update call disposition:', err);
      const msg = err.response?.data?.message || err.message || 'Failed to save disposition.';
      setDispositionError(msg);
    } finally {
      setIsSavingDisposition(false);
    }
  };

  const getCategoryStyle = (cat: string) => {
    switch (cat?.toLowerCase()) {
      case 'donor':
        return { bg: '#FEF3C7', text: '#B45309' };
      case 'beneficiary':
        return { bg: '#EFF6FF', text: '#2563EB' };
      case 'student':
        return { bg: '#ECFDF5', text: '#059669' };
      case 'volunteer':
        return { bg: '#FCE7F3', text: '#BE185D' };
      default:
        return { bg: '#F1F5F9', text: '#475569' };
    }
  };

  const formatOutcomeLabel = (outcome?: string | null) => {
    if (!outcome) return '';
    switch (outcome) {
      case 'interested':
        return 'Interested';
      case 'follow_up_required':
        return 'Follow-up required';
      case 'not_interested':
        return 'Not interested';
      case 'unanswered':
        return 'Unanswered';
      default:
        return outcome.replace(/_/g, ' ');
    }
  };

  // Render Contact Card matching user reference screenshot exactly
  const renderContactCard = ({ item }: { item: CallerContactItem }) => {
    const catStyle = getCategoryStyle(item.category);
    const callCount = Number(item.total_calls || 0);
    const isAnswered = item.last_call_status === 'answered';

    return (
      <View style={styles.card}>
        {/* Row 1: Contact Name (Left) & Category Badge (Right) */}
        <View style={styles.cardTopRow}>
          <Text style={styles.contactName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.badgeGroup}>
            {item.project_name ? (
              <View style={styles.projectBadge}>
                <Feather name="folder" size={10} color="#475569" style={{ marginRight: 3.5 }} />
                <Text style={styles.projectBadgeText} numberOfLines={1}>
                  {item.project_name}
                </Text>
              </View>
            ) : null}
            <View style={[styles.categoryBadge, { backgroundColor: catStyle.bg }]}>
              <Text style={[styles.categoryBadgeText, { color: catStyle.text }]}>
                {item.category || 'Other'}
              </Text>
            </View>
          </View>
        </View>

        {/* Row 2: Phone number (Left) & Location (Right) */}
        <View style={styles.cardSecondRow}>
          <View style={styles.phoneGroup}>
            <Text style={styles.phoneNumber}>{item.mobile_number}</Text>
          </View>

          {(() => {
            const loc = [item.state, item.city].filter(Boolean).join(', ') + (item.pin_code ? ` - ${item.pin_code}` : '');
            return loc ? (
              <View style={styles.locationGroup}>
                <Feather name="map-pin" size={12} color="#64748B" />
                <Text style={styles.locationText} numberOfLines={1}>{loc}</Text>
              </View>
            ) : null;
          })()}
        </View>

        {/* Bottom Row: Attempts & Notes on Left, Action Buttons on Right */}
        <View style={styles.cardBottomRow}>
          <View style={styles.cardBottomLeft}>
            {/* Attempts & Status Line */}
            <Text style={styles.attemptsLine}>
              {callCount === 0 ? (
                '0 calls · Not called yet'
              ) : (
                <>
                  {callCount} {callCount === 1 ? 'attempt' : 'attempts'} ·{' '}
                  <Text
                    style={
                      isAnswered
                        ? styles.statusAnswered
                        : styles.statusUnanswered
                    }
                  >
                    {isAnswered
                      ? `Answered${item.last_call_outcome ? `, ${formatOutcomeLabel(item.last_call_outcome)}` : ''}`
                      : 'Not answered'}
                  </Text>
                </>
              )}
            </Text>

            {/* Notes / Purpose Line */}
            {item.notes ? (
              <Text style={styles.notesLine} numberOfLines={1}>
                {item.notes}
              </Text>
            ) : null}
          </View>

          {/* Right Action Buttons: Icon-only Solid [ 📞 ] and Outlined [ 🕘 ] */}
          <View style={styles.cardActionsRight}>
            <TouchableOpacity
              style={styles.actionCallBtn}
              onPress={() => handleDial(item)}
              activeOpacity={0.85}
              accessibilityLabel={`Call ${item.name}`}
            >
              <Feather name="phone-call" size={17} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionHistoryBtn}
              onPress={() => handleOpenHistory(item)}
              activeOpacity={0.7}
              accessibilityLabel={`View history for ${item.name}`}
            >
              <MaterialIcons name="history" size={21} color={colors.primary.main} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: topInset + 10 }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Assigned Contacts</Text>
          <Text style={styles.headerSubtitle}>
            {loading && contacts.length === 0
              ? 'Loading contacts...'
              : `${totalCount} ${totalCount === 1 ? 'contact' : 'contacts'} in queue`}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={handleRefresh}
          disabled={loading}
          activeOpacity={0.7}
          accessibilityLabel="Refresh contacts"
        >
          <Feather
            name="rotate-cw"
            size={16}
            color={loading ? colors.primary.main : colors.text.secondary}
          />
        </TouchableOpacity>
      </View>

      {/* New Contacts Assignment Notice Banner */}
      {newAssignmentCount !== null && newAssignmentCount > 0 && (
        <View style={styles.assignmentNoticeBanner}>
          <View style={styles.assignmentNoticeLeft}>
            <Feather name="info" size={15} color="#1E293B" style={{ marginRight: 8 }} />
            <Text style={styles.assignmentNoticeText}>
              Notice: {newAssignmentCount} {newAssignmentCount === 1 ? 'new contact has' : 'new contacts have'} been assigned to your queue.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setNewAssignmentCount(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.assignmentNoticeCloseBtn}
            accessibilityLabel="Dismiss notice"
          >
            <Feather name="x" size={14} color="#64748B" />
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

      {/* Search Input Bar */}
      <View style={styles.searchBar}>
        <Feather name="search" size={16} color="#94A3B8" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, number, or city..."
          placeholderTextColor="#94A3B8"
          value={searchInput}
          onChangeText={setSearchInput}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {searchInput.length > 0 && (
          <TouchableOpacity onPress={() => setSearchInput('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x-circle" size={15} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Category Filter Chips Horizontal Bar */}
      <View style={styles.categoryScrollContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryFilterChip,
                  isSelected && styles.categoryFilterChipActive,
                ]}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.categoryFilterChipText,
                    isSelected && styles.categoryFilterChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Contact List */}
      {loading && contacts.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary.main} />
          <Text style={styles.loadingText}>Fetching contacts...</Text>
        </View>
      ) : contacts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Feather name="users" size={26} color={colors.primary.main} />
          </View>
          <Text style={styles.emptyTitle}>No Contacts Found</Text>
          <Text style={styles.emptySubtitle}>
            {debouncedSearch || selectedCategory !== 'All'
              ? 'Try adjusting your search query or category filter.'
              : 'You do not have any contacts assigned in your queue.'}
          </Text>
          {(debouncedSearch || selectedCategory !== 'All') && (
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={() => {
                setSearchInput('');
                setSelectedCategory('All');
              }}
            >
              <Text style={styles.resetBtnText}>Clear Filters</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderContactCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary.main]}
              tintColor={colors.primary.main}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.primary.main} />
                <Text style={styles.footerLoaderText}>Loading more contacts...</Text>
              </View>
            ) : undefined
          }
        />
      )}

      {/* Contact Call History Modal */}
      <Modal
        visible={historyModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.modalTitle}>{selectedContact?.name}</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedContact?.mobile_number} • Call History
                </Text>
                {(selectedContact?.project_name || selectedContact?.category) && (
                  <View style={styles.modalHeaderBadgeRow}>
                    {selectedContact?.project_name ? (
                      <View style={styles.projectBadge}>
                        <Feather name="folder" size={10} color="#475569" style={{ marginRight: 3.5 }} />
                        <Text style={styles.projectBadgeText} numberOfLines={1}>
                          {selectedContact.project_name}
                        </Text>
                      </View>
                    ) : null}
                    {selectedContact?.category ? (
                      <View style={[styles.categoryBadge, { backgroundColor: getCategoryStyle(selectedContact.category).bg }]}>
                        <Text style={[styles.categoryBadgeText, { color: getCategoryStyle(selectedContact.category).text }]}>
                          {selectedContact.category}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setHistoryModalVisible(false)}
              >
                <Feather name="x" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={{ padding: 14 }}>
              {loadingHistory ? (
                <View style={styles.modalLoadingContainer}>
                  <ActivityIndicator size="small" color={colors.primary.main} />
                  <Text style={styles.modalLoadingText}>Loading call history...</Text>
                </View>
              ) : callHistory.length === 0 ? (
                <View style={styles.modalEmptyContainer}>
                  <Feather name="phone-off" size={24} color="#94A3B8" />
                  <Text style={styles.modalEmptyTitle}>No Calls Recorded</Text>
                  <Text style={styles.modalEmptySubtitle}>
                    This contact has not been called yet.
                  </Text>
                </View>
              ) : (
                callHistory.map((rec) => {
                  const isAns = rec.status === 'answered';
                  return (
                    <View key={rec.id} style={styles.historyCard}>
                      <View style={styles.historyCardHeader}>
                        <View style={styles.statusRow}>
                          <View
                            style={[
                              styles.statusDot,
                              { backgroundColor: isAns ? '#10B981' : '#EF4444' },
                            ]}
                          />
                          <Text style={styles.historyStatusText}>
                            {isAns ? 'Answered' : 'Not Answered'}
                          </Text>
                          {isAns && (
                            <Text style={styles.historyDurationText}>
                              ({formatDuration(rec.duration_seconds)})
                            </Text>
                          )}
                        </View>
                        {rec.outcome && (
                          <View style={styles.outcomeBadge}>
                            <Text style={styles.outcomeBadgeText}>
                              {formatOutcomeLabel(rec.outcome)}
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.historyDateText}>
                        {formatDateTime(rec.called_at)}
                      </Text>

                      {rec.purpose ? (
                        <Text style={styles.historyPurposeText}>
                          Note: {rec.purpose}
                        </Text>
                      ) : null}
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalFooterDialBtn}
                onPress={() => {
                  setHistoryModalVisible(false);
                  if (selectedContact) {
                    handleDial(selectedContact);
                  }
                }}
              >
                <Feather name="phone-call" size={15} color="#FFFFFF" />
                <Text style={styles.modalFooterDialBtnText}>Call Contact Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
                    {dispositionContact ? `${dispositionContact.name} • ` : ''}
                    {activeCallItem?.contact_number}
                    {activeCallItem?.duration_seconds
                      ? ` (${formatDuration(activeCallItem.duration_seconds)})`
                      : ''}
                  </Text>
                  {(dispositionContact?.project_name || activeCallItem?.project_name || dispositionContact?.category) && (
                    <View style={styles.modalHeaderBadgeRow}>
                      {(dispositionContact?.project_name || activeCallItem?.project_name) ? (
                        <View style={styles.projectBadge}>
                          <Feather name="folder" size={10} color="#475569" style={{ marginRight: 3.5 }} />
                          <Text style={styles.projectBadgeText} numberOfLines={1}>
                            {dispositionContact?.project_name || activeCallItem?.project_name}
                          </Text>
                        </View>
                      ) : null}
                      {dispositionContact?.category ? (
                        <View style={[styles.categoryBadge, { backgroundColor: getCategoryStyle(dispositionContact.category).bg }]}>
                          <Text style={[styles.categoryBadgeText, { color: getCategoryStyle(dispositionContact.category).text }]}>
                            {dispositionContact.category}
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
                    onPress={() => setShowDatePicker(true)}
                    activeOpacity={0.7}
                  >
                    <Feather name="edit-3" size={13} color={colors.primary.main} style={{ marginRight: 5 }} />
                    <Text style={styles.pickDateBtnText}>Pick Date & Time</Text>
                  </TouchableOpacity>

                  {showDatePicker && (
                    <DateTimePicker
                      value={followUpDate || new Date()}
                      mode="date"
                      display="default"
                      minimumDate={new Date()}
                      onChange={handleDateChange}
                    />
                  )}

                  {showTimePicker && (
                    <DateTimePicker
                      value={followUpDate || new Date()}
                      mode="time"
                      display="default"
                      is24Hour={false}
                      onChange={handleTimeChange}
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
    backgroundColor: colors.background.default,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.primary.main,
  },
  headerSubtitle: {
    fontSize: 13,
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
  assignmentNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  assignmentNoticeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  assignmentNoticeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 16,
    flex: 1,
  },
  assignmentNoticeCloseBtn: {
    padding: 3,
  },

  // Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
  },

  // Category filter scroll
  categoryScrollContainer: {
    marginBottom: 12,
  },
  categoryScroll: {
    gap: 8,
  },
  categoryFilterChip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryFilterChipActive: {
    backgroundColor: colors.primary.main,
    borderColor: colors.primary.main,
  },
  categoryFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  categoryFilterChipTextActive: {
    color: '#FFFFFF',
  },

  listContent: {
    paddingBottom: 24,
  },

  // Contact Card - matched to reference image
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
    marginRight: 8,
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
    paddingHorizontal: 9,
    paddingVertical: 2.5,
    borderRadius: 12,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  cardSecondRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  phoneGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  phoneNumber: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  copyBtn: {
    padding: 2,
  },
  locationGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  locationText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },

  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  cardBottomLeft: {
    flex: 1,
    paddingRight: 10,
  },
  attemptsLine: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  statusAnswered: {
    color: '#0D9488', // teal-600
    fontWeight: '600',
  },
  statusUnanswered: {
    color: '#64748B',
    fontWeight: '500',
  },
  notesLine: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },

  // Action Buttons: Icon-only [ 📞 ] and Outlined [ 🕘 ]
  cardActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionCallBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primary.main,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary.main,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  actionHistoryBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: colors.primary.main,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(128, 19, 33, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 17,
  },
  resetBtn: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.primary.main,
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  footerLoaderText: {
    fontSize: 12,
    color: colors.text.secondary,
  },

  // Modal common
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    height: '75%',
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  modalSubtitle: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: {
    flex: 1,
  },
  modalLoadingContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLoadingText: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 6,
  },
  modalEmptyContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalEmptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    marginTop: 8,
  },
  modalEmptySubtitle: {
    fontSize: 11,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: 4,
  },
  historyCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  historyStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
  },
  historyDurationText: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  outcomeBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  outcomeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.primary,
    textTransform: 'capitalize',
  },
  historyDateText: {
    fontSize: 11,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  historyPurposeText: {
    fontSize: 11,
    color: '#334155',
    marginTop: 2,
  },
  modalFooter: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalFooterDialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.primary.main,
  },
  modalFooterDialBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Disposition Sheet
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

  // Follow-up Section
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
