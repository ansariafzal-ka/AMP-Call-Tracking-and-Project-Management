import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as adminContactModel from '../models/adminContactModel';
import * as userModel from '../models/userModel';
import { pool } from '../config/db';

export async function getAdminContacts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const city = typeof req.query.city === 'string' ? req.query.city : undefined;

    let assignedUserId: number | undefined = undefined;
    let unassignedOnly: boolean | undefined = undefined;
    let projectId: number | undefined = undefined;

    if (req.query.assignedUserId === 'unassigned') {
      unassignedOnly = true;
    } else if (req.query.assignedUserId) {
      const parsedId = parseInt(req.query.assignedUserId as string, 10);
      if (!isNaN(parsedId)) {
        assignedUserId = parsedId;
      }
    }

    if (req.query.projectId && req.query.projectId !== 'all') {
      const parsedProjId = parseInt(req.query.projectId as string, 10);
      if (!isNaN(parsedProjId)) {
        projectId = parsedProjId;
      }
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(10000, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const { contacts, total } = await adminContactModel.getAdminContacts(
      {
        search,
        category,
        city,
        assignedUserId,
        unassignedOnly,
        projectId,
      },
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
    console.error('Error fetching admin contacts:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contacts',
      error: err.message,
    });
  }
}

export async function assignContacts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { contactIds, targetUserId, reassignFollowUps } = req.body;

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'contactIds must be a non-empty array of numbers',
      });
      return;
    }

    if (!targetUserId || isNaN(parseInt(targetUserId, 10))) {
      res.status(400).json({
        success: false,
        message: 'Valid targetUserId is required',
      });
      return;
    }

    // Verify target user exists and is active
    const targetUser = await userModel.findById(parseInt(targetUserId, 10));
    if (!targetUser) {
      res.status(404).json({
        success: false,
        message: 'Target user does not exist',
      });
      return;
    }

    if (!targetUser.is_active) {
      res.status(400).json({
        success: false,
        message: 'Cannot assign contacts to a deactivated user',
      });
      return;
    }

    const count = await adminContactModel.assignContacts({
      contactIds: contactIds.map((id: any) => parseInt(id, 10)),
      targetUserId: parseInt(targetUserId, 10),
      reassignFollowUps: reassignFollowUps !== undefined ? Boolean(reassignFollowUps) : true,
    });

    res.status(200).json({
      success: true,
      message: `Successfully assigned ${count} contact(s) to ${targetUser.full_name}`,
      data: {
        assignedCount: count,
        targetUserId: targetUser.id,
        targetUserName: targetUser.full_name,
      },
    });
  } catch (err: any) {
    console.error('Error assigning contacts:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to assign contacts',
      error: err.message,
    });
  }
}

export async function getExistingContactNumbers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query<{ mobile_number: string }>(
      'SELECT mobile_number FROM contacts'
    );
    const numbers = result.rows
      .map((r) => r.mobile_number.replace(/\D/g, '').slice(-10))
      .filter((n) => n.length === 10);

    res.status(200).json({
      success: true,
      data: { numbers },
    });
  } catch (err: any) {
    console.error('Error fetching existing contact numbers:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch existing numbers',
      error: err.message,
    });
  }
}

export async function bulkUploadContacts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { contacts, defaultProjectId, defaultUserId } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      res.status(400).json({
        success: false,
        message: 'contacts must be a non-empty array of records',
      });
      return;
    }

    // Load active users map by email for quick lookup
    const allUsers = await pool.query<{ id: number; email: string; full_name: string }>(
      'SELECT id, email, full_name FROM users'
    );
    const emailToUserMap = new Map<string, number>();
    for (const u of allUsers.rows) {
      emailToUserMap.set(u.email.toLowerCase().trim(), u.id);
    }

    // Query existing mobile numbers in DB for collision prevention
    const existingMobilesResult = await pool.query<{ mobile_number: string }>(
      'SELECT mobile_number FROM contacts'
    );
    const existingMobilesSet = new Set<string>();
    existingMobilesResult.rows.forEach((r) => {
      const clean = r.mobile_number.replace(/\D/g, '');
      if (clean) existingMobilesSet.add(clean.slice(-10));
    });

    const batchMobilesSet = new Set<string>();

    // Process and validate rows
    const preparedContacts: adminContactModel.BulkContactInput[] = [];
    const invalidRows: { index: number; mobile?: string; reason: string }[] = [];

    contacts.forEach((row: any, idx: number) => {
      const rawMobile = String(row.mobile_number || row.mobile || row.phone || '').trim();
      const cleanDigits = rawMobile.replace(/\D/g, '');
      const tenDigits = cleanDigits.slice(-10);
      const name = String(row.name || '').trim();

      if (!rawMobile || cleanDigits.length < 10) {
        invalidRows.push({
          index: idx + 1,
          mobile: rawMobile,
          reason: 'Invalid or incomplete mobile number (must be at least 10 digits)',
        });
        return;
      }

      if (existingMobilesSet.has(tenDigits)) {
        invalidRows.push({
          index: idx + 1,
          mobile: rawMobile,
          reason: 'Duplicate: Mobile number already exists in database',
        });
        return;
      }

      if (batchMobilesSet.has(tenDigits)) {
        invalidRows.push({
          index: idx + 1,
          mobile: rawMobile,
          reason: 'Duplicate: Mobile number repeated in upload file',
        });
        return;
      }

      batchMobilesSet.add(tenDigits);

      // Check assigned_to email
      let assignedUserId: number | null = null;
      const assignedEmail = String(row.assigned_to || row.caller_email || row.assigned_caller || '').toLowerCase().trim();
      if (assignedEmail && emailToUserMap.has(assignedEmail)) {
        assignedUserId = emailToUserMap.get(assignedEmail)!;
      } else if (defaultUserId && !isNaN(parseInt(defaultUserId, 10))) {
        assignedUserId = parseInt(defaultUserId, 10);
      }

      let projectId: number | null = null;
      if (row.project_id && !isNaN(parseInt(row.project_id, 10))) {
        projectId = parseInt(row.project_id, 10);
      } else if (defaultProjectId && !isNaN(parseInt(defaultProjectId, 10))) {
        projectId = parseInt(defaultProjectId, 10);
      }

      preparedContacts.push({
        name: name || 'Unknown Contact',
        mobile_number: rawMobile,
        alternate_number: row.alternate_number || row.alternate_phone || null,
        email: row.email ? String(row.email).trim() : null,
        city: row.city ? String(row.city).trim() : null,
        state: row.state ? String(row.state).trim() : null,
        pin_code: row.pin_code || row.pincode || row.zip || row.zipcode ? String(row.pin_code || row.pincode || row.zip || row.zipcode).trim() : null,
        category: row.category ? String(row.category).trim() : 'Donor',
        notes: row.notes ? String(row.notes).trim() : null,
        assigned_user_id: assignedUserId,
        project_id: projectId,
      });
    });

    if (preparedContacts.length === 0) {
      res.status(400).json({
        success: false,
        message: 'No valid or non-duplicate contact rows found to import',
        invalidRows,
      });
      return;
    }

    const { imported_count, assigned_count, unassigned_count } = await adminContactModel.bulkImportContacts(preparedContacts);

    res.status(200).json({
      success: true,
      message: `Successfully imported ${imported_count} contacts (${assigned_count} assigned, ${unassigned_count} unassigned). ${invalidRows.length > 0 ? `${invalidRows.length} duplicate/invalid rows skipped.` : ''}`,
      data: {
        importedCount: imported_count,
        assignedCount: assigned_count,
        unassignedCount: unassigned_count,
        skippedCount: invalidRows.length,
        invalidRows,
      },
    });
  } catch (err: any) {
    console.error('Error in bulk upload:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk import contacts',
      error: err.message,
    });
  }
}

