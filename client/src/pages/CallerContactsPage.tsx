import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RotateCcw,
  History,
  Copy,
  Check,
  MapPin,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Users,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import apiClient from '../api/client';
import type { CallerContact, GetCallerContactsResponse } from '../types';
import { formatDateTime, getErrorMessage } from '../utils/format';
import { ContactHistoryModal } from '../components/ContactHistoryModal';

const CATEGORIES = ['All', 'Donor', 'Beneficiary', 'Student', 'Volunteer'];

export const CallerContactsPage: React.FC = () => {
  const [contacts, setContacts] = useState<CallerContact[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Loading & error
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Contact history modal
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params: Record<string, string | number> = {
        page,
        limit,
      };

      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }
      if (selectedCategory !== 'All') {
        params.category = selectedCategory;
      }

      const res = await apiClient.get<GetCallerContactsResponse>('/api/contacts', { params });
      if (res.data?.success && res.data.data) {
        setContacts(res.data.data.contacts || []);
        const p = res.data.data.pagination;
        setTotalPages(p?.totalPages || 1);
        setTotalCount(p?.total || 0);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to fetch assigned contacts.'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedCategory, page, limit]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const handleCopyPhone = (id: number, phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category?.toLowerCase()) {
      case 'donor':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'beneficiary':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'student':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'volunteer':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);

      const params: Record<string, string | number> = {
        page: 1,
        limit: 5000,
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (selectedCategory !== 'All') params.category = selectedCategory;

      const res = await apiClient.get<GetCallerContactsResponse>('/api/contacts', { params });
      const dataToExport = res.data?.data?.contacts || [];

      if (dataToExport.length === 0) {
        alert('No contacts available to export.');
        return;
      }

      const rows = dataToExport.map((c) => ({
        'Contact Name': c.name,
        'Mobile Number': String(c.mobile_number || ''),
        'Alternate Number': c.alternate_number ? String(c.alternate_number) : '',
        'Email': c.email || '',
        'State': c.state || '',
        'City': c.city || '',
        'Pin Code': c.pin_code || '',
        'Category': c.category || 'Other',
        'Total Calls': Number(c.total_calls || 0),
        'Last Called Date': c.last_called_at ? formatDateTime(c.last_called_at) : 'Never',
        'Last Call Status': c.last_call_status || '-',
        'Notes': c.notes || '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);

      // Auto-fit column widths
      const headers = Object.keys(rows[0] || {});
      worksheet['!cols'] = headers.map((header) => {
        const maxLen = Math.max(
          header.length,
          ...rows.map((r) => String((r as any)[header] || '').length)
        );
        return { wch: Math.min(Math.max(maxLen + 2, 12), 35) };
      });

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'My Contacts');

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `My_Assigned_Contacts_${dateStr}.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error('Failed to export caller contacts:', err);
      setError('Failed to export contacts to Excel.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            My Assigned Contacts
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Browse and connect with contacts assigned to your calling queue.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Excel Export Button */}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting || totalCount === 0}
            title="Download My Contacts in Excel"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            <span>{exporting ? 'Exporting...' : 'Excel'}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchContacts()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-xs cursor-pointer"
          >
            <RotateCcw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by contact name, phone, or notes..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50/70 border border-gray-200 rounded-xl text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-maroon/20 focus:border-maroon transition-all"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-maroon text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200/70'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Table Sub-header */}
        <div className="border-b border-gray-100 px-4 sm:px-6 py-3 flex items-center justify-between bg-[#FCFAFA] text-xs text-gray-500">
          <div>
            Showing <strong className="text-gray-800">{contacts.length}</strong> of{' '}
            <strong className="text-gray-800">{totalCount}</strong> contacts
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="m-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <AlertCircle size={16} className="text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading Spinner */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-400 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-maroon border-t-transparent animate-spin" />
            <span className="text-xs font-medium text-gray-500">Loading contacts...</span>
          </div>
        ) : contacts.length === 0 ? (
          /* Empty State */
          <div className="py-16 px-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
              <Users size={28} />
            </div>
            <h3 className="text-sm font-bold text-gray-800">No contacts found</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
              {debouncedSearch || selectedCategory !== 'All'
                ? 'Try adjusting your search keywords or category filters.'
                : 'No contacts are currently assigned to your queue. Your administrator will allocate contacts soon.'}
            </p>
          </div>
        ) : (
          /* Responsive Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-[#FAF7F7] text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 sm:px-6">Contact Name</th>
                  <th className="py-3 px-4">Mobile Number</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Total Calls</th>
                  <th className="py-3 px-4">Last Called</th>
                  <th className="py-3 px-4">Notes</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map((c) => {
                  const callCount = Number(c.total_calls || 0);

                  return (
                    <tr key={c.id} className="hover:bg-[#FCFAFA] transition-colors">
                      {/* Contact Name */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <button
                          type="button"
                          onClick={() => setSelectedContactId(c.id)}
                          className="font-bold text-gray-900 text-sm hover:text-maroon text-left cursor-pointer transition-colors"
                        >
                          {c.name}
                        </button>
                      </td>

                      {/* Phone */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-800 font-semibold">
                            {c.mobile_number}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyPhone(c.id, c.mobile_number)}
                            title="Copy number"
                            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors cursor-pointer"
                          >
                            {copiedId === c.id ? (
                              <Check size={13} className="text-emerald-600" />
                            ) : (
                              <Copy size={13} />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Location */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {(() => {
                          const location = [c.state, c.city].filter(Boolean).join(', ') + (c.pin_code ? ` - ${c.pin_code}` : '');
                          return location ? (
                            <span className="text-[11px] text-gray-600 flex items-center gap-1">
                              <MapPin size={11} className="text-gray-400 shrink-0" />
                              {location}
                            </span>
                          ) : (
                            <span className="text-[11px] text-gray-400">—</span>
                          );
                        })()}
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${getCategoryBadgeClass(
                            c.category
                          )}`}
                        >
                          {c.category}
                        </span>
                      </td>

                      {/* Total Calls */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            callCount > 0
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {callCount} {callCount === 1 ? 'call' : 'calls'}
                        </span>
                      </td>

                      {/* Last Called & Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {c.last_called_at ? (
                          <div className="flex flex-col">
                            <span className="text-gray-800 font-medium">
                              {formatDateTime(c.last_called_at)}
                            </span>
                            {c.last_call_status && (
                              <span className="text-[10px] flex items-center gap-1 mt-0.5">
                                {c.last_call_status === 'answered' ? (
                                  <span className="text-emerald-600 flex items-center gap-0.5 font-semibold">
                                    <CheckCircle2 size={11} /> Answered
                                  </span>
                                ) : (
                                  <span className="text-rose-600 flex items-center gap-0.5 font-semibold">
                                    <XCircle size={11} /> Unanswered
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">Not called yet</span>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="text-gray-600 line-clamp-1">
                          {c.notes || <span className="text-gray-400 italic">—</span>}
                        </p>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end">
                          {/* History button */}
                          <button
                            type="button"
                            onClick={() => setSelectedContactId(c.id)}
                            title="View Call History & Details"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 transition-colors cursor-pointer"
                          >
                            <History size={13} />
                            <span>History</span>
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
                <label htmlFor="caller-contacts-page-size" className="text-xs">
                  Rows:
                </label>
                <select
                  id="caller-contacts-page-size"
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
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-text-main transition cursor-pointer"
              >
                <ChevronLeft size={15} />
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
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

      {/* Contact History & Detail Modal */}
      {selectedContactId && (
        <ContactHistoryModal
          contactId={selectedContactId}
          onClose={() => setSelectedContactId(null)}
        />
      )}
    </div>
  );
};
