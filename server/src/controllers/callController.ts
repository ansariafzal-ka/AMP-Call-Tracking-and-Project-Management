import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { CallOutcome } from '../types/call';
import * as callModel from '../models/callModel';

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

    const summary = await callModel.getCallSummary(userId);
    const { calls, filtered_total } = await callModel.getCalls(
      userId,
      { search, outcome, status },
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

    const { purpose, outcome } = req.body;

    // At least one of the two keys must be present
    if (purpose === undefined && outcome === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'At least one of purpose or outcome must be provided',
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

    // Check if call exists and belongs to the user
    const existingCall = await callModel.findUserCallById(callId, userId);
    if (!existingCall) {
      return res.status(404).json({ status: 'error', message: 'Call not found' });
    }

    // Perform update
    const updatedCall = await callModel.updateCall(callId, userId, {
      purpose: cleanPurpose,
      outcome: cleanOutcome,
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
