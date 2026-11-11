import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  UserCheck,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  MapPin,
  Upload,
  FileSpreadsheet,
  Pencil,
  History,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import apiClient from '../api/client';
import { getErrorMessage } from '../utils/format';
import { AssignContactModal } from '../components/AssignContactModal';
import { BulkUploadModal } from '../components/BulkUploadModal';
import { EditContactModal } from '../components/EditContactModal';
import { ContactHistoryModal } from '../components/ContactHistoryModal';
import type {
  AdminContact,
  GetAdminContactsResponse,
  AdminUser,
  GetAdminUsersResponse,
  Project,
} from '../types';

const CATEGORIES = ['All', 'Donor', 'Beneficiary', 'Student', 'Volunteer', 'Other'];

export const AdminContactsPage: React.FC = () => {
  const [contacts, setContacts] = useState<AdminContact[]>([]);
  const [coordinators, setCoordinators] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Selection for Bulk Assignment
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Modal State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [contactToEdit, setContactToEdit] = useState<AdminContact | null>(null);
  const [selectedHistoryContactId, setSelectedHistoryContactId] = useState<number | null>(null);
  const [contactsToAssign, setContactsToAssign] = useState<AdminContact[]>([]);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Fetch Coordinators & Projects for the filter dropdowns
  useEffect(() => {
    apiClient
      .get<GetAdminUsersResponse>('/api/admin/users', { params: { limit: 100 } })
      .then((res) => {
        if (res.data?.data?.users) {
          // Filter to callers for coordinator filter dropdown
          setCoordinators(res.data.data.users.filter((u) => u.role === 'caller'));
        }
      })
      .catch(() => {});

    apiClient
      .get<{ success: boolean; data: { projects: Project[] } }>('/api/admin/projects', { params: { limit: 100 } })
      .then((res) => {
        if (res.data?.data?.projects) {
          setProjects(res.data.data.projects);
        }
      })
      .catch(() => {});
  }, []);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params: Record<string, any> = {
      page,
      limit,
    };

    if (search.trim()) params.search = search.trim();
    if (selectedCategory !== 'All') params.category = selectedCategory;
    if (assignedFilter === 'unassigned') {
      params.assignedUserId = 'unassigned';
    } else if (assignedFilter !== 'all') {
      params.assignedUserId = assignedFilter;
    }
    if (selectedProjectId !== 'all') {
      params.projectId = selectedProjectId;
    }

    try {
      const res = await apiClient.get<GetAdminContactsResponse>('/api/admin/contacts', { params });
      if (res.data?.data) {
        setContacts(res.data.data.contacts);
        setTotalPages(res.data.data.pagination.totalPages || 1);
        setTotalCount(res.data.data.pagination.total || 0);
      }
    } catch (err) {
      console.error('Failed to load contacts:', err);
      setError(getErrorMessage(err, 'Failed to retrieve contacts database.'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, selectedCategory, assignedFilter, selectedProjectId]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Handle Selection
  const handleToggleSelectAll = () => {
    if (selectedIds.size === contacts.length && contacts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  };

  const handleToggleSelectOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Open Modal for Single Contact
  const handleOpenSingleAssign = (contact: AdminContact) => {
    setContactsToAssign([contact]);
    setIsAssignModalOpen(true);
  };

  const handleOpenEditContact = (contact: AdminContact) => {
    setContactToEdit(contact);
    setIsEditModalOpen(true);
  };

  const handleContactUpdated = (updatedContact: AdminContact) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === updatedContact.id ? { ...c, ...updatedContact } : c))
    );
    setSuccessMessage(`Contact "${updatedContact.name}" updated successfully.`);
  };

  // Open Modal for Bulk Selection
  const handleOpenBulkAssign = () => {
    const selectedList = contacts.filter((c) => selectedIds.has(c.id));
    if (selectedList.length === 0) return;
    setContactsToAssign(selectedList);
    setIsAssignModalOpen(true);
  };

  const handleAssignSuccess = (assignedCount: number, targetUserName: string) => {
    setSuccessMessage(`Successfully assigned ${assignedCount} contact(s) to ${targetUserName}!`);
    setSelectedIds(new Set());
    fetchContacts();
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);

      let dataToExport: AdminContact[] = [];

      // If user has manually selected contacts via checkboxes, export only those
      if (selectedIds.size > 0) {
        dataToExport = contacts.filter((c) => selectedIds.has(c.id));
      } else {
        // Otherwise, fetch all contacts matching the current active filters (up to 10,000)
        const params: Record<string, any> = {
          page: 1,
          limit: 10000,
        };
        if (search.trim()) params.search = search.trim();
        if (selectedCategory !== 'All') params.category = selectedCategory;
        if (assignedFilter === 'unassigned') {
          params.assignedUserId = 'unassigned';
        } else if (assignedFilter !== 'all') {
          params.assignedUserId = assignedFilter;
        }
        if (selectedProjectId !== 'all') {
          params.projectId = selectedProjectId;
        }

        const res = await apiClient.get<GetAdminContactsResponse>('/api/admin/contacts', { params });
        dataToExport = res.data?.data?.contacts || [];
      }

      if (dataToExport.length === 0) {
        alert('No contacts available to export for the selected filters.');
        return;
      }

      // Map rows for clean Excel display
      const rows = dataToExport.map((c) => ({
        'Contact ID': c.id,
        'Name': c.name,
        'Mobile Number': String(c.mobile_number || ''),
        'Alternate Number': c.alternate_number ? String(c.alternate_number) : '',
        'Email': c.email || '',
        'State': c.state || '',
        'City': c.city || '',
        'Pin Code': c.pin_code || '',
        'Category': c.category || 'Other',
        'Associated Project(s)': c.project_names || c.project_name || 'General / Unassigned',
        'Assigned Coordinator': c.assigned_user_name || 'Unassigned',
        'Coordinator Email': c.assigned_user_email || '',
        'Total Calls': Number(c.total_calls || 0),
        'Last Called Date': c.last_called_at
          ? new Date(c.last_called_at).toLocaleString('en-IN')
          : 'Never',
        'Last Call Status': c.last_call_status || '-',
        'Last Call Outcome': c.last_call_outcome
          ? c.last_call_outcome.replace(/_/g, ' ')
          : '-',
        'Notes': c.notes || '',
        'Added Date': c.created_at
          ? new Date(c.created_at).toLocaleDateString('en-IN')
          : '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);

      // Auto-fit column widths
      const headers = Object.keys(rows[0] || {});
      const colWidths = headers.map((header) => {
        const maxLen = Math.max(
          header.length,
          ...rows.map((r) => String((r as any)[header] || '').length)
        );
        return { wch: Math.min(Math.max(maxLen + 2, 12), 35) };
      });
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `AMP_Contacts_${dateStr}.xlsx`;

      XLSX.writeFile(workbook, filename);

      setSuccessMessage(`Exported ${dataToExport.length} contact(s) to ${filename}`);
    } catch (err) {
      console.error('Failed to export contacts to Excel:', err);
      setError('Failed to export contacts to Excel. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const renderCategoryPill = (cat: string) => {
    const lower = (cat || '').toLowerCase();
    let colorClass = 'bg-gray-100 text-gray-700';

    if (lower === 'donor') colorClass = 'bg-amber-100 text-amber-800';
    else if (lower === 'beneficiary') colorClass = 'bg-blue-100 text-blue-800';
    else if (lower === 'student') colorClass = 'bg-emerald-100 text-emerald-800';
    else if (lower === 'volunteer') colorClass = 'bg-purple-100 text-purple-800';

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize whitespace-nowrap ${colorClass}`}
      >
        {cat}
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-text-main tracking-tight">
              Contacts Database &amp; Assignment
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gold/15 text-amber-800">
              Admin
            </span>
          </div>
          <p className="text-sm text-text-muted mt-1">
            Master database of contacts, multi-project history, and coordinator assignment
          </p>
        </div>

        {/* Top Actions: Bulk Upload & Bulk Assign */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setIsBulkUploadModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-900 transition-all shadow-xs cursor-pointer"
          >
            <Upload size={16} />
            <span>Bulk Upload CSV</span>
          </button>

          <button
            type="button"
            onClick={handleOpenBulkAssign}
            disabled={selectedIds.size === 0}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm cursor-pointer ${
              selectedIds.size > 0
                ? 'bg-maroon text-white hover:bg-maroon-hover'
                : 'bg-gray-100 text-text-muted border border-gray-200 opacity-60 cursor-not-allowed'
            }`}
          >
            <UserCheck size={16} />
            <span>Assign Selected ({selectedIds.size})</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchContacts()}
            className="font-semibold text-red-900 underline hover:no-underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Category Quick Filter Pills Bar */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 flex items-center gap-2 overflow-x-auto">
        <span className="text-xs font-bold text-text-muted uppercase tracking-wider shrink-0 mr-1">
          Category:
        </span>
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setSelectedCategory(cat);
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-maroon text-white shadow-2xs'
                  : 'bg-gray-100 text-text-main hover:bg-gray-200/70'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Full-Width Contacts Table Card */}
      <div className="w-full bg-card-bg rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Search & Filter Toolbar */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, mobile, email, city..."
              className="w-full h-[40px] pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm text-text-main placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition"
            />
          </div>

          {/* Project & Coordinator Filters & Refresh */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Excel Export Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting}
              title={
                selectedIds.size > 0
                  ? `Export ${selectedIds.size} selected contact(s) to Excel`
                  : `Export contacts matching current filters to Excel`
              }
              className="h-[40px] px-3.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet size={15} className="text-emerald-600 shrink-0" />
              <span>{isExporting ? 'Exporting...' : 'Excel'}</span>
              {selectedIds.size > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  {selectedIds.size}
                </span>
              )}
            </button>

            {/* Filter by Project */}
            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by project"
              className="h-[40px] px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 cursor-pointer max-w-[180px] truncate"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Filter by Coordinator */}
            <select
              value={assignedFilter}
              onChange={(e) => {
                setAssignedFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by assigned coordinator"
              className="h-[40px] px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 cursor-pointer max-w-[180px] truncate"
            >
              <option value="all">All Coordinators</option>
              <option value="unassigned">Unassigned Only</option>
              {coordinators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>

            {/* Reset Filters (shown when filters active) */}
            {(selectedProjectId !== 'all' || assignedFilter !== 'all' || selectedCategory !== 'All' || search.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedProjectId('all');
                  setAssignedFilter('all');
                  setSelectedCategory('All');
                  setSearch('');
                  setPage(1);
                }}
                title="Reset all filters"
                className="h-[40px] px-2.5 rounded-lg border border-gray-200 bg-gray-50 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors cursor-pointer shrink-0"
              >
                Reset
              </button>
            )}

            <button
              type="button"
              onClick={() => fetchContacts()}
              title="Refresh contacts"
              className="h-[40px] w-[40px] flex items-center justify-center rounded-lg border border-gray-200 text-text-muted hover:text-maroon hover:bg-maroon/5 transition-colors cursor-pointer shrink-0"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin text-maroon' : ''} />
            </button>
          </div>
        </div>

        {/* Table */}
        {loading && contacts.length === 0 ? (
          <div className="p-12 text-center text-text-muted text-sm">Loading contacts directory...</div>
        ) : contacts.length === 0 ? (
          <div className="p-12 text-center text-text-muted text-sm">
            No contacts found matching your search and filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/50 border-b border-gray-100 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === contacts.length && contacts.length > 0}
                      onChange={handleToggleSelectAll}
                      aria-label="Select all contacts"
                      className="rounded text-maroon focus:ring-maroon cursor-pointer"
                    />
                  </th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Contact Name &amp; Email</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Phone &amp; Alt Phone</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Location</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Notes</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Category</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Assigned Coordinator</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Calls &amp; Outcome</th>
                  <th className="py-3.5 px-6 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map((contact) => {
                  const isChecked = selectedIds.has(contact.id);

                  return (
                    <tr
                      key={contact.id}
                      className={`transition-colors ${
                        isChecked ? 'bg-maroon/4' : 'hover:bg-page-bg/40'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-4 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelectOne(contact.id)}
                          aria-label={`Select ${contact.name}`}
                          className="rounded text-maroon focus:ring-maroon cursor-pointer"
                        />
                      </td>

                      {/* Name & Email */}
                      <td className="py-4 px-4 min-w-[200px]">
                        <div className="font-semibold text-text-main">{contact.name}</div>
                        {contact.email ? (
                          <div className="text-xs text-text-muted truncate mt-0.5">
                            {contact.email}
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted/60">—</span>
                        )}
                      </td>

                      {/* Mobile & Alt */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="font-semibold text-text-main flex items-center gap-1.5">
                          <span>{contact.mobile_number}</span>
                        </div>
                        {contact.alternate_number && (
                          <div className="text-xs text-text-muted mt-0.5">
                            Alt: {contact.alternate_number}
                          </div>
                        )}
                      </td>

                      {/* Location */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        {(contact.city || contact.state || contact.pin_code) ? (
                          <div className="text-xs font-medium text-text-main flex items-center gap-1">
                            <MapPin size={12} className="text-text-muted shrink-0" />
                            <span>
                              {[contact.state, contact.city].filter(Boolean).join(', ')}
                              {contact.pin_code ? ` - ${contact.pin_code}` : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted/60">—</span>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="py-4 px-4 max-w-xs">
                        {contact.notes ? (
                          <div className="text-xs text-text-muted truncate" title={contact.notes}>
                            {contact.notes}
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted/60">—</span>
                        )}
                      </td>

                      {/* Category & Associated Projects */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          {renderCategoryPill(contact.category)}
                          {contact.projects && contact.projects.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[150px]">
                              {contact.projects.map((proj) => (
                                <span
                                  key={proj.id}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200"
                                >
                                  {proj.name}
                                </span>
                              ))}
                            </div>
                          ) : contact.project_name ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                              {contact.project_name}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Assigned Coordinator */}
                      <td className="py-4 px-4 min-w-[180px]">
                        {contact.assigned_user_name ? (
                          <div>
                            <div className="font-semibold text-text-main flex items-center gap-1.5 whitespace-nowrap">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span>{contact.assigned_user_name}</span>
                            </div>
                            <div className="text-xs text-text-muted truncate mt-0.5">
                              {contact.assigned_user_email}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Calls & Outcome */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="font-semibold text-text-main">
                          {contact.total_calls} calls
                        </div>
                        {contact.last_call_outcome ? (
                          <div className="text-xs capitalize font-medium text-amber-700 mt-0.5">
                            {contact.last_call_outcome.replace('_', ' ')}
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">Not called</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedHistoryContactId(contact.id)}
                            title="View Call History & Details"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 transition-colors cursor-pointer"
                          >
                            <History size={13} />
                            <span>History</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditContact(contact)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-maroon text-maroon hover:bg-maroon hover:text-white transition-colors cursor-pointer"
                            title="Edit Contact"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenSingleAssign(contact)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-maroon hover:bg-maroon/10 transition-colors cursor-pointer"
                            title="Assign Coordinator"
                          >
                            <UserCheck size={13} />
                            <span>Assign</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalCount > 0 && (
          <div className="px-4 sm:px-5 py-3.5 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-text-muted">
            <div className="flex items-center gap-3">
              <span>
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalCount)} of {totalCount}
              </span>
              <div className="flex items-center gap-1.5">
                <label htmlFor="contacts-page-size" className="text-xs">
                  Rows:
                </label>
                <select
                  id="contacts-page-size"
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-8 px-2 rounded-md border border-gray-300 bg-white text-xs text-text-main focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-text-main transition cursor-pointer"
              >
                <ChevronLeft size={15} />
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-text-main transition cursor-pointer"
              >
                Next
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Assignment Modal */}
      <AssignContactModal
        isOpen={isAssignModalOpen}
        contacts={contactsToAssign}
        onClose={() => setIsAssignModalOpen(false)}
        onSuccess={handleAssignSuccess}
      />

      {/* Bulk Upload CSV Modal */}
      <BulkUploadModal
        isOpen={isBulkUploadModalOpen}
        onClose={() => setIsBulkUploadModalOpen(false)}
        onSuccess={() => {
          fetchContacts();
          setSuccessMessage('Contacts imported successfully!');
        }}
      />

      {/* Edit Contact Modal */}
      <EditContactModal
        isOpen={isEditModalOpen}
        contact={contactToEdit}
        coordinators={coordinators}
        projects={projects}
        onClose={() => {
          setIsEditModalOpen(false);
          setContactToEdit(null);
        }}
        onSuccess={handleContactUpdated}
      />

      {/* Contact Call History Modal */}
      {selectedHistoryContactId && (
        <ContactHistoryModal
          contactId={selectedHistoryContactId}
          onClose={() => setSelectedHistoryContactId(null)}
        />
      )}
    </div>
  );
};
