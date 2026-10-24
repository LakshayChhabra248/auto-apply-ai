import React, { useState } from 'react';
import {
  Mail,
  Sparkles,
  CheckCircle2,
  Clock,
  XCircle,
  CalendarCheck,
  Loader2,
  Send,
} from 'lucide-react';
import {
  ApplicationRecord,
  ApplicationStatus,
  SimulatedEmail,
} from '../types/autoapply';

interface EmailTrackerViewProps {
  applications: ApplicationRecord[];
  emails: SimulatedEmail[];
  onSendSimulatedRecruiterEmail: (
    templateType: 'application_received' | 'oa_invite' | 'rejection'
  ) => Promise<void>;
  onClassifyCustomEmail: (email: {
    sender: string;
    subject: string;
    body: string;
  }) => Promise<void>;
  sendingEmailType: string | null;
}

export const EmailTrackerView: React.FC<EmailTrackerViewProps> = ({
  applications,
  emails,
  onSendSimulatedRecruiterEmail,
  onClassifyCustomEmail,
  sendingEmailType,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | ApplicationStatus>('ALL');
  const [customSender, setCustomSender] = useState('assessments@chronos-enterprise.ai');
  const [customSubject, setCustomSubject] = useState(
    'Action Required: Complete Chronos Enterprise AI HackerRank Assessment'
  );
  const [customBody, setCustomBody] = useState(
    'Hi Aarav, Congratulations on advancing for the Software Engineer — Autonomous Agent Systems role at Chronos Enterprise AI. Please complete the HackerRank coding test by Oct 28.'
  );
  const [classifyingCustom, setClassifyingCustom] = useState(false);

  const filteredApps =
    statusFilter === 'ALL'
      ? applications
      : applications.filter((app) => app.status === statusFilter);

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSubject.trim() || !customBody.trim()) return;
    setClassifyingCustom(true);
    try {
      await onClassifyCustomEmail({
        sender: customSender,
        subject: customSubject,
        body: customBody,
      });
    } finally {
      setClassifyingCustom(false);
    }
  };

  const renderStatusText = (status: ApplicationStatus) => {
    switch (status) {
      case 'APPLIED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            APPLIED
          </span>
        );
      case 'OA_RECEIVED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            OA_RECEIVED
          </span>
        );
      case 'INTERVIEW_SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700">
            <CalendarCheck className="w-3.5 h-3.5 text-blue-600" />
            INTERVIEW_SCHEDULED
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            REJECTED
          </span>
        );
      case 'OFFER':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            OFFER
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar & Gmail Sync Simulator */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Feature 5: Automated Email Application Tracker & LLM Classifier
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Query: <code className="font-mono">newer_than:7d (subject:application OR subject:interview OR subject:assessment OR subject:update)</code>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={sendingEmailType !== null}
            onClick={() => onSendSimulatedRecruiterEmail('application_received')}
            className="px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors whitespace-nowrap"
          >
            Simulate &quot;Application Received&quot;
          </button>
          <button
            type="button"
            disabled={sendingEmailType !== null}
            onClick={() => onSendSimulatedRecruiterEmail('oa_invite')}
            className="px-3 py-2 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded-md transition-colors whitespace-nowrap"
          >
            Simulate &quot;Online Assessment Invite&quot;
          </button>
          <button
            type="button"
            disabled={sendingEmailType !== null}
            onClick={() => onSendSimulatedRecruiterEmail('rejection')}
            className="px-3 py-2 text-xs font-semibold text-red-900 bg-red-50 hover:bg-red-100 border border-red-300 rounded-md transition-colors whitespace-nowrap"
          >
            Simulate &quot;Rejection&quot;
          </button>
        </div>
      </div>

      {/* Active Applications Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Logged Job Applications ({filteredApps.length})
          </h3>

          {/* Interactive Filter Controls */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['ALL', 'APPLIED', 'OA_RECEIVED', 'INTERVIEW_SCHEDULED', 'REJECTED'] as const).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              )
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4">Company & Role</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Action Required (LLM Extracted)</th>
                <th className="py-2.5 px-4 text-right">Confidence</th>
                <th className="py-2.5 px-4 text-right">Applied Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredApps.map((app) => (
                <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{app.company}</div>
                    <div className="text-slate-500">
                      {app.role} · <span className="font-mono text-[11px]">{app.id}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono">{renderStatusText(app.status)}</td>
                  <td className="py-3 px-4 text-slate-800 font-medium">{app.action_required}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {(app.confidence_score * 100).toFixed(0)}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                    {new Date(app.applied_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: '2-digit',
                      year: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Split: Incoming Recruiter Inbox & Custom LLM Email Classifier */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-600" />
              <span>Synced Recruiter Emails & Structured LLM Output ({emails.length})</span>
            </h3>
          </div>

          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {emails.map((item) => (
              <div
                key={item.id}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-900">{item.subject}</span>
                  <span className="font-mono text-[11px] text-slate-500">{item.sender}</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{item.body}</p>
                {item.classification && (
                  <pre className="p-2.5 bg-slate-900 text-emerald-300 rounded text-[11px] font-mono overflow-x-auto">
                    {JSON.stringify(item.classification, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Custom Email Classification Pipeline Tester (FR 5.3) */}
        <form
          onSubmit={handleCustomSubmit}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-4 h-fit"
        >
          <div className="pb-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">
              Test Custom Recruiter Email Classification (FR 5.3)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pass any email snippet to Gemini 3.8 Flash to classify status and update the matched
              application row.
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="custom-sender" className="block text-xs font-semibold text-slate-700">
              Sender Address
            </label>
            <input
              id="custom-sender"
              type="text"
              value={customSender}
              onChange={(e) => setCustomSender(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-md"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="custom-subject" className="block text-xs font-semibold text-slate-700">
              Email Subject
            </label>
            <input
              id="custom-subject"
              type="text"
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="custom-body" className="block text-xs font-semibold text-slate-700">
              Email Body Snippet
            </label>
            <textarea
              id="custom-body"
              rows={4}
              value={customBody}
              onChange={(e) => setCustomBody(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>

          <button
            type="submit"
            disabled={classifyingCustom}
            className="w-full px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors flex items-center justify-center gap-1.5"
          >
            {classifyingCustom ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Run LLM Email Classifier & Update Tracker</span>
          </button>
        </form>
      </div>
    </div>
  );
};
