import * as Notifications from 'expo-notifications';
import { Platform, PermissionsAndroid } from 'react-native';

// Configure default notification presentation behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions and setup Android notification channel
 */
export async function registerForPushNotificationsAsync(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('followups', {
        name: 'Follow-up Call Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#801321',
        sound: null,
        enableVibrate: true,
        showBadge: true,
      });

      // Explicitly prompt on Android 13+ (API 33+)
      const androidVersion = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
      if (androidVersion >= 33) {
        try {
          await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as any);
        } catch {}
      }
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (err) {
    console.warn('Error configuring notifications:', err);
    return false;
  }
}

/**
 * Schedule a local notification for a specific follow-up reminder
 */
export async function scheduleFollowUpNotification(params: {
  followUpId: number | string;
  contactName: string;
  contactMobile: string;
  dueAt: Date | string;
  notes?: string | null;
}): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    const dueDate = typeof params.dueAt === 'string' ? new Date(params.dueAt) : params.dueAt;
    const now = new Date();

    // Only schedule if due date is in the future
    if (isNaN(dueDate.getTime()) || dueDate.getTime() <= now.getTime()) {
      return null;
    }

    const identifier = `followup_${params.followUpId}`;

    // Cancel any previous notification with this ID first
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    } catch {}

    const cleanNotes = params.notes?.trim() ? ` • Note: ${params.notes.trim()}` : '';

    const scheduledId = await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: '📞 Callback Reminder',
        body: `Time to call ${params.contactName} (${params.contactMobile})${cleanNotes}`,
        data: {
          followUpId: params.followUpId,
          contactMobile: params.contactMobile,
          screen: 'followups',
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: dueDate,
        channelId: 'followups',
      },
    });

    return scheduledId;
  } catch (err) {
    console.warn('Failed to schedule follow-up notification:', err);
    return null;
  }
}

/**
 * Cancel a scheduled follow-up notification (e.g., when marked done or cancelled)
 */
export async function cancelFollowUpNotification(followUpId: number | string): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const identifier = `followup_${followUpId}`;
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch (err) {
    console.warn('Error cancelling notification:', err);
  }
}

/**
 * Schedule or update notifications for all upcoming follow-up items
 */
export async function syncUpcomingFollowUpNotifications(
  followUps: Array<{
    id: number | string;
    contact_name: string;
    contact_mobile: string;
    due_at: string;
    notes?: string | null;
    status: string;
  }>
): Promise<void> {
  if (Platform.OS === 'web' || !Array.isArray(followUps)) return;

  try {
    const now = Date.now();
    for (const item of followUps) {
      if (item.status === 'pending') {
        const dueMs = new Date(item.due_at).getTime();
        if (dueMs > now) {
          await scheduleFollowUpNotification({
            followUpId: item.id,
            contactName: item.contact_name,
            contactMobile: item.contact_mobile,
            dueAt: item.due_at,
            notes: item.notes,
          });
        }
      } else {
        await cancelFollowUpNotification(item.id);
      }
    }
  } catch (err) {
    console.warn('Failed to sync follow-up notifications:', err);
  }
}
