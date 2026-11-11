import React, { useState, useEffect } from 'react';
import {
  X,
  Pencil,
  AlertCircle,
  User,
  Phone,
  Mail,
  MapPin,
  FolderKanban,
  Tag,
  FileText,
  UserCheck,
  Check,
} from 'lucide-react';
import apiClient from '../api/client';
import { getErrorMessage } from '../utils/format';
import type { AdminContact, AdminUser, Project } from '../types';

interface EditContactModalProps {
  isOpen: boolean;
  contact: AdminContact | null;
  coordinators: AdminUser[];
  projects: Project[];
  onClose: () => void;
  onSuccess: (updatedContact: AdminContact) => void;
}

const CATEGORIES = ['Donor', 'Beneficiary', 'Student', 'Volunteer', 'Other'];

export const EditContactModal: React.FC<EditContactModalProps> = ({
  isOpen,
  contact,
  coordinators,
  projects,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [alternateNumber, setAlternateNumber] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [category, setCategory] = useState('Other');
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [assignedUserId, setAssignedUserId] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contact && isOpen) {
      setName(contact.name || '');
      setMobileNumber(contact.mobile_number || '');
      setAlternateNumber(contact.alternate_number || '');
      setEmail(contact.email || '');
      setCity(contact.city || '');
      setState(contact.state || '');
      setPinCode(contact.pin_code || '');
      setCategory(contact.category || 'Other');
      const initialProjectIds: number[] = contact.project_ids && contact.project_ids.length > 0
        ? contact.project_ids
        : contact.projects && contact.projects.length > 0
        ? contact.projects.map((p) => p.id)
        : contact.project_id
        ? [contact.project_id]
        : [];
      setSelectedProjectIds(initialProjectIds);
      setAssignedUserId(contact.assigned_user_id ? String(contact.assigned_user_id) : '');
      setNotes(contact.notes || '');
      setError(null);
    }
  }, [contact, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen || !contact) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Contact full name is required');
      return;
    }

    if (!mobileNumber.trim()) {
      setError('Mobile phone number is required');
      return;
    }

    const cleanDigits = mobileNumber.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      setError('Mobile phone number must be at least 10 digits');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        mobile_number: mobileNumber.trim(),
        alternate_number: alternateNumber.trim() || null,
        email: email.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        pin_code: pinCode.trim() || null,
        category,
        project_id: selectedProjectIds.length > 0 ? selectedProjectIds[0] : null,
        project_ids: selectedProjectIds,
        assigned_user_id: assignedUserId ? parseInt(assignedUserId, 10) : null,
        notes: notes.trim() || null,
      };

      const res = await apiClient.put<{ success: boolean; data: any }>(
        `/api/admin/contacts/${contact.id}`,
        payload
      );

      const updatedData = res.data?.data;
      const targetUser = coordinators.find((u) => String(u.id) === String(assignedUserId));
      const targetProjects = projects.filter((p) => selectedProjectIds.includes(p.id));

      const mergedContact: AdminContact = {
        ...contact,
        ...payload,
        assigned_user_name: targetUser ? targetUser.full_name : null,
        assigned_user_email: targetUser ? targetUser.email : null,
        project_name: targetProjects.length > 0 ? targetProjects[0].name : null,
        project_names: targetProjects.map((p) => p.name).join(', ') || null,
        project_ids: selectedProjectIds,
        projects: targetProjects.map((p) => ({ id: p.id, name: p.name })),
        ...updatedData,
      };

      onSuccess(mergedContact);
      onClose();
    } catch (err: any) {
      console.error('Error updating contact:', err);
      setError(getErrorMessage(err, 'Failed to update contact. Please check your inputs.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className="bg-card-bg rounded-2xl max-w-xl w-full shadow-2xl border border-gray-100 overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#FAF7F7] px-6 py-4.5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-maroon/10 text-maroon flex items-center justify-center shrink-0">
              <Pencil size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-main leading-tight">Edit Contact</h3>
              <p className="text-xs text-text-muted mt-0.5">
                Update information for <span className="font-semibold text-text-main">{contact.name}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-text-muted hover:text-text-main p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Row 1: Full Name & Mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-main mb-1.5">
                Full Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rehana Parveen"
                  className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-maroon/30 focus:border-maroon transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-main mb-1.5">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="tel"
                  required
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="e.g. 9833445529"
                  className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-maroon/30 focus:border-maroon transition"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Alternate Mobile & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-main mb-1.5">
                Alternate Mobile
              </label>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="tel"
                  value={alternateNumber}
                  onChange={(e) => setAlternateNumber(e.target.value)}
                  placeholder="Secondary contact number"
                  className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-maroon/30 focus:border-maroon transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-main mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-maroon/30 focus:border-maroon transition"
                />
              </div>
            </div>
          </div>

          {/* Row 3: State, City, Pin Code */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-main mb-1.5">
                State
              </label>
              <div className="relative">
                <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g. Maharashtra"
                  className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-maroon/30 focus:border-maroon transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-main mb-1.5">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Mumbai"
                className="w-full h-10 px-3 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-maroon/30 focus:border-maroon transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-main mb-1.5">
                Pin Code
              </label>
              <input
                type="text"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                placeholder="e.g. 400001"
                className="w-full h-10 px-3 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-maroon/30 focus:border-maroon transition"
              />
            </div>
          </div>

          {/* Row 4: Category */}
          <div>
            <label className="block text-xs font-semibold text-text-main mb-1.5">
              Category
            </label>
            <div className="relative">
              <Tag size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-maroon/30 focus:border-maroon transition cursor-pointer"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 4: Associated Projects & Coordinator */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-main mb-1.5 flex items-center justify-between">
                <span>Associated Project(s)</span>
                <span className="text-[10px] text-text-muted font-normal">
                  {selectedProjectIds.length} selected
                </span>
              </label>
              {projects.length === 0 ? (
                <div className="text-xs text-text-muted italic py-2">No active projects available</div>
              ) : (
                <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border border-gray-200 bg-gray-50/50 min-h-[42px] max-h-36 overflow-y-auto items-center">
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
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-main mb-1.5">
                Assigned Coordinator
              </label>
              <div className="relative">
                <UserCheck size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  value={assignedUserId}
                  onChange={(e) => setAssignedUserId(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-maroon/30 focus:border-maroon transition cursor-pointer"
                >
                  <option value="">— Unassigned —</option>
                  {coordinators.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Row 5: Notes */}
          <div>
            <label className="block text-xs font-semibold text-text-main mb-1.5">
              Notes &amp; Background
            </label>
            <div className="relative">
              <FileText size={15} className="absolute left-3 top-3 text-gray-400" />
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Details regarding context, donation history, student application, etc."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-maroon/30 focus:border-maroon transition resize-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-maroon hover:bg-maroon-hover transition-colors shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Pencil size={13} />
              <span>{submitting ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