export async function updateContact(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const paramId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const contactId = parseInt(paramId as string, 10);
    if (isNaN(contactId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid contact ID',
      });
      return;
    }

    const {
      name,
      mobile_number,
      alternate_number,
      email,
      city,
      state,
      pin_code,
      category,
      notes,
      project_id,
      project_ids,
      assigned_user_id,
    } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({
        success: false,
        message: 'Contact name is required',
      });
      return;
    }

    if (!mobile_number || !mobile_number.trim()) {
      res.status(400).json({
        success: false,
        message: 'Mobile number is required',
      });
      return;
    }

    const cleanNewMobile = mobile_number.trim().replace(/\D/g, '').slice(-10);
    if (cleanNewMobile.length < 10) {
      res.status(400).json({
        success: false,
        message: 'Mobile number must be at least 10 digits',
      });
      return;
    }

    // Check duplicate collision against other contacts
    const duplicateCheck = await pool.query<{ id: number; name: string }>(
      `SELECT id, name FROM contacts 
       WHERE id != $1 AND RIGHT(REGEXP_REPLACE(mobile_number, '[^0-9]', '', 'g'), 10) = $2
       LIMIT 1`,
      [contactId, cleanNewMobile]
    );

    if (duplicateCheck.rows.length > 0) {
      res.status(400).json({
        success: false,
        message: `A contact with mobile number ${mobile_number.trim()} already exists (${duplicateCheck.rows[0].name}).`,
      });
      return;
    }

    // If assigned_user_id is provided, verify caller exists and is not admin
    let parsedAssignedUserId: number | null = null;
    if (assigned_user_id !== undefined && assigned_user_id !== null && assigned_user_id !== '') {
      parsedAssignedUserId = parseInt(assigned_user_id, 10);
      if (!isNaN(parsedAssignedUserId)) {
        const user = await userModel.findById(parsedAssignedUserId);
        if (!user) {
          res.status(404).json({
            success: false,
            message: 'Assigned coordinator user not found',
          });
          return;
        }
        if (user.role === 'admin') {
          res.status(400).json({
            success: false,
            message: 'Contacts can only be assigned to coordinators (role: caller), not administrators.',
          });
          return;
        }
      } else {
        parsedAssignedUserId = null;
      }
    }

    let parsedProjectId: number | null = null;
    if (project_id !== undefined && project_id !== null && project_id !== '') {
      const pid = parseInt(project_id, 10);
      if (!isNaN(pid)) {
        parsedProjectId = pid;
      }
    }

    let parsedProjectIds: number[] | undefined = undefined;
    if (Array.isArray(project_ids)) {
      parsedProjectIds = project_ids.map((id: any) => parseInt(id, 10)).filter((id: number) => !isNaN(id));
    }

    const updated = await adminContactModel.updateContact(contactId, {
      name: name.trim(),
      mobile_number: mobile_number.trim(),
      alternate_number: alternate_number ? alternate_number.trim() : null,
      email: email ? email.trim() : null,
      city: city ? city.trim() : null,
      state: state ? state.trim() : null,
      pin_code: pin_code ? pin_code.trim() : null,
      category: category ? category.trim() : 'Other',
      notes: notes ? notes.trim() : null,
      project_id: parsedProjectId,
      project_ids: parsedProjectIds,
      assigned_user_id: parsedAssignedUserId,
    });

    if (!updated) {
      res.status(404).json({
        success: false,
        message: 'Contact not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Contact updated successfully',
      data: updated,
    });
  } catch (err: any) {
    console.error('Error updating contact:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update contact',
      error: err.message,
    });
  }
}



