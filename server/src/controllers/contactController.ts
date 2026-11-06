import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as contactModel from '../models/contactModel';

export async function getAssignedContacts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const { contacts, total } = await contactModel.getAssignedContacts(
      userId,
      search,
      category,
      limit,
      offset
    );

    res.status(200).json({
      success: true,
      data: {
        contacts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err: any) {
    console.error('Error fetching assigned contacts:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assigned contacts',
      error: err.message,
    });
  }
}

export async function getContactDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const contactId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (!contactId || isNaN(contactId)) {
      res.status(400).json({ success: false, message: 'Invalid contact ID' });
      return;
    }

    const contact = await contactModel.getContactById(contactId, userId);
    if (!contact) {
      res.status(404).json({ success: false, message: 'Contact not found or not assigned to you' });
      return;
    }

    const callHistory = await contactModel.getContactCallHistory(contactId, userId);

    res.status(200).json({
      success: true,
      data: {
        contact,
        callHistory,
      },
    });
  } catch (err: any) {
    console.error('Error fetching contact details:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contact details',
      error: err.message,
    });
  }
}
