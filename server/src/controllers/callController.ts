import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { CallOutcome } from '../types/call';
import * as callModel from '../models/callModel';
import * as contactModel from '../models/contactModel';

export async function createCall(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { contact_number, duration_seconds, called_at, purpose, outcome } = req.body;

    // Validation
    if (!contact_number || typeof contact_number !== 'string' || !contact_number.trim()) {
      return res.status(400).json({ status: 'error', message: 'contact_number is required' });
    }

    if (duration_seconds === undefined || duration_seconds === null || isNaN(Number(duration_seconds))) {
      return res.status(400).json({ status: 'error', message: 'duration_seconds is required and must be a number' });
    }

    const durationSec = Math.max(0, Math.floor(Number(duration_seconds)));

    if (!called_at) {
      return res.status(400).json({ status: 'error', message: 'called_at is required' });
    }

    // Format for MySQL DATETIME (YYYY-MM-DD HH:MM:SS) preserving phone local clock time
    let formattedCalledAt: string;
    if (typeof called_at === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(called_at)) {
      formattedCalledAt = called_at.trim().replace('T', ' ').slice(0, 19);
      if (formattedCalledAt.length === 16) {
        formattedCalledAt += ':00';
      }
    } else {
      const dateObj = new Date(called_at);
      if (isNaN(dateObj.getTime())) {
        return res.status(400).json({ status: 'error', message: 'Invalid called_at date format' });
      }
      const pad = (n: number) => String(n).padStart(2, '0');
      formattedCalledAt = `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`;
    }

    // Determine status
    const status = durationSec > 0 ? 'answered' : 'not_answered';
    const cleanNumber = contact_number.trim();
    const cleanPurpose = typeof purpose === 'string' && purpose.trim() ? purpose.trim() : null;
    const cleanOutcome = (typeof outcome === 'string' && outcome.trim() ? outcome.trim() : null) as CallOutcome;

    const callRecord = await callModel.createCall(userId, {
      contact_number: cleanNumber,
      duration_seconds: durationSec,
      status,
      purpose: cleanPurpose,
      outcome: cleanOutcome,
      called_at: formattedCalledAt,
    });

    return res.status(201).json({
      status: 'ok',
      call: callRecord,
    });
  } catch (error) {
    console.error('Error creating call record:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to record call',
    });
  }
}

export async function getCalls(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '50'), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);

    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const outcome = typeof req.query.outcome === 'string' ? req.query.outcome : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

    const summary = await callModel.getCallSummary(userId, startDate, endDate);
    const { calls, filtered_total } = await callModel.getCalls(
      userId,
      { search, outcome, status, startDate, endDate },
      limit,
      offset
    );

    return res.status(200).json({
      summary,
      filtered_total,
      calls,
    });
  } catch (error) {
    console.error('Error fetching calls:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch calls',
    });
  }
}

export async function updateCall(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const callId = parseInt(String(req.params.id || ''), 10);
    if (isNaN(callId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid call id' });
    }

    const { purpose, outcome, follow_up_date, contact_name, contact_category, contact_city, contact_state, contact_pin_code } = req.body;

    // At least one of the keys must be present
    if (
      purpose === undefined &&
      outcome === undefined &&
      follow_up_date === undefined &&
      contact_name === undefined
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'At least one field to update must be provided',
      });
    }

    let cleanPurpose: string | null = undefined as any;
    if (purpose !== undefined) {
      if (purpose !== null && typeof purpose !== 'string') {
        return res.status(400).json({ status: 'error', message: 'purpose must be a string or null' });
      }
      if (purpose === null) {
        cleanPurpose = null;
      } else {
        const trimmed = purpose.trim();
        if (trimmed.length > 255) {
          return res.status(400).json({ status: 'error', message: 'purpose cannot exceed 255 characters' });
        }
        cleanPurpose = trimmed === '' ? null : trimmed;
      }
    }

    let cleanOutcome: CallOutcome = undefined as any;
    if (outcome !== undefined) {
      const allowedOutcomes = ['interested', 'not_interested', 'unanswered', 'follow_up_required', null];
      if (!allowedOutcomes.includes(outcome)) {
        return res.status(400).json({ status: 'error', message: 'Invalid outcome value' });
      }
      cleanOutcome = (outcome === '' ? null : outcome) as CallOutcome;
    }

    let cleanFollowUpDate: string | null = undefined as any;
    if (follow_up_date !== undefined) {
      if (follow_up_date === null || follow_up_date === '') {
        cleanFollowUpDate = null;
      } else if (typeof follow_up_date === 'string') {
        const trimmed = follow_up_date.trim();
        if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(trimmed)) {
          let formatted = trimmed.replace('T', ' ').slice(0, 19);
          if (formatted.length === 16) formatted += ':00';
          cleanFollowUpDate = formatted;
        } else {
          const dateObj = new Date(trimmed);
          if (isNaN(dateObj.getTime())) {
            return res.status(400).json({ status: 'error', message: 'Invalid follow_up_date format' });
          }
          const pad = (n: number) => String(n).padStart(2, '0');
          cleanFollowUpDate = `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`;
        }
      } else {
        return res.status(400).json({ status: 'error', message: 'follow_up_date must be a valid date string or null' });
      }
    }

    // Check if call exists and belongs to the user
    const existingCall = await callModel.findUserCallById(callId, userId);
    if (!existingCall) {
      return res.status(404).json({ status: 'error', message: 'Call not found' });
    }

    // If contact details are provided for an unknown number, auto-create/update the contact
    if (contact_name && typeof contact_name === 'string' && contact_name.trim()) {
      try {
        await contactModel.createCallerContact(userId, {
          name: contact_name.trim(),
          mobile_number: existingCall.contact_number,
          category: typeof contact_category === 'string' ? contact_category.trim() : 'other',
          city: typeof contact_city === 'string' ? contact_city.trim() : undefined,
          state: typeof contact_state === 'string' ? contact_state.trim() : undefined,
          pin_code: typeof contact_pin_code === 'string' ? contact_pin_code.trim() : undefined,
          call_id: callId,
        });
      } catch (cErr) {
        console.warn('Failed to auto-link new contact on call update:', cErr);
      }
    }

    // Perform update
    const updatedCall = await callModel.updateCall(callId, userId, {
      purpose: cleanPurpose,
      outcome: cleanOutcome,
      follow_up_date: cleanFollowUpDate,
    });

    return res.status(200).json({
      status: 'ok',
      call: updatedCall,
    });
  } catch (error) {
    console.error('Error updating call:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update call',
    });
  }
}
