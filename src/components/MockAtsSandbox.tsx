import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Plus,
  Trash2,
  Mail,
  ShieldAlert,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Lock,
} from 'lucide-react';
import { ShadowEeoWidget } from './ShadowEeoWidget';
import { MOCK_ATS_JOB_DESCRIPTION } from '../data/seedProfile';
import { AgentState } from '../types/autoapply';

export interface ExperienceBlock {
  id: string;
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  responsibilities: string;
}

export interface MockAtsFormState {
  // Page 1
  resumeFileName: string;
  resumeFileSize: number;
  fullName: string;
  email: string;
  countryCode: string;
  phone: string;
  location: string;
  rawValueTampered: boolean;
  // Page 2
  university: string;
  degree: string;
  cgpa: string;
  experiences: ExperienceBlock[];
  // Page 3
  sponsorshipOrNoticeRadio: '' | 'Yes' | 'No';
  noticePeriodDetails: string;
  complexProjectEssay: string;
  roleFitEssay: string;
  // Page 4 (Shadow DOM EEO)
  eeoGender: string;
  eeoDisability: string;
  eeoTermsAccepted: boolean;
  isSubmitted: boolean;
}

export const INITIAL_ATS_FORM_STATE: MockAtsFormState = {
  resumeFileName: '',
  resumeFileSize: 0,
  fullName: '',
  email: '',
  countryCode: '+91',
  phone: '',
  location: '',
  rawValueTampered: false,
  university: '',
  degree: '',
  cgpa: '',
  experiences: [
    {
      id: 'exp-1',
      company: '',
      role: '',
      startDate: '',
      endDate: '',
      isCurrent: false,
      responsibilities: '',
    },
  ],
  sponsorshipOrNoticeRadio: '',
  noticePeriodDetails: '',
  complexProjectEssay: '',
  roleFitEssay: '',
  eeoGender: '',
  eeoDisability: '',
  eeoTermsAccepted: false,
  isSubmitted: false,
};

const LOCATION_SUGGESTIONS = [
  'Bengaluru, Karnataka, India',
  'Bengaluru Urban, Karnataka, India',
  'Mumbai, Maharashtra, India',
  'Hyderabad, Telangana, India',
  'Pune, Maharashtra, India',
  'New Delhi, Delhi, India',
];

const UNIVERSITY_OPTIONS = [
  'Indian Institute of Technology (IIT) Bombay',
  'Indian Institute of Science (IISc) Bengaluru',
  'Indian Institute of Technology (IIT) Delhi',
  'Indian Institute of Technology (IIT) Madras',
  'BITS Pilani',
  'IIIT Hyderabad',
];

const YEARS = ['2022', '2023', '2024', '2025', '2026'];
const MONTHS = [
  { code: '01', label: 'Jan' },
  { code: '02', label: 'Feb' },
  { code: '03', label: 'Mar' },
  { code: '04', label: 'Apr' },
  { code: '05', label: 'May' },
  { code: '06', label: 'Jun' },
  { code: '07', label: 'Jul' },
  { code: '08', label: 'Aug' },
  { code: '09', label: 'Sep' },
  { code: '10', label: 'Oct' },
  { code: '11', label: 'Nov' },
  { code: '12', label: 'Dec' },
];

interface MockAtsSandboxProps {
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  formState: MockAtsFormState;
  setFormState: React.Dispatch<React.SetStateAction<MockAtsFormState>>;
  agentState: AgentState;
  captchaActive: boolean;
  onToggleCaptcha: (active: boolean) => void;
  onApplicationSubmitted: () => void;
  onSendRecruiterEmail: (
    templateType: 'application_received' | 'oa_invite' | 'rejection'
  ) => Promise<void>;
  sendingEmailType: string | null;
  lastEmailToast: string | null;
  onResetSandbox: () => void;
  onUploadResumeFile: (file: File) => Promise<void>;
  isUploadingResume: boolean;
  resumeParseBanner: string | null;
  activeCandidateName: string;
  activeCandidateEmail: string;
  onOpenProfileVault: () => void;
}

