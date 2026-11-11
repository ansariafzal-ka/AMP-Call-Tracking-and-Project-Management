import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as projectModel from '../models/projectModel';

export async function getProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : undefined;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const { projects, total } = await projectModel.getProjects(
      { search, status },
      limit,
      offset
    );

    res.status(200).json({
      success: true,
      data: {
        projects,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err: any) {
    console.error('Error fetching admin projects:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch projects',
      error: err.message,
    });
  }
}

export async function createProject(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { name, description, startDate, endDate, status } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, message: 'Project name is required' });
      return;
    }

    const newId = await projectModel.createProject({
      name,
      description,
      startDate,
      endDate,
      status: status || 'active',
    });

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: { id: newId, name },
    });
  } catch (err: any) {
    console.error('Error creating project:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to create project',
      error: err.message,
    });
  }
}

export async function getProjectById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const projectId = parseInt(idParam, 10);
    if (!projectId || isNaN(projectId)) {
      res.status(400).json({ success: false, message: 'Invalid project ID' });
      return;
    }

    const project = await projectModel.getProjectById(projectId);
    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    const [callers, contacts] = await Promise.all([
      projectModel.getProjectCallers(projectId),
      projectModel.getProjectContacts(projectId),
    ]);

    res.status(200).json({
      success: true,
      data: {
        project,
        callers,
        contacts,
      },
    });
  } catch (err: any) {
    console.error('Error fetching project by id:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project details',
      error: err.message,
    });
  }
}

export async function updateProject(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const projectId = parseInt(idParam, 10);
    if (!projectId || isNaN(projectId)) {
      res.status(400).json({ success: false, message: 'Invalid project ID' });
      return;
    }

    const { name, description, startDate, endDate, status } = req.body;

    const updated = await projectModel.updateProject(projectId, {
      name,
      description,
      startDate,
      endDate,
      status,
    });

    if (!updated) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Project updated successfully',
      data: updated,
    });
  } catch (err: any) {
    console.error('Error updating project:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update project',
      error: err.message,
    });
  }
}

export async function assignProjectMembers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const projectId = parseInt(idParam, 10);
    if (!projectId || isNaN(projectId)) {
      res.status(400).json({ success: false, message: 'Invalid project ID' });
      return;
    }

    const { userIds, contactIds, action } = req.body;

    if ((!userIds || userIds.length === 0) && (!contactIds || contactIds.length === 0)) {
      res.status(400).json({
        success: false,
        message: 'At least userIds or contactIds array must be provided',
      });
      return;
    }

    const project = await projectModel.getProjectById(projectId);
    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    const result = await projectModel.assignProjectMembers(
      projectId,
      userIds ? userIds.map((id: any) => parseInt(id, 10)) : undefined,
      contactIds ? contactIds.map((id: any) => parseInt(id, 10)) : undefined,
      action === 'remove' ? 'remove' : 'add'
    );

    res.status(200).json({
      success: true,
      message: `Project members successfully updated`,
      data: result,
    });
  } catch (err: any) {
    console.error('Error assigning project members:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update project members',
      error: err.message,
    });
  }
}

