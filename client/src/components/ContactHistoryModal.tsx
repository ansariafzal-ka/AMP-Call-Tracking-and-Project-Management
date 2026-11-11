import React, { useEffect, useState } from 'react';
import {
  X,
  Calendar,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  AlertCircle,
  User,
  MapPin,
  Mail,
  Folder,
} from 'lucide-react';
import apiClient from '../api/client';
import type {
  CallerContact,
  ContactCallHistoryItem,
  GetContactDetailsResponse,
} from '../types';
import { formatDateTime, formatDuration, getErrorMessage } from '../utils/format';

interface ContactHistoryModalProps {
  contactId: number | null;
  onClose: () => void;
}

export const ContactHistoryModal: React.FC<ContactHistoryModalProps> = ({
  contactId,
  onClose,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState<CallerContact | null>(null);
  const [history, setHistory] = useState<ContactCallHistoryItem[]>([]);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!contactId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    apiClient
      .get<GetContactDetailsResponse>(`/api/contacts/${contactId}`)
      .then((res) => {
        if (isMounted && res.data?.success && res.data.data) {
          setContact(res.data.data.contact);
          const rawHistory =
            res.data.data.callHistory || res.data.data.call_history || [];
          setHistory(rawHistory);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(getErrorMessage(err, 'Failed to load contact call history.'));
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [contactId]);

  if (!contactId) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  const getOutcomeBadge = (outcome: string | null) => {
    switch (outcome) {
      case 'interested':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Interested
          </span>
        );
      case 'follow_up_required':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            Follow-up Required
          </span>
        );
      case 'not_interested':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            Not Interested
          </span>
        );
      case 'unanswered':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
            Unanswered
          </span>
        );
      default:
        return <span className="text-gray-400 italic text-[11px]">—</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-gray-100 bg-[#FAF7F7]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-maroon/10 text-maroon flex items-center justify-center">
              <User size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">
                {contact?.name || 'Contact Details'}
              </h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {contact?.project_name && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                    <Folder size={10} className="text-slate-500" />
                    {contact.project_name}
                  </span>
                )}
                {contact?.category && (
                  <span
                    className={`px-2 py-0.2 rounded-md text-[10px] font-bold border ${getCategoryBadgeClass(
                      contact.category
                    )}`}
                  >
                    {contact.category}
                  </span>
                )}
                {contact?.city && (
                  <span className="text-xs text-gray-500 flex items-center gap-0.5">
                    <MapPin size={11} className="text-gray-400" />
                    {contact.city}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
              <AlertCircle size={16} className="shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-gray-400 gap-2">
              <div className="w-7 h-7 rounded-full border-2 border-maroon border-t-transparent animate-spin" />
              <span className="text-xs text-gray-500">Loading call history...</span>
            </div>
          ) : (
            <>
              {/* Contact Quick Info Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-gray-50/80 rounded-xl border border-gray-100 text-xs">
                <div>
                  <span className="text-gray-500 block mb-1">Phone Number</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-gray-900">
                      {contact?.mobile_number}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(contact?.mobile_number || '')}
                      className="p-1 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                      title="Copy"
                    >
                      {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                {contact?.email && (
                  <div>
                    <span className="text-gray-500 block mb-1">Email Address</span>
                    <a
                      href={`mailto:${contact.email}`}
                      className="font-medium text-gray-800 hover:text-maroon hover:underline flex items-center gap-1.5"
                    >
                      <Mail size={13} className="text-gray-400" />
                      {contact.email}
                    </a>
                  </div>
                )}

                {contact?.notes && (
                  <div className="sm:col-span-2 pt-2 border-t border-gray-200/60">
                    <span className="text-gray-500 block mb-0.5">Notes & Context</span>
                    <p className="text-gray-700">{contact.notes}</p>
                  </div>
                )}
              </div>

              {/* Call History Timeline */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                    Call History ({history.length} {history.length === 1 ? 'call' : 'calls'})
                  </h3>
                </div>

                {history.length === 0 ? (
                  <div className="py-8 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200 text-xs text-gray-500">
                    No calls logged for this contact yet. Click Call to initiate the first conversation!
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((call) => (
                      <div
                        key={call.id}
                        className="p-3.5 rounded-xl border border-gray-100 bg-white hover:bg-gray-50/50 transition-colors space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {call.status === 'answered' ? (
                              <span className="flex items-center gap-1 font-semibold text-emerald-700">
                                <CheckCircle2 size={14} className="text-emerald-600" />
                                Answered ({formatDuration(call.duration_seconds)})
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 font-semibold text-rose-600">
                                <XCircle size={14} className="text-rose-500" />
                                Unanswered
                              </span>
                            )}
                            <span className="text-gray-300">•</span>
                            <span className="text-gray-500">{formatDateTime(call.called_at)}</span>
                            {call.caller_name && (
                              <>
                                <span className="text-gray-300">•</span>
                                <span className="text-gray-600 font-medium flex items-center gap-1">
                                  <User size={11} className="text-maroon/70" />
                                  {call.caller_name}
                                </span>
                              </>
                            )}
                          </div>

                          <div>{getOutcomeBadge(call.outcome)}</div>
                        </div>

                        {call.purpose && (
                          <div className="text-gray-700">
                            <span className="font-semibold text-gray-500">Purpose: </span>
                            {call.purpose}
                          </div>
                        )}

                        {call.notes && (
                          <div className="text-gray-600 bg-gray-50 p-2 rounded-lg border border-gray-100">
                            {call.notes}
                          </div>
                        )}

                        {call.follow_up_date && (
                          <div className="flex items-center gap-1.5 text-amber-700 font-medium pt-1">
                            <Calendar size={13} className="text-amber-600" />
                            <span>Follow-up scheduled: {formatDateTime(call.follow_up_date)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-gray-100 bg-[#FAF7F7] flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Total attempts: <strong className="text-gray-800">{history.length}</strong>
          </div>

          <div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
