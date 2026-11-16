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
  FolderKanban,
} from 'lucide-react';
import * as XLSX from 'xlsx';
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
  projects?: string;
  project_ids?: number[];
  missingProjects?: string[];
  isValid: boolean;
  isDuplicate?: boolean;
  errorReason?: string;
}

// Standard Indian States & Union Territories (36 total)
const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

// Standard Major Indian Cities & Regional Hubs (sorted alphabetically)
const STANDARD_CITIES = [
  'Agra',
  'Ahmedabad',
  'Ahmednagar',
  'Ajmer',
  'Akola',
  'Aligarh',
  'Allahabad (Prayagraj)',
  'Alwar',
  'Amravati',
  'Amritsar',
  'Asansol',
  'Aurangabad (Chhatrapati Sambhaji Nagar)',
  'Bareilly',
  'Belagavi',
  'Bengaluru',
  'Bhavnagar',
  'Bhilai',
  'Bhiwandi',
  'Bhopal',
  'Bhubaneswar',
  'Bikaner',
  'Chandigarh',
  'Chennai',
  'Coimbatore',
  'Cuttack',
  'Dehradun',
  'Delhi NCR',
  'Dhanbad',
  'Durgapur',
  'Faridabad',
  'Firozabad',
  'Ghaziabad',
  'Gorakhpur',
  'Guntur',
  'Gurugram',
  'Guwahati',
  'Gwalior',
  'Hubballi-Dharwad',
  'Hyderabad',
  'Indore',
  'Jabalpur',
  'Jaipur',
  'Jalandhar',
  'Jalgaon',
  'Jammu',
  'Jamnagar',
  'Jamshedpur',
  'Jhansi',
  'Jodhpur',
  'Kannur',
  'Kanpur',
  'Kochi',
  'Kolhapur',
  'Kolkata',
  'Kollam',
  'Kota',
  'Kozhikode',
  'Kurnool',
  'Lucknow',
  'Ludhiana',
  'Madurai',
  'Malappuram',
  'Malegaon',
  'Mangaluru',
  'Meerut',
  'Moradabad',
  'Mumbai',
  'Muzaffarnagar',
  'Muzaffarpur',
  'Mysuru',
  'Nagpur',
  'Nanded',
  'Nashik',
  'Navi Mumbai',
  'Noida',
  'Palakkad',
  'Patna',
  'Pune',
  'Raipur',
  'Rajahmundry',
  'Rajkot',
  'Ranchi',
  'Saharanpur',
  'Salem',
  'Sangli',
  'Shimla',
  'Siliguri',
  'Solapur',
  'Srinagar',
  'Surat',
  'Thane',
  'Thiruvananthapuram',
  'Thrissur',
  'Tiruchirappalli',
  'Tirunelveli',
  'Udaipur',
  'Ujjain',
  'Vadodara',
  'Varanasi',
  'Vasai-Virar',
  'Vijayawada',
  'Visakhapatnam',
  'Warangal',
];

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
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedContactRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    batchId?: number;
    fileName?: string;
    importedCount: number;
    mergedCount?: number;
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

  // Robust Excel (.xlsx, .xls) and CSV parser with duplicate & validity checks
  const parseExcelOrCsv = (buffer: ArrayBuffer, dbNumbers: Set<string>): ParsedContactRow[] => {
    try {
      const data = new Uint8Array(buffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return [];
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) return [];

      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
        defval: '',
        raw: false,
      });

      if (rawRows.length === 0) return [];

      // Helper to match column headers case-insensitively ignoring spaces & underscores
      const getVal = (row: Record<string, any>, possibleKeys: string[]): string => {
        const rowKeys = Object.keys(row);
        for (const pk of possibleKeys) {
          const foundKey = rowKeys.find(
            (rk) => rk.toLowerCase().replace(/[^a-z0-9]/g, '') === pk
          );
          if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
            return String(row[foundKey]).trim();
          }
        }
        return '';
      };

      const rows: ParsedContactRow[] = [];
      const seenInSheet = new Set<string>();

      for (let i = 0; i < rawRows.length; i++) {
        const raw = rawRows[i];

        const name = getVal(raw, ['name', 'contactname', 'fullname']);
        const rawMobile = getVal(raw, [
          'mobilenumber',
          'mobile',
          'phone',
          'phonenumber',
          'contact',
          'contactnumber',
        ]);
        const cleanDigits = rawMobile.replace(/\D/g, '');
        const tenDigits = cleanDigits.slice(-10);

        const category = getVal(raw, ['category', 'type']) || 'Donor';
        const projectsStr = getVal(raw, ['projects', 'project', 'campaign', 'campaigns']);
        const city = getVal(raw, ['city', 'location']) || undefined;
        const state = getVal(raw, ['state', 'province', 'region']) || undefined;
        const pin_code = getVal(raw, ['pincode', 'pin', 'postalcode', 'zip', 'zipcode']) || undefined;
        const email = getVal(raw, ['email', 'emailaddress']) || undefined;
        const notes = getVal(raw, ['notes', 'note', 'context', 'remarks', 'comment']) || undefined;
        const assigned_to = getVal(raw, [
          'assignedto',
          'calleremail',
          'assignedcaller',
          'caller',
          'assignedtoemail',
          'assignedcoordinator',
          'coordinator',
          'assignedcoordinatoremail',
        ]) || undefined;

        // Skip completely empty rows
        if (!name && !rawMobile && !email && !city) continue;

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
        } else if (seenInSheet.has(tenDigits)) {
          isValid = false;
          isDuplicate = true;
          errorReason = 'Duplicate in upload file';
        } else {
          seenInSheet.add(tenDigits);
        }

        // Match project IDs if projects column is populated in Excel
        let rowProjectIds: number[] = [];
        const missingProjects: string[] = [];
        if (projectsStr) {
          const names = projectsStr
            .split(/[;,|]/)
            .map((s) => s.trim())
            .filter(Boolean);
          for (const rawName of names) {
            const cleanName = rawName.toLowerCase();
            const match = projects.find((p) => p.name.toLowerCase().trim() === cleanName);
            if (match) {
              if (!rowProjectIds.includes(match.id)) {
                rowProjectIds.push(match.id);
              }
            } else {
              missingProjects.push(rawName);
            }
          }

          if (missingProjects.length > 0) {
            isValid = false;
            errorReason = `Project not found: ${missingProjects.map((m) => `"${m}"`).join(', ')}`;
          }
        }

        rows.push({
          name: name || 'Unknown',
          mobile_number: rawMobile,
          category,
          projects: projectsStr || undefined,
          project_ids: rowProjectIds.length > 0 ? rowProjectIds : undefined,
          missingProjects: missingProjects.length > 0 ? missingProjects : undefined,
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
    } catch (err: any) {
      console.error('Failed to parse Excel file:', err);
      return [];
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setSuccessResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const rows = parseExcelOrCsv(buffer, existingDbNumbers);
        setParsedRows(rows);
        if (rows.length === 0) {
          setError('No rows could be parsed. Please verify your Excel sheet contains the proper column headers.');
        }
      } catch (err: any) {
        setError('Failed to parse file: ' + (err?.message || 'Invalid format'));
      }
    };
    reader.onerror = () => {
      setError('Failed to read the file.');
    };
    reader.readAsArrayBuffer(file);
  };

  // Download Blank Excel Template (.xlsx) with native In-Cell Dropdowns for Category & Coordinators
  const downloadExcelTemplate = async () => {
    try {
      const ExcelJS = await import('exceljs');
      const WorkbookClass = (ExcelJS as any).Workbook || (ExcelJS as any).default?.Workbook || (ExcelJS as any).default;
      const wb = new WorkbookClass();
      const ws = wb.addWorksheet('Contacts');
      const refWs = wb.addWorksheet('Lists');
      refWs.state = 'hidden'; // Keep lists clean in a hidden reference tab

      const categories = ['Donor', 'Beneficiary', 'Student', 'Volunteer', 'Other'];
      const coordinatorEmails = users
        .map((u) => u.email)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      const projectNames = projects
        .map((p) => p.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      // Populate reference lists
      categories.forEach((cat, i) => {
        refWs.getCell(`A${i + 1}`).value = cat;
      });

      coordinatorEmails.forEach((email, i) => {
        refWs.getCell(`B${i + 1}`).value = email;
      });

      INDIAN_STATES.forEach((st, i) => {
        refWs.getCell(`C${i + 1}`).value = st;
      });

      STANDARD_CITIES.forEach((ct, i) => {
        refWs.getCell(`D${i + 1}`).value = ct;
      });

      projectNames.forEach((proj, i) => {
        refWs.getCell(`E${i + 1}`).value = proj;
      });

      // Define Contacts columns with spacious auto-widths
      ws.columns = [
        { header: 'Name', key: 'name', width: 22 },
        { header: 'Mobile Number', key: 'mobile', width: 16 },
        { header: 'Category', key: 'category', width: 16 },
        { header: 'Projects', key: 'projects', width: 28 },
        { header: 'City', key: 'city', width: 20 },
        { header: 'State', key: 'state', width: 24 },
        { header: 'Pin Code', key: 'pin', width: 12 },
        { header: 'Email', key: 'email', width: 26 },
        { header: 'Notes', key: 'notes', width: 30 },
        { header: 'Assigned Coordinator Email', key: 'coordinator', width: 30 },
      ];

      // Clean bold header styling
      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FF1F2937' }, size: 11 };
      headerRow.height = 24;

      // Apply in-cell dropdown rules for rows 2 through 500
      for (let r = 2; r <= 500; r++) {
        // Category dropdown (Permissive: shows preset dropdown list, but allows typing custom categories)
        ws.getCell(`C${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Lists!$A$1:$A$${categories.length}`],
          showErrorMessage: false,
        };

        // Projects dropdown (Permissive: shows active projects, allows typing single or multiple separated by ;)
        if (projectNames.length > 0) {
          ws.getCell(`D${r}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`Lists!$E$1:$E$${projectNames.length}`],
            showErrorMessage: false,
          };
        }

        // City dropdown (Permissive: shows standard cities, allows typing unlisted towns)
        ws.getCell(`E${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Lists!$D$1:$D$${STANDARD_CITIES.length}`],
          showErrorMessage: false,
        };

        // State dropdown (Permissive: shows 36 Indian states & UTs, allows typing custom)
        ws.getCell(`F${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Lists!$C$1:$C$${INDIAN_STATES.length}`],
          showErrorMessage: false,
        };

        // Coordinator dropdown (Shows active coordinators, allows typing or selecting)
        if (coordinatorEmails.length > 0) {
          ws.getCell(`J${r}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`Lists!$B$1:$B$${coordinatorEmails.length}`],
            showErrorMessage: false,
          };
        }
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'amp_contacts_template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Failed to generate Excel template with dropdowns:', err);
      // Fallback to basic template if ExcelJS encounters any issue
      const headers = [
        'Name',
        'Mobile Number',
        'Category',
        'Projects',
        'City',
        'State',
        'Pin Code',
        'Email',
        'Notes',
        'Assigned Coordinator Email',
      ];
      const worksheet = XLSX.utils.aoa_to_sheet([headers]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');
      XLSX.writeFile(workbook, 'amp_contacts_template.xlsx');
    }
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
        fileName: fileName || undefined,
        defaultUserId: defaultUserId || undefined,
        defaultProjectId: selectedProjectIds.length > 0 ? selectedProjectIds[0] : undefined,
        project_ids: selectedProjectIds,
      };

      const res = await apiClient.post<{
        success: boolean;
        message: string;
        data: {
          batchId?: number;
          fileName?: string;
          importedCount: number;
          mergedCount?: number;
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
              <h3 className="text-base font-bold text-gray-900">Bulk Upload Contacts (Excel)</h3>
              <p className="text-xs text-text-muted">
                Upload Excel spreadsheet (.xlsx, .xls) to import, tag projects, and assign contacts to coordinators
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
                {successResult.batchId && (
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-maroon/10 text-maroon mb-2">
                    Batch #{successResult.batchId} Created
                  </span>
                )}
                <h4 className="text-lg font-bold text-gray-900">Import Completed!</h4>
                <p className="text-xs text-text-muted mt-1">
                  File: <span className="font-semibold text-gray-700">{fileName || 'contacts.csv'}</span>
                </p>
              </div>

              <div className="max-w-md mx-auto grid grid-cols-4 gap-2 p-3 bg-[#FAF7F7] rounded-xl border border-gray-100 text-xs">
                <div>
                  <div className="font-bold text-gray-900 text-base">{successResult.importedCount}</div>
                  <div className="text-[11px] text-text-muted">New</div>
                </div>
                <div>
                  <div className="font-bold text-amber-600 text-base">{successResult.mergedCount || 0}</div>
                  <div className="text-[11px] text-text-muted">Merged</div>
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
              {/* Excel Template Download */}
              <div className="p-3.5 rounded-xl bg-gray-50/70 border border-gray-200/60 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-gray-800">Need the Excel template?</div>
                  <div className="text-[11px] text-text-muted">
                    Download the clean blank template (.xlsx) with all columns ready for data entry.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={downloadExcelTemplate}
                  className="px-3 py-1.5 rounded-lg border border-maroon text-maroon hover:bg-maroon/5 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={13} />
                  Download Excel Template (.xlsx)
                </button>
              </div>

              {/* Upload Dropzone */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
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
                    <p className="text-[11px] text-text-muted mt-0.5">Click to choose a different Excel file</p>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs font-bold text-gray-900">Click to upload contacts Excel file</span>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      Supports Microsoft Excel (.xlsx, .xls) and CSV
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5 font-mono">
                      Columns: Name, Mobile Number, Category, Projects, City, State, Pin Code, Email, Notes, Assigned Coordinator
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
                  <label className="block font-bold text-gray-700 uppercase tracking-wider text-[10px] mb-1 flex items-center justify-between">
                    <span>Target Campaign / Project(s) (Optional)</span>
                    <span className="text-[10px] text-text-muted font-normal lowercase">
                      {selectedProjectIds.length === 0
                        ? 'none selected'
                        : `${selectedProjectIds.length} selected`}
                    </span>
                  </label>
                  {projects.length === 0 ? (
                    <div className="text-xs text-text-muted italic py-1.5">No active projects available</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border border-gray-200 bg-gray-50/50 min-h-[42px] max-h-32 overflow-y-auto items-center">
                      {projects.map((p) => {
                        const isSelected = selectedProjectIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedProjectIds((prev) =>
                                isSelected ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                              );
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-purple-600 text-white shadow-2xs'
                                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            <FolderKanban size={12} className={isSelected ? 'text-white' : 'text-purple-600'} />
                            <span>{p.name}</span>
                            {isSelected && <Check size={12} className="ml-0.5" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <span className="text-[10px] text-text-muted mt-1 block">
                    Tags all contacts in this upload to the selected campaign(s).
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
                          <th className="py-2 px-3">Projects</th>
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

                              {/* Projects */}
                              <td className="py-2 px-3">
                                {row.missingProjects && row.missingProjects.length > 0 ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200 whitespace-nowrap"
                                    title={row.errorReason}
                                  >
                                    <AlertTriangle size={10} className="text-red-500 shrink-0" />
                                    Unknown: {row.missingProjects.join(', ')}
                                  </span>
                                ) : row.projects ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap"
                                    title={row.projects}
                                  >
                                    <FolderKanban size={10} className="text-purple-600" />
                                    {row.projects}
                                  </span>
                                ) : selectedProjectIds.length > 0 ? (
                                  <span className="text-[10px] text-purple-600 italic whitespace-nowrap">
                                    Default ({selectedProjectIds.length})
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-gray-400 italic whitespace-nowrap">
                                    General
                                  </span>
                                )}
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
        {!successResult && (
          <div className="px-6 py-4 border-t border-gray-100 bg-[#FAF7F7] flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-200/70 transition-colors cursor-pointer"
            >
              Cancel
            </button>

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
          </div>
        )}
      </div>
    </div>
  );
};
