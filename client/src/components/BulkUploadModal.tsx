import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Check,
  AlertTriangle,
} from 'lucide-react';
import apiClient from '../api/client';
import type { AdminUser, Project } from '../types';
import { getErrorMessage } from '../utils/format';

interface ParsedContactRow {
  name: string;
  mobile_number: string;
  category: string;
  city?: string;
  state?: string;
  pin_code?: string;
  email?: string;
  notes?: string;
  assigned_to?: string;
  isValid: boolean;
  isDuplicate?: boolean;
  errorReason?: string;
}

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkUploadModal: React.FC<BulkUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [existingDbNumbers, setExistingDbNumbers] = useState<Set<string>>(new Set());
  const [defaultUserId, setDefaultUserId] = useState<string>('');
  const [defaultProjectId, setDefaultProjectId] = useState<string>('');

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedContactRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    importedCount: number;
    assignedCount: number;
    unassignedCount: number;
    skippedCount?: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch available users, projects, and existing numbers for validation
  useEffect(() => {
    if (!isOpen) return;

    apiClient
      .get<{ success: boolean; data: { users: AdminUser[] } }>('/api/admin/users?limit=100')
      .then((res) => {
        if (res.data?.success && res.data.data) {
          setUsers(res.data.data.users.filter((u) => u.is_active && u.role === 'caller'));
        }
      })
      .catch(() => {});

    apiClient
      .get<{ success: boolean; data: { projects: Project[] } }>('/api/admin/projects?limit=100')
      .then((res) => {
        if (res.data?.success && res.data.data) {
          setProjects(res.data.data.projects.filter((p) => p.status === 'active'));
        }
      })
      .catch(() => {});

    apiClient
      .get<{ success: boolean; data: { numbers: string[] } }>('/api/admin/contacts/existing-numbers')
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.data?.numbers)) {
          setExistingDbNumbers(new Set(res.data.data.numbers));
        }
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  // Robust CSV line parser with duplicate & validity checks
  const parseCSV = (text: string, dbNumbers: Set<string>): ParsedContactRow[] => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) return [];

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim().replace(/^["']|["']$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      return result;
    };

    const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+|_/g, ''));

    const nameIdx = headers.findIndex((h) => h === 'name' || h === 'contactname' || h === 'fullname');
    const mobileIdx = headers.findIndex(
      (h) => h === 'mobilenumber' || h === 'mobile' || h === 'phone' || h === 'phonenumber' || h === 'contact'
    );
    const categoryIdx = headers.findIndex((h) => h === 'category' || h === 'type');
    const cityIdx = headers.findIndex((h) => h === 'city' || h === 'location');
    const stateIdx = headers.findIndex((h) => h === 'state' || h === 'province' || h === 'region');
    const pinCodeIdx = headers.findIndex(
      (h) => h === 'pincode' || h === 'pin' || h === 'postalcode' || h === 'zip' || h === 'zipcode'
    );
    const emailIdx = headers.findIndex((h) => h === 'email' || h === 'emailaddress');
    const notesIdx = headers.findIndex((h) => h === 'notes' || h === 'note' || h === 'context' || h === 'remarks');
    const assignedIdx = headers.findIndex(
      (h) =>
        h === 'assignedto' ||
        h === 'calleremail' ||
        h === 'assignedcaller' ||
        h === 'caller' ||
        h === 'assignedtoemail'
    );

    const rows: ParsedContactRow[] = [];
    const seenInCsv = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const parts = parseLine(lines[i]);
      if (parts.length === 0 || (parts.length === 1 && !parts[0])) continue;

      const name = nameIdx !== -1 && parts[nameIdx] ? parts[nameIdx].trim() : '';
      const rawMobile = mobileIdx !== -1 && parts[mobileIdx] ? parts[mobileIdx].trim() : '';
      const cleanDigits = rawMobile.replace(/\D/g, '');
      const tenDigits = cleanDigits.slice(-10);
      const category = categoryIdx !== -1 && parts[categoryIdx] ? parts[categoryIdx].trim() : 'Donor';
      const city = cityIdx !== -1 ? parts[cityIdx].trim() : undefined;
      const state = stateIdx !== -1 ? parts[stateIdx].trim() : undefined;
      const pin_code = pinCodeIdx !== -1 ? parts[pinCodeIdx].trim() : undefined;
      const email = emailIdx !== -1 ? parts[emailIdx].trim() : undefined;
      const notes = notesIdx !== -1 ? parts[notesIdx].trim() : undefined;
      const assigned_to = assignedIdx !== -1 ? parts[assignedIdx].trim() : undefined;

      let isValid = true;
      let isDuplicate = false;
      let errorReason: string | undefined = undefined;

      if (!name) {
        isValid = false;
        errorReason = 'Missing contact name';
      } else if (!rawMobile) {
        isValid = false;
        errorReason = 'Missing mobile number';
      } else if (cleanDigits.length < 10) {
        isValid = false;
        errorReason = 'Incomplete number (< 10 digits)';
      } else if (dbNumbers.has(tenDigits)) {
        isValid = false;
        isDuplicate = true;
        errorReason = 'Already exists in database';
      } else if (seenInCsv.has(tenDigits)) {
        isValid = false;
        isDuplicate = true;
        errorReason = 'Duplicate in upload file';
      } else {
        seenInCsv.add(tenDigits);
      }

      rows.push({
        name: name || 'Unknown',
        mobile_number: rawMobile,
        category,
        city,
        state,
        pin_code,
        email,
        notes,
        assigned_to,
        isValid,
        isDuplicate,
        errorReason,
      });
    }

    return rows;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setSuccessResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text, existingDbNumbers);
      setParsedRows(rows);
      if (rows.length === 0) {
        setError('No rows could be parsed. Please check that your file has proper headers.');
      }
    };
    reader.onerror = () => {
      setError('Failed to read the file.');
    };
    reader.readAsText(file);
  };

  const downloadSampleTemplate = () => {
    const sampleHeaders = 'name,mobile_number,category,state,city,pin_code,email,notes,assigned_to\n';

    const blob = new Blob([sampleHeaders], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'amp_contacts_bulk_sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const validCount = parsedRows.filter((r) => r.isValid && !r.isDuplicate).length;
  const duplicateCount = parsedRows.filter((r) => r.isDuplicate).length;
  const invalidCount = parsedRows.filter((r) => !r.isValid && !r.isDuplicate).length;
  const hasErrors = duplicateCount > 0 || invalidCount > 0;
  const canImport = validCount > 0 && !hasErrors;

  const handleImport = async () => {
    if (!canImport) {
      setError('Please fix all duplicate and invalid rows before importing.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        contacts: parsedRows,
        defaultUserId: defaultUserId || undefined,
        defaultProjectId: defaultProjectId || undefined,
      };

      const res = await apiClient.post<{
        success: boolean;
        message: string;
        data: {
          importedCount: number;
          assignedCount: number;
          unassignedCount: number;
          skippedCount: number;
        };
      }>('/api/admin/contacts/bulk-upload', payload);

      if (res.data?.success && res.data.data) {
        setSuccessResult(res.data.data);
        onSuccess();
      } else {
        setError(res.data?.message || 'Failed to import contacts.');
      }
    } catch (err: any) {
      console.error('Import error:', err);
      setError(getErrorMessage(err, 'Failed to import contacts. Please check your data.'));
    } finally {
      setLoading(false);
    }
  };

  const findMatchedUser = (email?: string): AdminUser | undefined => {
    if (!email) return undefined;
    const clean = email.toLowerCase().trim();
    return users.find((u) => u.email.toLowerCase() === clean);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-card-bg w-full max-w-4xl rounded-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-maroon/5 flex items-center justify-center text-maroon">
              <Upload size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Bulk Upload Contacts</h3>
              <p className="text-xs text-text-muted">
                Upload CSV spreadsheet to import and auto-assign contacts to coordinators
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {successResult ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 size={36} />
              </div>
              <div>
                <h4 className="text-lg font-bold text-gray-900">Import Completed!</h4>
                <p className="text-xs text-text-muted mt-1">
                  Successfully imported {successResult.importedCount} contacts into your database.
                </p>
              </div>

              <div className="max-w-md mx-auto grid grid-cols-3 gap-3 p-3 bg-[#FAF7F7] rounded-xl border border-gray-100 text-xs">
                <div>
                  <div className="font-bold text-gray-900 text-base">{successResult.importedCount}</div>
                  <div className="text-[11px] text-text-muted">Imported</div>
                </div>
                <div>
                  <div className="font-bold text-emerald-600 text-base">{successResult.assignedCount}</div>
                  <div className="text-[11px] text-text-muted">Assigned</div>
                </div>
                <div>
                  <div className="font-bold text-gray-600 text-base">{successResult.unassignedCount}</div>
                  <div className="text-[11px] text-text-muted">Unassigned</div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="mt-4 px-6 py-2 rounded-lg text-xs font-semibold text-white bg-maroon hover:bg-[#600f1c] transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* CSV Template Download */}
              <div className="p-3.5 rounded-xl bg-gray-50/70 border border-gray-200/60 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-gray-800">Need the CSV format?</div>
                  <div className="text-[11px] text-text-muted">
                    Download the pre-formatted template with all columns and sample rows.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={downloadSampleTemplate}
                  className="px-3 py-1.5 rounded-lg border border-maroon text-maroon hover:bg-maroon/5 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={13} />
                  Download Sample CSV
                </button>
              </div>

              {/* Upload Dropzone */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className={`p-5 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                  fileName
                    ? 'border-maroon/40 bg-maroon/5'
                    : 'border-gray-200 hover:border-maroon/40 hover:bg-gray-50/50'
                }`}
              >
                <div className="w-11 h-11 rounded-2xl bg-maroon/10 text-maroon flex items-center justify-center mb-1.5">
                  <FileSpreadsheet size={22} />
                </div>
                {fileName ? (
                  <div>
                    <span className="text-xs font-bold text-gray-900">{fileName}</span>
                    <p className="text-[11px] text-text-muted mt-0.5">Click to choose a different CSV file</p>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs font-bold text-gray-900">Click to upload contacts CSV</span>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      Supports .CSV files with columns: name, mobile_number, category, state, city, pin_code, email, notes, assigned_to
                    </p>
                  </div>
                )}
              </div>

              {/* Default Fallback Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-gray-700 uppercase tracking-wider text-[10px] mb-1">
                    Fallback Assigned Coordinator
                  </label>
                  <select
                    value={defaultUserId}
                    onChange={(e) => setDefaultUserId(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-gray-800 text-xs focus:outline-hidden focus:border-maroon"
                  >
                    <option value="">Unassigned (or as specified in CSV)</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.email})
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-text-muted mt-0.5 block">
                    Applied if `assigned_to` column in CSV is empty.
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 uppercase tracking-wider text-[10px] mb-1">
                    Target Campaign / Project (Optional)
                  </label>
                  <select
                    value={defaultProjectId}
                    onChange={(e) => setDefaultProjectId(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-gray-800 text-xs focus:outline-hidden focus:border-maroon"
                  >
                    <option value="">No Project Tag (General Contacts)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-text-muted mt-0.5 block">
                    Tags imported contacts to this campaign.
                  </span>
                </div>
              </div>

              {/* Parsed Preview Table with Actionable Validation */}
              {parsedRows.length > 0 && (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                      File Preview ({parsedRows.length} total rows)
                    </h4>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {validCount} Ready
                      </span>
                      {duplicateCount > 0 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                          {duplicateCount} Duplicate{duplicateCount === 1 ? '' : 's'}
                        </span>
                      )}
                      {invalidCount > 0 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          {invalidCount} Invalid
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actionable Discrepancy Alert Banner */}
                  {hasErrors ? (
                    <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-900 shadow-2xs">
                      <AlertTriangle size={16} className="shrink-0 text-red-600 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="font-bold text-red-900">
                          Action Required: {duplicateCount + invalidCount} error(s) detected ({duplicateCount} duplicate, {invalidCount} invalid)
                        </div>
                        <p className="text-[11px] text-red-700 leading-normal">
                          All contacts must be valid and unique before importing. Please remove the duplicate numbers from your CSV or correct the highlighted fields, then re-upload.
                        </p>
                      </div>
                    </div>
                  ) : validCount > 0 ? (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-900">
                      <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                      <span>
                        All <strong>{validCount} contact(s)</strong> verified successfully! No duplicates or errors found. Ready to import.
                      </span>
                    </div>
                  ) : null}

                  {/* Clean Table */}
                  <div className="border border-gray-100 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#FAF7F7] border-b border-gray-100 text-gray-500 font-semibold uppercase text-[10px]">
                          <th className="py-2 px-3 w-8 text-center">#</th>
                          <th className="py-2 px-3">Name</th>
                          <th className="py-2 px-3">Mobile Number</th>
                          <th className="py-2 px-3">Category</th>
                          <th className="py-2 px-3">Assigned To</th>
                          <th className="py-2 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {parsedRows.slice(0, 30).map((row, idx) => {
                          const matchedUser = findMatchedUser(row.assigned_to);

                          return (
                            <tr
                              key={idx}
                              className={`hover:bg-gray-50/50 ${
                                row.isDuplicate || !row.isValid ? 'bg-red-50/25' : ''
                              }`}
                            >
                              <td className="py-2 px-3 text-gray-400 font-mono text-[11px] text-center">
                                {idx + 1}
                              </td>

                              {/* Contact Name */}
                              <td className="py-2 px-3">
                                {row.name ? (
                                  <span className="font-semibold text-gray-900 whitespace-nowrap">
                                    {row.name}
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                                    Missing Name
                                  </span>
                                )}
                              </td>

                              {/* Highlighted Mobile Number */}
                              <td className="py-2 px-3">
                                {row.isDuplicate ? (
                                  <span
                                    className="inline-flex items-center gap-1 font-mono font-bold text-[11px] text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded"
                                    title={row.errorReason}
                                  >
                                    <AlertTriangle size={11} className="text-red-500 shrink-0" />
                                    {row.mobile_number}
                                  </span>
                                ) : !row.isValid && (!row.mobile_number || row.mobile_number.length < 10) ? (
                                  <span
                                    className="inline-flex items-center gap-1 font-mono font-bold text-[11px] text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded"
                                    title={row.errorReason}
                                  >
                                    <X size={11} className="text-red-500 shrink-0" />
                                    {row.mobile_number || 'Missing Number'}
                                  </span>
                                ) : (
                                  <span className="font-mono text-gray-800 text-xs font-medium">
                                    {row.mobile_number}
                                  </span>
                                )}
                              </td>

                              {/* Category */}
                              <td className="py-2 px-3">
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 whitespace-nowrap">
                                  {row.category}
                                </span>
                              </td>

                              {/* Coordinator */}
                              <td className="py-2 px-3">
                                {matchedUser ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                                    <Check size={10} className="text-emerald-600" />
                                    {matchedUser.full_name}
                                  </span>
                                ) : row.assigned_to ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap"
                                    title={row.assigned_to}
                                  >
                                    <AlertTriangle size={10} className="text-amber-600" />
                                    Unknown email
                                  </span>
                                ) : defaultUserId ? (
                                  <span className="text-[10px] text-gray-500 italic whitespace-nowrap">
                                    Default coordinator
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-gray-400 italic whitespace-nowrap">
                                    Unassigned
                                  </span>
                                )}
                              </td>

                              {/* Status Badge */}
                              <td className="py-2 px-3 text-right">
                                {row.isValid && !row.isDuplicate ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                    <Check size={11} className="text-emerald-600" />
                                    Ready
                                  </span>
                                ) : row.isDuplicate ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 whitespace-nowrap"
                                    title={row.errorReason}
                                  >
                                    <AlertTriangle size={11} className="text-red-500" />
                                    {row.errorReason}
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 whitespace-nowrap"
                                    title={row.errorReason}
                                  >
                                    <X size={11} className="text-red-500" />
                                    {row.errorReason || 'Invalid'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {parsedRows.length > 30 && (
                    <p className="text-[10px] text-gray-400 text-center italic">
                      Showing first 30 of {parsedRows.length} rows...
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-[#FAF7F7] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-200/70 transition-colors cursor-pointer"
          >
            {successResult ? 'Close' : 'Cancel'}
          </button>

          {!successResult && (
            <div className="flex items-center gap-3">
              {hasErrors && (
                <span className="text-[11px] text-red-600 font-medium hidden sm:inline">
                  Fix {duplicateCount + invalidCount} error(s) to enable import
                </span>
              )}
              <button
                type="button"
                onClick={handleImport}
                disabled={loading || !canImport}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-maroon hover:bg-[#600f1c] shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading && (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                )}
                {hasErrors
                  ? 'Fix Errors to Import'
                  : validCount > 0
                  ? `Import ${validCount} Contacts`
                  : 'Import Contacts'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
