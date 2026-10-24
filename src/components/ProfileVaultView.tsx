import React, { useState, useEffect } from 'react';
import {
  FileText,
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  Upload,
  Loader2,
  Database,
  RotateCcw,
} from 'lucide-react';
import { UserProfileSchema, CachedResumeFile } from '../types/autoapply';

interface ProfileVaultViewProps {
  profile: UserProfileSchema;
  setProfile: React.Dispatch<React.SetStateAction<UserProfileSchema>>;
  cachedResume: CachedResumeFile;
  setCachedResume: React.Dispatch<React.SetStateAction<CachedResumeFile>>;
  onUploadResumeFile: (file: File) => Promise<void>;
  isUploadingResume: boolean;
  resumeParseBanner: string | null;
  onResetToDemoProfile: () => void;
}

export const ProfileVaultView: React.FC<ProfileVaultViewProps> = ({
  profile,
  setProfile,
  cachedResume,
  setCachedResume,
  onUploadResumeFile,
  isUploadingResume,
  resumeParseBanner,
  onResetToDemoProfile,
}) => {
  const [rawResumeInput, setRawResumeInput] = useState(cachedResume.rawExtractedText);
  const [isParsingText, setIsParsingText] = useState(false);
  const [parseStatus, setParseStatus] = useState<string | null>(null);

  // Sync textarea whenever a new PDF is uploaded & extracted
  useEffect(() => {
    setRawResumeInput(cachedResume.rawExtractedText);
  }, [cachedResume.rawExtractedText]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseStatus(null);
    await onUploadResumeFile(file);
  };

  const handleExtractFromRawText = async () => {
    if (!rawResumeInput.trim()) return;
    setIsParsingText(true);
    setParseStatus(null);
    try {
      const response = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: rawResumeInput,
          fileName: cachedResume.fileName,
          currentProfile: profile,
        }),
      });
      const data = await response.json();
      if (data.profile) {
        setProfile(data.profile);
        setCachedResume((prev) => ({
          ...prev,
          rawExtractedText: rawResumeInput,
        }));
        setParseStatus(
          `Profile updated for ${data.profile.personal_info.first_name} ${data.profile.personal_info.last_name} via ${data.engine || 'Gemini 3.8 Flash'}.`
        );
      }
    } catch (err) {
      console.error('Resume extraction failed:', err);
      setParseStatus('Failed to extract resume schema.');
    } finally {
      setIsParsingText(false);
    }
  };

  const addWorkExperienceToVault = () => {
    setProfile((prev) => ({
      ...prev,
      work_experience: [
        ...prev.work_experience,
        {
          company: 'New Company',
          role: 'Software Engineer',
          location: `${prev.personal_info.location.city}, ${prev.personal_info.location.state}`,
          start_date: '2025-01',
          end_date: '2025-04',
          is_current: false,
          description_bullets: [
            'Built automated LLM evaluation benchmarks and structured JSON extraction pipelines.',
          ],
        },
      ],
    }));
  };

  const removeWorkExperienceFromVault = (index: number) => {
    if (profile.work_experience.length <= 1) return;
    setProfile((prev) => ({
      ...prev,
      work_experience: prev.work_experience.filter((_, i) => i !== index),
    }));
  };

  const updateExperienceItem = (
    index: number,
    field: 'company' | 'role' | 'start_date' | 'end_date' | 'location',
    val: string
  ) => {
    setProfile((prev) => {
      const copy = [...prev.work_experience];
      copy[index] = { ...copy[index], [field]: val };
      return { ...prev, work_experience: copy };
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Resume PDF Ingestion, Base64 Blob Cache & Demographic/EEO Vault */}
      <div className="lg:col-span-7 space-y-6">
        {/* FR 1.1, 1.2, 1.4: PDF Ingestion & Base64 Blob Caching */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Feature 1: Upload Your Resume PDF & Extract Live Profile
              </h2>
              <p className="text-xs text-slate-500">
                Uploading a PDF immediately parses your real name, contact info, education, work
                experience, projects, and skills into <code className="font-mono">profile_schema.json</code>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0">
                {isUploadingResume ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>{isUploadingResume ? 'Parsing PDF...' : 'Upload & Parse Resume (PDF)'}</span>
                <input
                  type="file"
                  accept=".pdf,.txt"
                  disabled={isUploadingResume}
                  onChange={handleFileSelect}
                  className="sr-only"
                />
              </label>
              <button
                type="button"
                onClick={onResetToDemoProfile}
                className="px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Demo</span>
              </button>
            </div>
          </div>

          {(resumeParseBanner || parseStatus) && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2 text-xs text-emerald-900 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{parseStatus || resumeParseBanner}</span>
            </div>
          )}

          {/* Cached File Blob Status Bar */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-blue-600 shrink-0" />
              <div>
                <span className="font-semibold text-slate-900">{cachedResume.fileName}</span>
                <span className="mx-1.5 text-slate-400">·</span>
                <span className="font-mono tabular-nums text-slate-600">
                  {(cachedResume.fileSizeBytes / 1024).toFixed(1)} KB
                </span>
              </div>
            </div>
            <span className="font-mono text-[11px] text-emerald-700">
              Active Candidate: {profile.personal_info.first_name} {profile.personal_info.last_name}
            </span>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="resume-raw-text"
              className="block text-xs font-semibold text-slate-700"
            >
              Extracted PDF Text / Paste Custom Resume Text
            </label>
            <textarea
              id="resume-raw-text"
              rows={6}
              value={rawResumeInput}
              onChange={(e) => setRawResumeInput(e.target.value)}
              placeholder="Upload a PDF above or paste your resume text here..."
              className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:border-blue-600 leading-relaxed"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={isParsingText || isUploadingResume}
              onClick={handleExtractFromRawText}
              className="px-4 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 disabled:opacity-50 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              {isParsingText ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              )}
              <span>Re-Extract Profile from Text Above</span>
            </button>
          </div>
        </section>

        {/* Personal Info & Education / Experience / EEO Vault (FR 1.3) */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="pb-3 border-b border-slate-200">
            <h3 className="text-base font-semibold text-slate-900">
              Active Candidate Profile & EEO Vault ({profile.personal_info.first_name}{' '}
              {profile.personal_info.last_name})
            </h3>
            <p className="text-xs text-slate-500">
              Verify or fine-tune any extracted field below. AutoApply AI uses this exact profile on
              all 4 pages of the MockATS Sandbox.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label htmlFor="vault-fname" className="block text-xs font-semibold text-slate-700">
                First Name
              </label>
              <input
                id="vault-fname"
                type="text"
                value={profile.personal_info.first_name}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    personal_info: { ...prev.personal_info, first_name: e.target.value },
                  }))
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="vault-lname" className="block text-xs font-semibold text-slate-700">
                Last Name
              </label>
              <input
                id="vault-lname"
                type="text"
                value={profile.personal_info.last_name}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    personal_info: { ...prev.personal_info, last_name: e.target.value },
                  }))
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="vault-email" className="block text-xs font-semibold text-slate-700">
                Email
              </label>
              <input
                id="vault-email"
                type="email"
                value={profile.personal_info.email}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    personal_info: { ...prev.personal_info, email: e.target.value },
                  }))
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label htmlFor="vault-phone" className="block text-xs font-semibold text-slate-700">
                Phone Number
              </label>
              <input
                id="vault-phone"
                type="text"
                value={profile.personal_info.phone.number}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    personal_info: {
                      ...prev.personal_info,
                      phone: { ...prev.personal_info.phone, number: e.target.value },
                    },
                  }))
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md font-mono tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="vault-city" className="block text-xs font-semibold text-slate-700">
                City
              </label>
              <input
                id="vault-city"
                type="text"
                value={profile.personal_info.location.city}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    personal_info: {
                      ...prev.personal_info,
                      location: { ...prev.personal_info.location, city: e.target.value },
                    },
                  }))
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="vault-uni" className="block text-xs font-semibold text-slate-700">
                University / Institution
              </label>
              <input
                id="vault-uni"
                type="text"
                value={profile.education[0]?.institution || ''}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    education: [
                      {
                        ...(prev.education[0] || {
                          degree: 'B.Tech',
                          major: 'Computer Science',
                          gpa: 9.0,
                          start_date: '2022-08',
                          end_date: '2026-05',
                          is_current: false,
                        }),
                        institution: e.target.value,
                      },
                    ],
                  }))
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label htmlFor="vault-notice" className="block text-xs font-semibold text-slate-700">
                Notice Period (Days)
              </label>
              <input
                id="vault-notice"
                type="number"
                value={profile.application_metadata.notice_period_days}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    application_metadata: {
                      ...prev.application_metadata,
                      notice_period_days: Number(e.target.value) || 0,
                    },
                  }))
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md font-mono tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="vault-ctc" className="block text-xs font-semibold text-slate-700">
                Expected CTC (LPA)
              </label>
              <input
                id="vault-ctc"
                type="number"
                step="0.5"
                value={profile.application_metadata.expected_ctc_lpa}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    application_metadata: {
                      ...prev.application_metadata,
                      expected_ctc_lpa: Number(e.target.value) || 0,
                    },
                  }))
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md font-mono tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="vault-gender" className="block text-xs font-semibold text-slate-700">
                EEO Gender Identity
              </label>
              <select
                id="vault-gender"
                value={profile.application_metadata.gender}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    application_metadata: {
                      ...prev.application_metadata,
                      gender: e.target.value,
                    },
                  }))
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Non-Binary">Non-Binary</option>
                <option value="Prefer not to disclose">Prefer not to disclose</option>
              </select>
            </div>
          </div>

          {/* Extracted Education Summary */}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <h4 className="text-xs font-semibold text-slate-800">
              Extracted Education ({profile.education.length} Item{profile.education.length === 1 ? '' : 's'})
            </h4>
            <div className="space-y-2">
              {profile.education.map((edu, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-md flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{edu.institution}</div>
                    <div className="text-slate-600">
                      {edu.degree} in {edu.major}
                    </div>
                  </div>
                  <div className="text-right font-mono text-[11px] text-slate-600">
                    <div>CGPA/GPA: {edu.gpa}</div>
                    <div>
                      {edu.start_date} to {edu.is_current ? 'Present' : edu.end_date}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Work Experience Array Manager (Drives FR 3.2 N-1 Dynamic Button Clicks) */}
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-slate-800">
                  Extracted Work Experience ({profile.work_experience.length} Items)
                </h4>
                <p className="text-[11px] text-slate-500">
                  On Page 2 of MockATS, AutoApply AI clicks &quot;+ Add Another Experience&quot;{' '}
                  {Math.max(0, profile.work_experience.length - 1)} time(s) to match this list.
                </p>
              </div>
              <button
                type="button"
                onClick={addWorkExperienceToVault}
                className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Experience
              </button>
            </div>

            <div className="space-y-2">
              {profile.work_experience.map((exp, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                      <input
                        type="text"
                        value={exp.company}
                        aria-label={`Experience ${idx + 1} Company`}
                        onChange={(e) => updateExperienceItem(idx, 'company', e.target.value)}
                        className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-300 rounded"
                      />
                      <input
                        type="text"
                        value={exp.role}
                        aria-label={`Experience ${idx + 1} Role`}
                        onChange={(e) => updateExperienceItem(idx, 'role', e.target.value)}
                        className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded"
                      />
                    </div>
                    {profile.work_experience.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeWorkExperienceFromVault(idx)}
                        aria-label={`Remove ${exp.company}`}
                        className="text-xs text-slate-400 hover:text-red-600 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">
                    {exp.start_date} to {exp.is_current ? 'Present' : exp.end_date} · {exp.location}
                  </div>
                  {exp.description_bullets.length > 0 && (
                    <ul className="list-disc list-inside text-[11px] text-slate-600 space-y-0.5">
                      {exp.description_bullets.map((b, bIdx) => (
                        <li key={bIdx}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Extracted Projects & Technical Skills */}
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <h4 className="text-xs font-semibold text-slate-800">
              Extracted Projects ({profile.projects.length}) & Skills ({profile.skills.length})
            </h4>
            <div className="space-y-2">
              {profile.projects.map((proj, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{proj.title}</span>
                    <span className="font-mono text-[11px] text-blue-700">
                      {proj.tech_stack.join(', ')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{proj.description}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {profile.skills.map((skill, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 text-slate-800 border border-slate-300 rounded"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Right Column: Live Queryable profile_schema.json Inspector */}
      <div className="lg:col-span-5">
        <div className="bg-slate-900 text-slate-100 border border-slate-800 rounded-lg overflow-hidden flex flex-col h-full">
          <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Database className="w-4 h-4 text-blue-400" />
              <span>profile_schema.json (Live Candidate Knowledge Base)</span>
            </div>
            <span className="text-[11px] font-mono text-emerald-400">LIVE SYNCED</span>
          </div>
          <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto flex-1 max-h-[1240px] leading-relaxed">
            {JSON.stringify(profile, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};