export const MockAtsSandbox: React.FC<MockAtsSandboxProps> = ({
  currentPage,
  setCurrentPage,
  formState,
  setFormState,
  agentState,
  captchaActive,
  onToggleCaptcha,
  onApplicationSubmitted,
  onSendRecruiterEmail,
  sendingEmailType,
  lastEmailToast,
  onResetSandbox,
  onUploadResumeFile,
  isUploadingResume,
  resumeParseBanner,
  activeCandidateName,
  activeCandidateEmail,
  onOpenProfileVault,
}) => {
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [locationQuery, setLocationQuery] = useState(formState.location);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);

  // Page 2 Custom University Combobox & Readonly DatePicker Popover state
  const [uniDropdownOpen, setUniDropdownOpen] = useState(false);
  const [activeDatePicker, setActiveDatePicker] = useState<{
    expIndex: number;
    field: 'startDate' | 'endDate';
  } | null>(null);
  const [pickerYear, setPickerYear] = useState('2025');
  const [pickerMonth, setPickerMonth] = useState('05');

  const fullNameInputRef = useRef<HTMLInputElement | null>(null);
  const locationTimerRef = useRef<number | null>(null);

  // Sync locationQuery when formState.location updates from outside
  useEffect(() => {
    setLocationQuery(formState.location);
  }, [formState.location]);

  // Clear errors on page change
  useEffect(() => {
    setValidationErrors([]);
    setActiveDatePicker(null);
    setUniDropdownOpen(false);
    setLocationDropdownOpen(false);
  }, [currentPage]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormState((prev) => ({
        ...prev,
        resumeFileName: file.name,
        resumeFileSize: file.size,
      }));
      // Only trigger server PDF extraction when the user manually selects a file (not during synthetic agent injection)
      if (e.currentTarget.getAttribute('data-synthetic-injected') !== 'true') {
        await onUploadResumeFile(file);
      } else {
        e.currentTarget.removeAttribute('data-synthetic-injected');
      }
    }
  };

  const handleLocationInput = (val: string) => {
    setLocationQuery(val);
    setFormState((prev) => ({ ...prev, location: val }));

    if (locationTimerRef.current) {
      window.clearTimeout(locationTimerRef.current);
    }

    if (val.trim().length >= 3) {
      setLocationLoading(true);
      // Part 2 Page 1 spec: typing "Bengal" waits 400ms before rendering dropdown list
      locationTimerRef.current = window.setTimeout(() => {
        setLocationLoading(false);
        setLocationDropdownOpen(true);
      }, 400);
    } else {
      setLocationLoading(false);
      setLocationDropdownOpen(false);
    }
  };

  const handleSelectLocationSuggestion = (suggestion: string) => {
    setLocationQuery(suggestion);
    setFormState((prev) => ({ ...prev, location: suggestion }));
    setLocationDropdownOpen(false);
  };

  // Demonstrates why raw element.value = "..." fails on React forms without synthetic events (FR 2.3)
  const triggerRawDomValueTrap = () => {
    if (fullNameInputRef.current) {
      fullNameInputRef.current.value = 'Aarav Sharma (Raw DOM .value)';
      fullNameInputRef.current.removeAttribute('data-synthetic-injected');
      setFormState((prev) => ({ ...prev, fullName: '', rawValueTampered: true }));
      setValidationErrors([
        'React Synthetic State Lock: Full Name input DOM node was modified via raw .value = "" without synthetic event dispatch. Virtual DOM state is still empty!',
      ]);
    }
  };

  const validateCurrentPage = (): boolean => {
    const errors: string[] = [];

    if (currentPage === 1) {
      if (!formState.resumeFileName) {
        errors.push('Resume PDF upload is required (inject via DataTransfer API or select file).');
      }
      if (!formState.fullName.trim() || formState.rawValueTampered) {
        errors.push(
          'Full Name is required in React state (must use native prototype setter + bubbling input/change events).'
        );
      }
      if (!formState.email.trim() || !formState.email.includes('@')) {
        errors.push('Valid Email Address is required.');
      }
      if (!formState.phone.trim()) {
        errors.push('Phone Number is required.');
      }
      if (!formState.location.trim()) {
        errors.push('Current Location is required.');
      }
    } else if (currentPage === 2) {
      if (!formState.university.trim()) {
        errors.push('University Name is required.');
      }
      if (!formState.degree.trim()) {
        errors.push('Degree & Major is required.');
      }
      if (!formState.cgpa.trim()) {
        errors.push('CGPA is required.');
      }
      formState.experiences.forEach((exp, idx) => {
        if (!exp.company.trim()) {
          errors.push(`Experience #${idx + 1}: Company Name is required.`);
        }
        if (!exp.role.trim()) {
          errors.push(`Experience #${idx + 1}: Job Title is required.`);
        }
        if (!exp.startDate.trim()) {
          errors.push(`Experience #${idx + 1}: Start Date is required (use Calendar Popover).`);
        }
      });
    } else if (currentPage === 3) {
      if (!formState.sponsorshipOrNoticeRadio) {
        errors.push('Please answer the Visa Sponsorship / Notice Period > 30 days question.');
      }
      if (
        formState.sponsorshipOrNoticeRadio === 'Yes' &&
        !formState.noticePeriodDetails.trim()
      ) {
        errors.push(
          'Conditional field required: Please specify your exact notice period in days and earliest joining date.'
        );
      }
      if (formState.complexProjectEssay.trim().length < 150) {
        errors.push(
          `AI/ML Project Architecture answer must be at least 150 characters (currently ${formState.complexProjectEssay.trim().length}).`
        );
      }
      if (!formState.roleFitEssay.trim()) {
        errors.push('Role Fit screening answer is required.');
      }
    } else if (currentPage === 4) {
      if (!formState.eeoGender) {
        errors.push('Shadow DOM EEO: Gender Identity selection is required.');
      }
      if (!formState.eeoDisability) {
        errors.push('Shadow DOM EEO: Disability Status selection is required.');
      }
      if (!formState.eeoTermsAccepted) {
        errors.push('Shadow DOM EEO: You must certify and accept the EEO Terms & Conditions.');
      }
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSaveAndContinue = () => {
    if (validateCurrentPage()) {
      setCurrentPage((p) => Math.min(4, p + 1));
    }
  };

  const handleFinalSubmit = () => {
    if (validateCurrentPage()) {
      setFormState((prev) => ({ ...prev, isSubmitted: true }));
      onApplicationSubmitted();
    }
  };

  const addExperienceBlock = () => {
    setFormState((prev) => ({
      ...prev,
      experiences: [
        ...prev.experiences,
        {
          id: `exp-${prev.experiences.length + 1}-${Date.now()}`,
          company: '',
          role: '',
          startDate: '',
          endDate: '',
          isCurrent: false,
          responsibilities: '',
        },
      ],
    }));
  };

  const removeExperienceBlock = (index: number) => {
    if (formState.experiences.length <= 1) return;
    setFormState((prev) => ({
      ...prev,
      experiences: prev.experiences.filter((_, idx) => idx !== index),
    }));
  };

  const updateExperienceField = (
    index: number,
    field: keyof ExperienceBlock,
    value: string | boolean
  ) => {
    setFormState((prev) => {
      const next = [...prev.experiences];
      next[index] = {
        ...next[index],
        [field]: value,
        ...(field === 'isCurrent' && value === true ? { endDate: 'Present' } : {}),
      };
      return { ...prev, experiences: next };
    });
  };

  const applyDateFromPopover = (day: string) => {
    if (!activeDatePicker) return;
    const formatted = `${pickerYear}-${pickerMonth}-${day.padStart(2, '0')}`;
    updateExperienceField(activeDatePicker.expIndex, activeDatePicker.field, formatted);
    setActiveDatePicker(null);
  };

  const filteredLocations = LOCATION_SUGGESTIONS.filter((loc) =>
    loc.toLowerCase().includes(locationQuery.toLowerCase())
  );

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
      {/* Enterprise ATS Portal Top Header */}
      <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span>MockATS Torture-Chamber</span>
            <span aria-hidden="true">·</span>
            <span>{MOCK_ATS_JOB_DESCRIPTION.reqId}</span>
            <span aria-hidden="true">·</span>
            <span>Workday / Greenhouse / Lever Combined Testbed</span>
          </div>
          <h2 className="text-base font-semibold tracking-tight text-white mt-0.5">
            {MOCK_ATS_JOB_DESCRIPTION.role} — {MOCK_ATS_JOB_DESCRIPTION.company}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-distiller-ignore="true"
            onClick={() => onToggleCaptcha(!captchaActive)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              captchaActive
                ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            {captchaActive ? 'CAPTCHA Trap: Active' : 'Trigger CAPTCHA Trap'}
          </button>

          <button
            type="button"
            data-distiller-ignore="true"
            onClick={onResetSandbox}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Form
          </button>
        </div>
      </div>

      {/* 4-Step Wizard Navigation Bar */}
      <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { step: 1, title: '1. Basics & File Blob', sub: 'Synthetic State & Typeahead' },
          { step: 2, title: '2. Edu & Experience', sub: 'Array Expand & Date Trap' },
          { step: 3, title: '3. Conditional & AI', sub: 'Mutation & LLM Essays' },
          { step: 4, title: '4. Shadow DOM & Email', sub: 'Open Shadow Root & SMTP' },
        ].map((item) => {
          const isCurrent = currentPage === item.step;
          const isDone = currentPage > item.step || formState.isSubmitted;
          return (
            <button
              key={item.step}
              type="button"
              data-distiller-ignore="true"
              onClick={() => setCurrentPage(item.step)}
              className={`text-left px-3 py-2 rounded-md border transition-colors ${
                isCurrent
                  ? 'bg-white border-blue-600 text-slate-900 shadow-xs'
                  : isDone
                  ? 'bg-emerald-50/50 border-emerald-200 text-slate-800'
                  : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-100'
              }`}
            >
              <div className="text-xs font-semibold truncate">{item.title}</div>
              <div className="text-[11px] text-slate-500 truncate">{item.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Optional Cloudflare Turnstile / CAPTCHA Bot Detection Trap Banner */}
      {captchaActive && (
        <div className="mx-5 mt-4 p-4 bg-amber-50 border border-amber-300 rounded-lg flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-amber-900">
                Cloudflare Turnstile Security Verification Required
              </h3>
              <p className="text-xs text-amber-800 mt-0.5">
                NFR Bot Detection Fallback active: AutoApply AI has paused execution and notified the
                user. Solve the challenge below to resume the state machine.
              </p>
            </div>
          </div>
          <button
            type="button"
            data-distiller-ignore="true"
            onClick={() => onToggleCaptcha(false)}
            className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            Verify I am Human (Solve CAPTCHA)
          </button>
        </div>
      )}

      {/* Validation Error Banner (FR 4.2 Validation Error Recovery Loop target) */}
      {validationErrors.length > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          className="mx-5 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-red-800 mb-1.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>ATS Validation Error — Cannot Advance Page ([aria-invalid="true"])</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs text-red-700">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Distillable Form Container */}
      <div id="mock-ats-form-container" className="p-5 flex-1 space-y-6">
        {/* ================= PAGE 1: CANDIDATE BASICS & FILE INGESTION ================= */}
        {currentPage === 1 && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Page 1: Candidate Basics & Automated File Ingestion
                </h3>
                <p className="text-xs text-slate-500">
                  Tests DataTransfer PDF file injection, first+last name concatenation, React
                  synthetic event locks, and 400ms async typeahead.
                </p>
              </div>
              <button
                type="button"
                data-distiller-ignore="true"
                onClick={triggerRawDomValueTrap}
                className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors whitespace-nowrap shrink-0"
              >
                Simulate Raw .value = &quot;&quot; Bug
              </button>
            </div>

            {/* Active Profile Knowledge Base Status Bar */}
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-slate-800">
                <span className="font-semibold text-blue-950">Active Profile Vault:</span>{' '}
                <span className="font-semibold">{activeCandidateName}</span>
                {activeCandidateEmail ? (
                  <span className="text-slate-600 font-mono"> ({activeCandidateEmail})</span>
                ) : null}
              </div>
              <button
                type="button"
                data-distiller-ignore="true"
                onClick={onOpenProfileVault}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline whitespace-nowrap"
              >
                View / Edit Extracted Profile →
              </button>
            </div>

            {resumeParseBanner && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-2 text-xs text-emerald-900 font-medium">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{resumeParseBanner}</span>
                </div>
                <button
                  type="button"
                  data-distiller-ignore="true"
                  onClick={onOpenProfileVault}
                  className="font-semibold text-emerald-800 underline whitespace-nowrap"
                >
                  Inspect JSON Schema
                </button>
              </div>
            )}

            {/* Resume Upload Dropzone */}
            <div data-field-wrapper="true" className="space-y-1.5">
              <label
                htmlFor="ats-resume-upload"
                className="block text-xs font-semibold text-slate-700"
              >
                Resume / CV Upload (PDF) *
              </label>
              <label
                htmlFor="ats-resume-upload"
                className={`flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  formState.resumeFileName
                    ? 'border-emerald-400 bg-emerald-50/40'
                    : 'border-slate-300 bg-slate-50 hover:bg-slate-100/70'
                }`}
              >
                <input
                  id="ats-resume-upload"
                  name="resume_file"
                  type="file"
                  accept=".pdf,.txt"
                  data-label="Resume / CV Upload (PDF) *"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                {isUploadingResume ? (
                  <div className="text-center text-blue-700">
                    <div className="text-xs font-semibold">
                      Extracting your profile from {formState.resumeFileName || 'Resume PDF'}...
                    </div>
                    <div className="text-[11px] text-blue-600 font-mono mt-0.5">
                      Running PDF text extraction & Gemini 3.8 Flash structured schema parser
                    </div>
                  </div>
                ) : formState.resumeFileName ? (
                  <div className="flex items-center gap-2.5 text-emerald-800">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="text-left">
                      <div className="text-xs font-semibold">{formState.resumeFileName}</div>
                      <div className="text-[11px] text-emerald-700 font-mono tabular-nums">
                        {(formState.resumeFileSize / 1024).toFixed(1)} KB · Parsed into Profile Vault
                        & Attached via DataTransfer API
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
                    <div className="text-xs font-medium text-slate-700">
                      Click to upload your PDF resume (auto-parses into Profile Vault), or let
                      AutoApply AI inject cached blob
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                      Hidden &lt;input type=&quot;file&quot; accept=&quot;.pdf&quot;&gt;
                    </div>
                  </div>
                )}
              </label>
            </div>

            {/* Full Name (Single Input) & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div data-field-wrapper="true" className="space-y-1.5">
                <label
                  htmlFor="ats-full-name"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Full Name *
                </label>
                <input
                  ref={fullNameInputRef}
                  id="ats-full-name"
                  name="fullName"
                  type="text"
                  data-label="Full Name *"
                  placeholder="Enter your given and family name"
                  value={formState.fullName}
                  aria-invalid={
                    validationErrors.length > 0 &&
                    (!formState.fullName.trim() || formState.rawValueTampered)
                  }
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      fullName: e.target.value,
                      rawValueTampered: false,
                    }))
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                />
                <div className="text-[11px] text-slate-500">
                  Tests concatenation of <code className="font-mono">first_name + last_name</code>
                </div>
              </div>

              <div data-field-wrapper="true" className="space-y-1.5">
                <label htmlFor="ats-email" className="block text-xs font-semibold text-slate-700">
                  Email Address *
                </label>
                <input
                  id="ats-email"
                  name="email"
                  type="email"
                  data-label="Email Address *"
                  placeholder="candidate@university.edu"
                  value={formState.email}
                  aria-invalid={validationErrors.length > 0 && !formState.email.trim()}
                  onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            {/* Country Code Select + Phone Number + Async Location Typeahead */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <div data-field-wrapper="true" className="sm:col-span-3 space-y-1.5">
                <label
                  htmlFor="ats-country-code"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Country Code *
                </label>
                <select
                  id="ats-country-code"
                  name="countryCode"
                  data-label="Country Code *"
                  value={formState.countryCode}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, countryCode: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600 font-mono tabular-nums"
                >
                  <option value="+91">+91 (IN)</option>
                  <option value="+1">+1 (US)</option>
                  <option value="+44">+44 (UK)</option>
                  <option value="+65">+65 (SG)</option>
                </select>
              </div>

              <div data-field-wrapper="true" className="sm:col-span-4 space-y-1.5">
                <label htmlFor="ats-phone" className="block text-xs font-semibold text-slate-700">
                  Phone Number *
                </label>
                <input
                  id="ats-phone"
                  name="phone"
                  type="tel"
                  data-label="Phone Number *"
                  placeholder="9845012390"
                  value={formState.phone}
                  aria-invalid={validationErrors.length > 0 && !formState.phone.trim()}
                  onChange={(e) => setFormState((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600 font-mono tabular-nums"
                />
              </div>

              <div data-field-wrapper="true" className="sm:col-span-5 space-y-1.5 relative">
                <label
                  htmlFor="ats-location"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Current Location (Async Typeahead) *
                </label>
                <input
                  id="ats-location"
                  name="location"
                  type="text"
                  role="combobox"
                  aria-expanded={locationDropdownOpen}
                  aria-autocomplete="list"
                  data-label="Current Location *"
                  placeholder="Type 'Bengal' (waits 400ms)..."
                  value={locationQuery}
                  aria-invalid={validationErrors.length > 0 && !formState.location.trim()}
                  onChange={(e) => handleLocationInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                />
                {locationLoading && (
                  <div className="text-[11px] text-blue-600 font-mono mt-1">
                    Async typeahead: Fetching city matches (400ms)...
                  </div>
                )}
                {locationDropdownOpen && filteredLocations.length > 0 && (
                  <ul
                    role="listbox"
                    aria-label="Location Suggestions"
                    className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-44 overflow-auto divide-y divide-slate-100"
                  >
                    {filteredLocations.map((loc) => (
                      <li key={loc}>
                        <button
                          type="button"
                          data-distiller-ignore="true"
                          onClick={() => handleSelectLocationSuggestion(loc)}
                          className="w-full text-left px-3 py-2 text-xs text-slate-800 hover:bg-blue-50 hover:text-blue-700 font-medium"
                        >
                          {loc}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= PAGE 2: EDUCATION, REPEATING EXPERIENCE & DATE PICKER TRAP ================= */}
        {currentPage === 2 && (
          <div className="space-y-6">
            <div className="pb-3 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                Page 2: Multi-Section Education, Dynamic Experience & Readonly Date Picker Trap
              </h3>
              <p className="text-xs text-slate-500">
                Tests custom React-Select comboboxes, dynamic array expansion (clicking + Add
                Another Experience N-1 times), and readonly floating Calendar Popovers.
              </p>
            </div>

            {/* Section A: Education */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
              <h4 className="text-xs font-semibold text-slate-800">Section A: Academic Education</h4>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div data-field-wrapper="true" className="sm:col-span-6 space-y-1.5 relative">
                  <label
                    htmlFor="ats-university"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    University Name (Custom React-Select) *
                  </label>
                  <input
                    id="ats-university"
                    name="university"
                    type="text"
                    role="combobox"
                    aria-expanded={uniDropdownOpen}
                    data-label="University Name *"
                    data-options={UNIVERSITY_OPTIONS.join('|')}
                    placeholder="Click to open custom React-Select menu..."
                    value={formState.university}
                    onClick={() => setUniDropdownOpen((o) => !o)}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, university: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600 cursor-pointer"
                  />
                  {uniDropdownOpen && (
                    <div
                      role="listbox"
                      className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-48 overflow-auto divide-y divide-slate-100"
                    >
                      {UNIVERSITY_OPTIONS.map((uni) => (
                        <button
                          key={uni}
                          type="button"
                          data-distiller-ignore="true"
                          onClick={() => {
                            setFormState((prev) => ({ ...prev, university: uni }));
                            setUniDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-slate-800 hover:bg-blue-50"
                        >
                          {uni}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div data-field-wrapper="true" className="sm:col-span-4 space-y-1.5">
                  <label htmlFor="ats-degree" className="block text-xs font-semibold text-slate-700">
                    Degree & Specialization *
                  </label>
                  <input
                    id="ats-degree"
                    name="degree"
                    type="text"
                    data-label="Degree & Specialization *"
                    placeholder="B.Tech — Computer Science"
                    value={formState.degree}
                    onChange={(e) => setFormState((prev) => ({ ...prev, degree: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div data-field-wrapper="true" className="sm:col-span-2 space-y-1.5">
                  <label htmlFor="ats-cgpa" className="block text-xs font-semibold text-slate-700">
                    CGPA *
                  </label>
                  <input
                    id="ats-cgpa"
                    name="cgpa"
                    type="text"
                    data-label="CGPA *"
                    placeholder="9.42"
                    value={formState.cgpa}
                    onChange={(e) => setFormState((prev) => ({ ...prev, cgpa: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600 font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Section B: Work Experience / Internships */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-slate-800">
                    Section B: Work Experience & Internships ({formState.experiences.length} Block
                    {formState.experiences.length > 1 ? 's' : ''} Mounted)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Starts with 1 block. AutoApply AI dynamically clicks &quot;+ Add Another
                    Experience&quot; to match the {3} experiences in profile_schema.json.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={addExperienceBlock}
                  className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + Add Another Experience
                </button>
              </div>

              {formState.experiences.map((exp, index) => (
                <div
                  key={exp.id}
                  className="p-4 bg-white border border-slate-200 rounded-lg space-y-4 relative"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-semibold text-slate-800 font-mono">
                      Work Experience Block #{index + 1}
                    </span>
                    {formState.experiences.length > 1 && (
                      <button
                        type="button"
                        data-distiller-ignore="true"
                        onClick={() => removeExperienceBlock(index)}
                        aria-label={`Remove Experience Block ${index + 1}`}
                        className="text-xs text-slate-400 hover:text-red-600 flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div data-field-wrapper="true" className="space-y-1.5">
                      <label
                        htmlFor={`exp-company-${index}`}
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Company Name #{index + 1} *
                      </label>
                      <input
                        id={`exp-company-${index}`}
                        name={`company_${index}`}
                        type="text"
                        data-label={`Company Name #${index + 1} *`}
                        placeholder="e.g. Sarvam AI Research Labs"
                        value={exp.company}
                        onChange={(e) => updateExperienceField(index, 'company', e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div data-field-wrapper="true" className="space-y-1.5">
                      <label
                        htmlFor={`exp-role-${index}`}
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Job Title #{index + 1} *
                      </label>
                      <input
                        id={`exp-role-${index}`}
                        name={`role_${index}`}
                        type="text"
                        data-label={`Job Title #${index + 1} *`}
                        placeholder="e.g. AI Systems Engineering Intern"
                        value={exp.role}
                        onChange={(e) => updateExperienceField(index, 'role', e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  {/* Readonly Date Picker Trap Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
                    <div data-field-wrapper="true" className="sm:col-span-4 space-y-1.5 relative">
                      <label
                        htmlFor={`exp-start-${index}`}
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Start Date #{index + 1} (Readonly Trap) *
                      </label>
                      <div className="relative">
                        <input
                          id={`exp-start-${index}`}
                          name={`start_date_${index}`}
                          type="text"
                          readOnly
                          data-readonly-trap="true"
                          data-label={`Start Date #${index + 1} *`}
                          placeholder="Click to open Calendar Popover"
                          value={exp.startDate}
                          onClick={() =>
                            setActiveDatePicker({ expIndex: index, field: 'startDate' })
                          }
                          onChange={(e) =>
                            updateExperienceField(index, 'startDate', e.target.value)
                          }
                          className="w-full pl-3 pr-8 py-2 text-sm bg-slate-50 border border-slate-300 rounded-md cursor-pointer font-mono tabular-nums text-slate-800"
                        />
                        <Calendar className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                      </div>
                    </div>

                    <div data-field-wrapper="true" className="sm:col-span-4 space-y-1.5 relative">
                      <label
                        htmlFor={`exp-end-${index}`}
                        className="block text-xs font-semibold text-slate-700"
                      >
                        End Date #{index + 1} (Readonly Trap)
                      </label>
                      <div className="relative">
                        <input
                          id={`exp-end-${index}`}
                          name={`end_date_${index}`}
                          type="text"
                          readOnly
                          disabled={exp.isCurrent}
                          data-readonly-trap="true"
                          data-label={`End Date #${index + 1}`}
                          placeholder={
                            exp.isCurrent ? 'Present (Disabled)' : 'Click to open Calendar Popover'
                          }
                          value={exp.isCurrent ? 'Present' : exp.endDate}
                          onClick={() => {
                            if (!exp.isCurrent) {
                              setActiveDatePicker({ expIndex: index, field: 'endDate' });
                            }
                          }}
                          onChange={(e) => updateExperienceField(index, 'endDate', e.target.value)}
                          className="w-full pl-3 pr-8 py-2 text-sm bg-slate-50 border border-slate-300 rounded-md cursor-pointer disabled:opacity-50 font-mono tabular-nums text-slate-800"
                        />
                        <Calendar className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                      </div>
                    </div>

                    <div data-field-wrapper="true" className="sm:col-span-4 pb-2">
                      <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          name={`is_current_${index}`}
                          data-label={`I currently work here #${index + 1}`}
                          checked={exp.isCurrent}
                          onChange={(e) =>
                            updateExperienceField(index, 'isCurrent', e.target.checked)
                          }
                          className="w-4 h-4 rounded border-slate-300 text-blue-600"
                        />
                        <span>I currently work here</span>
                      </label>
                    </div>
                  </div>

                  {/* Floating React Calendar Popover (div.datepicker-portal) */}
                  {activeDatePicker && activeDatePicker.expIndex === index && (
                    <div
                      className="datepicker-portal p-3.5 bg-slate-900 text-white rounded-lg border border-slate-700 shadow-xl space-y-3"
                      role="dialog"
                      aria-label="Floating Calendar Popover"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-mono text-blue-300">
                          div.datepicker-portal · Target: {activeDatePicker.field} #{index + 1}
                        </span>
                        <button
                          type="button"
                          data-distiller-ignore="true"
                          onClick={() => setActiveDatePicker(null)}
                          className="text-xs text-slate-400 hover:text-white"
                        >
                          Close
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-[11px] text-slate-400">1. Select Year:</div>
                        <div className="flex flex-wrap gap-1.5">
                          {YEARS.map((yr) => (
                            <button
                              key={yr}
                              type="button"
                              data-distiller-ignore="true"
                              onClick={() => setPickerYear(yr)}
                              className={`px-2.5 py-1 text-xs font-mono rounded ${
                                pickerYear === yr
                                  ? 'bg-blue-600 text-white font-semibold'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              {yr}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-[11px] text-slate-400">2. Select Month:</div>
                        <div className="grid grid-cols-6 gap-1.5">
                          {MONTHS.map((m) => (
                            <button
                              key={m.code}
                              type="button"
                              data-distiller-ignore="true"
                              onClick={() => setPickerMonth(m.code)}
                              className={`px-2 py-1 text-xs font-mono rounded ${
                                pickerMonth === m.code
                                  ? 'bg-blue-600 text-white font-semibold'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-[11px] text-slate-400">
                          3. Click Day Cell to Commit Date:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {['01', '05', '10', '15', '20', '25', '28'].map((d) => (
                            <button
                              key={d}
                              type="button"
                              data-distiller-ignore="true"
                              onClick={() => applyDateFromPopover(d)}
                              className="px-2.5 py-1 text-xs font-mono bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold"
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Responsibilities Textarea */}
                  <div data-field-wrapper="true" className="space-y-1.5">
                    <label
                      htmlFor={`exp-resp-${index}`}
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Responsibilities & Engineering Impact #{index + 1}
                    </label>
                    <textarea
                      id={`exp-resp-${index}`}
                      name={`responsibilities_${index}`}
                      rows={2}
                      data-label={`Responsibilities & Engineering Impact #${index + 1}`}
                      placeholder="Key achievements and metrics..."
                      value={exp.responsibilities}
                      onChange={(e) =>
                        updateExperienceField(index, 'responsibilities', e.target.value)
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= PAGE 3: CONDITIONAL LOGIC & AI SCREENING QUESTIONS ================= */}
        {currentPage === 3 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-5">
              <div className="pb-3 border-b border-slate-200">
                <h3 className="text-base font-semibold text-slate-900">
                  Page 3: Conditional DOM Mutation & Contextual AI Screening
                </h3>
                <p className="text-xs text-slate-500">
                  Tests MutationObserver capture of dynamically mounted conditional inputs and
                  tailored 100-word essay synthesis using the sidebar Job Description.
                </p>
              </div>

              {/* Conditional Radio Buttons */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="text-xs font-semibold text-slate-800">
                  Do you require visa sponsorship or have a notice period &gt; 30 days? *
                </div>
                <div className="flex items-center gap-6">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-800">
                    <input
                      type="radio"
                      name="sponsorship_or_notice"
                      value="Yes"
                      data-label="Yes"
                      checked={formState.sponsorshipOrNoticeRadio === 'Yes'}
                      onChange={() =>
                        setFormState((prev) => ({ ...prev, sponsorshipOrNoticeRadio: 'Yes' }))
                      }
                      className="w-4 h-4 text-blue-600"
                    />
                    <span>Yes (Mounts dynamic notice input)</span>
                  </label>

                  <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-800">
                    <input
                      type="radio"
                      name="sponsorship_or_notice"
                      value="No"
                      data-label="No"
                      checked={formState.sponsorshipOrNoticeRadio === 'No'}
                      onChange={() =>
                        setFormState((prev) => ({
                          ...prev,
                          sponsorshipOrNoticeRadio: 'No',
                          noticePeriodDetails: '',
                        }))
                      }
                      className="w-4 h-4 text-blue-600"
                    />
                    <span>No</span>
                  </label>
                </div>

                {/* Dynamic Mutation Input: Only exists in the DOM when "Yes" is clicked! */}
                {formState.sponsorshipOrNoticeRadio === 'Yes' && (
                  <div
                    data-field-wrapper="true"
                    className="pt-3 border-t border-slate-200 space-y-1.5"
                  >
                    <label
                      htmlFor="ats-dynamic-notice"
                      className="block text-xs font-semibold text-blue-900"
                    >
                      Please specify your exact notice period in days and earliest joining date *
                    </label>
                    <input
                      id="ats-dynamic-notice"
                      name="dynamic_notice_period"
                      type="text"
                      data-label="Please specify your exact notice period in days and earliest joining date *"
                      placeholder="e.g. 45 days notice period — Earliest joining: 2026-12-10"
                      value={formState.noticePeriodDetails}
                      onChange={(e) =>
                        setFormState((prev) => ({
                          ...prev,
                          noticePeriodDetails: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-blue-400 rounded-md focus:outline-none focus:border-blue-600"
                    />
                    <div className="text-[11px] text-blue-700 font-mono">
                      Dynamically mounted DOM node captured by MutationObserver
                    </div>
                  </div>
                )}
              </div>

              {/* Open-Ended Screening Question 1 */}
              <div data-field-wrapper="true" className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="ats-essay-project"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Describe your most complex AI/ML project and the architecture you used. (Min 150
                    characters) *
                  </label>
                  <span
                    className={`text-xs font-mono tabular-nums ${
                      formState.complexProjectEssay.length >= 150
                        ? 'text-emerald-700 font-semibold'
                        : 'text-slate-500'
                    }`}
                  >
                    {formState.complexProjectEssay.length} / 150 chars
                  </span>
                </div>
                <textarea
                  id="ats-essay-project"
                  name="complex_project_essay"
                  rows={4}
                  data-label="Describe your most complex AI/ML project and the architecture you used. (Min 150 characters) *"
                  placeholder="AutoApply AI synthesizes a tailored response from your projects[] JSON..."
                  value={formState.complexProjectEssay}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, complexProjectEssay: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* Open-Ended Screening Question 2 */}
              <div data-field-wrapper="true" className="space-y-1.5">
                <label
                  htmlFor="ats-essay-fit"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Why are you a strong fit for this Software Engineer role? *
                </label>
                <textarea
                  id="ats-essay-fit"
                  name="role_fit_essay"
                  rows={4}
                  data-label="Why are you a strong fit for this Software Engineer role? *"
                  placeholder="AutoApply AI reads the Job Description in the sidebar and aligns your work_experience[]..."
                  value={formState.roleFitEssay}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, roleFitEssay: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            {/* Sidebar Job Description Context */}
            <aside className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 h-fit">
              <div className="text-xs font-mono text-slate-500">
                SIDEBAR CONTEXT · READ BY LLM AGENT
              </div>
              <h4 className="text-sm font-semibold text-slate-900">
                {MOCK_ATS_JOB_DESCRIPTION.role}
              </h4>
              <div className="text-xs text-slate-600 space-y-1">
                <div>{MOCK_ATS_JOB_DESCRIPTION.company}</div>
                <div className="font-mono">{MOCK_ATS_JOB_DESCRIPTION.compensation}</div>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {MOCK_ATS_JOB_DESCRIPTION.summary}
              </p>
              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <div className="text-xs font-semibold text-slate-800">Key Requirements:</div>
                <ul className="list-disc list-inside text-xs text-slate-600 space-y-1">
                  {MOCK_ATS_JOB_DESCRIPTION.requirements.map((req, i) => (
                    <li key={i}>{req}</li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        )}

        {/* ================= PAGE 4: THE SHADOW DOM TRAP & AUTOMATED EMAIL TRIGGER ================= */}
        {currentPage === 4 && (
          <div className="space-y-6">
            <div className="pb-3 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                Page 4: The Shadow DOM Trap, Human-in-the-Loop Submit Lock & Recruiter Email Trigger
              </h3>
              <p className="text-xs text-slate-500">
                Tests recursive Shadow Root traversal (<code className="font-mono">attachShadow</code>
                ), pauses at the final submit guardrail, and dispatches live recruiter status emails.
              </p>
            </div>

            {/* Diagnostic Banner proving Shadow DOM encapsulation */}
            <div className="p-3.5 bg-slate-900 text-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div>
                Standard <span className="text-amber-300">document.querySelectorAll(&apos;select, input[type=checkbox]&apos;)</span> sees:{' '}
                <span className="text-red-400 font-semibold">0 EEO fields</span>
              </div>
              <div>
                AutoApply Recursive Shadow Walker sees:{' '}
                <span className="text-emerald-400 font-semibold">
                  3 Shadow DOM EEO Controls (Gender, Disability, Terms)
                </span>
              </div>
            </div>

            {/* Native Web Component / Open Shadow Root Container */}
            <ShadowEeoWidget
              gender={formState.eeoGender}
              disability={formState.eeoDisability}
              termsAccepted={formState.eeoTermsAccepted}
              onChange={(updates) =>
                setFormState((prev) => ({
                  ...prev,
                  ...(updates.gender !== undefined ? { eeoGender: updates.gender } : {}),
                  ...(updates.disability !== undefined
                    ? { eeoDisability: updates.disability }
                    : {}),
                  ...(updates.termsAccepted !== undefined
                    ? { eeoTermsAccepted: updates.termsAccepted }
                    : {}),
                }))
              }
            />

            {/* Human-in-the-Loop Safety Lock Notice when Agent reaches Final Page */}
            {agentState === 'AWAITING_FINAL_HUMAN_SUBMIT' && !formState.isSubmitted && (
              <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-lg flex items-start gap-3">
                <Lock className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-semibold text-emerald-950">
                    FR 4.3 Human-in-the-Loop Safety Lock Engaged (AWAITING_FINAL_HUMAN_SUBMIT)
                  </h4>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    AutoApply AI filled all 4 pages (including the open Shadow DOM EEO fields) and
                    paused before clicking &quot;Submit Application&quot;. Review the fields and
                    click the highlighted green button below to finalize submission.
                  </p>
                </div>
              </div>
            )}

            {/* Application Submitted Confirmation Banner */}
            {formState.isSubmitted && (
              <div className="p-4 bg-emerald-900 text-white rounded-lg flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold">
                      Application Submitted & Logged to AutoApply Tracker (Status: APPLIED)
                    </div>
                    <div className="text-xs text-emerald-200 mt-0.5">
                      Use the &quot;Simulate Recruiter Reply&quot; control panel below to dispatch
                      real-time status update emails to the Email Tracker.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Crucial Feature for Testing Feature 5: "Simulate Recruiter Reply" Control Panel */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-blue-600" />
                    Simulate Recruiter Reply Control Panel (Tests Feature 5: Automated Email Tracker)
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Dispatches a recruiter email and runs the Gemini 3.8 Flash Email Classification
                    Pipeline to update your application status in real time.
                  </p>
                </div>
                {lastEmailToast && (
                  <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                    {lastEmailToast}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <button
                  type="button"
                  data-distiller-ignore="true"
                  disabled={sendingEmailType !== null}
                  onClick={() => onSendRecruiterEmail('application_received')}
                  className="px-3.5 py-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors text-center"
                >
                  {sendingEmailType === 'application_received'
                    ? 'Dispatching...'
                    : 'Send "Application Received" Email'}
                </button>

                <button
                  type="button"
                  data-distiller-ignore="true"
                  disabled={sendingEmailType !== null}
                  onClick={() => onSendRecruiterEmail('oa_invite')}
                  className="px-3.5 py-2.5 text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-300 rounded-md hover:bg-blue-100 transition-colors text-center"
                >
                  {sendingEmailType === 'oa_invite'
                    ? 'Dispatching...'
                    : 'Send "Online Assessment Invite" Email'}
                </button>

                <button
                  type="button"
                  data-distiller-ignore="true"
                  disabled={sendingEmailType !== null}
                  onClick={() => onSendRecruiterEmail('rejection')}
                  className="px-3.5 py-2.5 text-xs font-semibold text-red-900 bg-red-50 border border-red-300 rounded-md hover:bg-red-100 transition-colors text-center"
                >
                  {sendingEmailType === 'rejection'
                    ? 'Dispatching...'
                    : 'Send "Rejection" Email'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Wizard Footer Navigation */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
          <button
            type="button"
            data-distiller-ignore="true"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous Step
          </button>

          {currentPage < 4 ? (
            <button
              type="button"
              onClick={handleSaveAndContinue}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <span>Save & Continue</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinalSubmit}
              className={`px-6 py-2.5 text-xs font-semibold text-white rounded-md transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                agentState === 'AWAITING_FINAL_HUMAN_SUBMIT'
                  ? 'bg-emerald-600 hover:bg-emerald-500 ring-4 ring-emerald-500/30'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Submit Application</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
