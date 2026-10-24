import React, { useState, useMemo } from 'react';
import {
  Download,
  Copy,
  Check,
  FileCode,
  Upload,
  Layers,
  ShieldCheck,
  Trash2,
  Sparkles,
  Send,
  Loader2,
} from 'lucide-react';
import {
  buildChromeExtensionFiles,
  createExtensionZipUint8Array,
} from '../utils/extensionPackager';
import { UserProfileSchema } from '../types/autoapply';
import {
  DetectedFormQuestion,
  AgentQuestionAnswer,
  QuestionControlType,
  reasonAnswerForQuestions,
} from '../utils/questionAgent';

const SAMPLE_MULTI_TYPE_ATS_QUESTIONS: DetectedFormQuestion[] = [
  {
    question_id: 'q_1',
    agent_ids: ['el_1'],
    question_text: 'Highest Education Qualification / Degree',
    question_type: 'DROPDOWN',
    question_type_label: 'Dropdown (4 options)',
    raw_input_type: 'select-one',
    options: [
      { label: 'Bachelor of Technology (B.Tech / B.E.)', value: 'B.Tech' },
      { label: 'Master of Technology (M.Tech / M.S.)', value: 'M.Tech' },
      { label: 'Master of Business Administration (MBA)', value: 'MBA' },
      { label: 'Ph.D. in Computer Science', value: 'PhD' },
    ],
  },
  {
    question_id: 'q_2',
    agent_ids: ['el_2'],
    question_text: 'Most Recent Internship / Work Start Date',
    question_type: 'DT_PICKER',
    question_type_label: 'DT Picker (YYYY-MM)',
    raw_input_type: 'month',
    options: [],
    date_format: 'YYYY-MM',
  },
  {
    question_id: 'q_3',
    agent_ids: ['el_3'],
    question_text: 'Earliest Available Joining Date',
    question_type: 'DT_PICKER',
    question_type_label: 'DT Picker (YYYY-MM-DD)',
    raw_input_type: 'date',
    options: [],
    date_format: 'YYYY-MM-DD',
  },
  {
    question_id: 'q_4',
    agent_ids: ['el_4a', 'el_4b'],
    question_text: 'Are you legally authorized to work in India without visa sponsorship?',
    question_type: 'OPTION_SELECTION',
    question_type_label: 'Option Selection (Radio · 2 choices)',
    raw_input_type: 'radio',
    options: [
      { label: 'Yes — I am legally authorized to work', value: 'yes', agent_id: 'el_4a' },
      { label: 'No — I require visa sponsorship', value: 'no', agent_id: 'el_4b' },
    ],
  },
  {
    question_id: 'q_5',
    agent_ids: ['el_5'],
    question_text: 'Cumulative GPA / CGPA (on a 10.0 scale)',
    question_type: 'NUMBER_INPUT',
    question_type_label: 'Number Input',
    raw_input_type: 'number',
    options: [],
  },
  {
    question_id: 'q_6',
    agent_ids: ['el_6'],
    question_text: 'Describe your most complex engineering project and technical architecture.',
    question_type: 'LONG_ESSAY',
    question_type_label: 'Long Essay / Screening',
    raw_input_type: 'textarea',
    options: [],
  },
];

export const ChromeExtensionExportView: React.FC = () => {
  const backendOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const extensionFiles = useMemo(
    () => buildChromeExtensionFiles(backendOrigin),
    [backendOrigin]
  );

  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(2); // Default to sidepanel.js
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [downloadedZip, setDownloadedZip] = useState<boolean>(false);

  // Interactive Post-Install SidePanel Preview State (starts empty/unseeded, just like after installation)
  const [previewResumeName, setPreviewResumeName] = useState<string | null>(null);
  const [previewExtractedText, setPreviewExtractedText] = useState<string>('');
  const [previewEngine, setPreviewEngine] = useState<string | null>(null);
  const [previewIsParsing, setPreviewIsParsing] = useState<boolean>(false);
  const [previewFullProfile, setPreviewFullProfile] = useState<UserProfileSchema | null>(null);
  const [previewAnswers, setPreviewAnswers] = useState<AgentQuestionAnswer[]>([]);
  const [isScanningQuestions, setIsScanningQuestions] = useState<boolean>(false);

  // Custom question tester inside SidePanel simulator
  const [customQText, setCustomQText] = useState<string>('');
  const [customQType, setCustomQType] = useState<'AUTO' | QuestionControlType>('AUTO');
  const [customQOptions, setCustomQOptions] = useState<string>('');
  const [customQAnswer, setCustomQAnswer] = useState<AgentQuestionAnswer | null>(null);
  const [isAskingCustomQ, setIsAskingCustomQ] = useState<boolean>(false);

  const [previewLogs, setPreviewLogs] = useState<string[]>([
    'Extension v1.3 installed (clean, unseeded storage).',
    'Upload your PDF or TXT resume above to extract your profile and activate the AI Question & Type Agent.',
  ]);

  const activeFile = extensionFiles[selectedFileIndex] || extensionFiles[0];

  const handleDownloadZip = () => {
    const zipBytes = createExtensionZipUint8Array(
      extensionFiles.map((f) => ({ name: f.name, content: f.content }))
    );
    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'autoapply-ai-chrome-extension.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadedZip(true);
    window.setTimeout(() => setDownloadedZip(false), 3500);
  };

  const handleDownloadSingleFile = (name: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyFileContent = async (name: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedFile(name);
      window.setTimeout(() => setCopiedFile(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const runAgentQuestionScanWithProfile = async (
    targetProfile: UserProfileSchema,
    resumeFileName?: string
  ) => {
    setIsScanningQuestions(true);
    // 1. Immediately populate baseline answers for all 6 control types
    const localAnswers = reasonAnswerForQuestions(
      SAMPLE_MULTI_TYPE_ATS_QUESTIONS,
      targetProfile,
      'Software Engineer — Autonomous Agent Systems',
      resumeFileName
    );
    setPreviewAnswers(localAnswers);

    try {
      const resp = await fetch('/api/agent/plan-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: SAMPLE_MULTI_TYPE_ATS_QUESTIONS,
          profile: targetProfile,
          jobDescription: 'Software Engineer — Autonomous Agent Systems',
          cachedResumeFileName: resumeFileName,
        }),
      });
      const data = await resp.json();
      if (Array.isArray(data?.answers) && data.answers.length > 0) {
        setPreviewAnswers(data.answers);
        setPreviewLogs((prev) => [
          ...prev,
          `AI Agent scanned ${data.answers.length} questions (Dropdown, DT Picker, Option Selection, Number, Essay) & generated answers via ${data.engine}.`,
        ]);
      }
    } catch {
      setPreviewLogs((prev) => [
        ...prev,
        `Generated answers for ${localAnswers.length} form questions across all control types.`,
      ]);
    } finally {
      setIsScanningQuestions(false);
    }
  };

  const handlePreviewSidepanelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewIsParsing(true);
    setPreviewLogs((prev) => [...prev, `Reading & parsing ${file.name} with Gemini AI...`]);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      let plainText = '';
      if (file.name.toLowerCase().endsWith('.txt') || file.type === 'text/plain') {
        plainText = await file.text();
      }

      const resp = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfBase64: base64Data,
          rawText: plainText,
          fileName: file.name,
        }),
      });
      const data = await resp.json();
      if (data?.profile) {
        const p: UserProfileSchema = data.profile;
        setPreviewResumeName(file.name);
        setPreviewExtractedText(data.extractedText || plainText || '');
        setPreviewEngine(data.engine || 'Gemini AI + Layout PDF Parser');
        setPreviewFullProfile(p);
        setPreviewLogs((prev) => [
          ...prev,
          `Extracted ${(data.extractedText || '').length} chars of resume text.`,
          `AI Profile extracted via ${data.engine}: ${p.personal_info.first_name} ${p.personal_info.last_name} (${p.personal_info.email}).`,
        ]);
        // Automatically demonstrate the AI Question & Type Agent on the newly extracted profile
        const baseline = reasonAnswerForQuestions(
          SAMPLE_MULTI_TYPE_ATS_QUESTIONS,
          p,
          'Software Engineer — Autonomous Agent Systems',
          file.name
        );
        setPreviewAnswers(baseline);
      }
    } catch {
      setPreviewLogs((prev) => [...prev, 'Failed to parse resume file.']);
    } finally {
      setPreviewIsParsing(false);
      e.target.value = '';
    }
  };

  const handlePreviewReExtractText = async () => {
    if (!previewExtractedText.trim()) return;
    setPreviewIsParsing(true);
    try {
      const resp = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: previewExtractedText,
          fileName: previewResumeName || 'Resume.txt',
        }),
      });
      const data = await resp.json();
      if (data?.profile) {
        setPreviewFullProfile(data.profile);
        setPreviewEngine(data.engine || 'Gemini AI');
        const baseline = reasonAnswerForQuestions(
          SAMPLE_MULTI_TYPE_ATS_QUESTIONS,
          data.profile,
          'Software Engineer — Autonomous Agent Systems',
          previewResumeName || 'Resume.pdf'
        );
        setPreviewAnswers(baseline);
        setPreviewLogs((prev) => [
          ...prev,
          `Re-extracted profile from text via ${data.engine}.`,
        ]);
      }
    } finally {
      setPreviewIsParsing(false);
    }
  };

  const handleAskCustomPreviewQuestion = async () => {
    if (!customQText.trim() || !previewFullProfile) return;
    setIsAskingCustomQ(true);

    const parsedOpts = customQOptions
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => ({ label: s, value: s }));

    let resolvedType: QuestionControlType =
      customQType === 'AUTO' ? 'SHORT_TEXT' : customQType;
    if (customQType === 'AUTO') {
      if (parsedOpts.length > 0) resolvedType = 'DROPDOWN';
      else if (/date|dob|joining|graduation|start|end/i.test(customQText))
        resolvedType = 'DT_PICKER';
      else if (/how many years|gpa|cgpa|ctc|salary|notice/i.test(customQText))
        resolvedType = 'NUMBER_INPUT';
      else if (/why|describe|explain|project|complex|fit|challenge/i.test(customQText))
        resolvedType = 'LONG_ESSAY';
    }

    const qObj: DetectedFormQuestion = {
      question_id: 'custom_sim_1',
      agent_ids: ['custom_sim_1'],
      question_text: customQText.trim(),
      question_type: resolvedType,
      question_type_label:
        resolvedType === 'DROPDOWN'
          ? `Dropdown (${parsedOpts.length || 1} options)`
          : resolvedType === 'DT_PICKER'
          ? 'DT Picker (YYYY-MM-DD)'
          : resolvedType === 'OPTION_SELECTION'
          ? 'Option Selection (Radio)'
          : resolvedType,
      raw_input_type: resolvedType.toLowerCase(),
      options: parsedOpts,
      date_format: 'YYYY-MM-DD',
    };

    try {
      const resp = await fetch('/api/agent/plan-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: [qObj],
          profile: previewFullProfile,
          jobDescription: 'Software Engineer — Autonomous Agent Systems',
        }),
      });
      const data = await resp.json();
      if (data?.answers?.[0]) {
        setCustomQAnswer(data.answers[0]);
        setIsAskingCustomQ(false);
        return;
      }
    } catch {
      // fallback
    }

    const localAns = reasonAnswerForQuestions([qObj], previewFullProfile)[0];
    setCustomQAnswer(localAns);
    setIsAskingCustomQ(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Clean, Unseeded Chrome Extension (Manifest V3 v1.3) Packager */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="space-y-1 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded">
                MANIFEST V3 v1.3 · AI QUESTION &amp; TYPE AGENT
              </span>
              <span className="text-xs font-mono text-emerald-700">
                Detects Dropdowns, DT Pickers, Option Selections &amp; Answers Any Question From Profile
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              Standalone Chrome Extension — AI Question Type Detector &amp; Profile Answer Agent
            </h1>
            <p className="text-sm text-slate-600">
              Download <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">v1.3.0</code>{' '}
              below and click <strong>Reload</strong> in{' '}
              <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">chrome://extensions</code>.
              The extension now inspects every form question, identifies its exact control type (
              <strong>Dropdown</strong>, <strong>DT Picker</strong>, <strong>Option Selection</strong>,{' '}
              <strong>Number</strong>, <strong>Short Text</strong>, or <strong>Long Essay</strong>),
              and uses Gemini AI (<code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">PROXY_PLAN_FORM</code>)
              + the Profile Reasoner to answer any question from your generated profile.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadZip}
            className="px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 shadow-xs"
          >
            {downloadedZip ? (
              <>
                <Check className="w-4 h-4" />
                <span>Downloaded autoapply-ai-chrome-extension.zip</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download Chrome Extension v1.3 (.zip)</span>
              </>
            )}
          </button>
        </div>

        {/* 4-Step Guide */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
            <div className="text-xs font-mono font-bold text-blue-600">STEP 01</div>
            <h2 className="text-sm font-semibold text-slate-900">Download &amp; Reload v1.3</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Click <strong>Download Chrome Extension v1.3 (.zip)</strong> above, extract it, and
              click <strong>Reload</strong> in <code className="font-mono">chrome://extensions</code>.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
            <div className="text-xs font-mono font-bold text-blue-600">STEP 02</div>
            <h2 className="text-sm font-semibold text-slate-900">Upload Resume in SidePanel</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Upload your PDF or TXT resume in the SidePanel to decompress the PDF text and build
              your <code className="font-mono">profile_schema.json</code> with Gemini AI.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
            <div className="text-xs font-mono font-bold text-blue-600">STEP 03</div>
            <h2 className="text-sm font-semibold text-slate-900">Scan Questions &amp; Types</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Click <strong>1. Scan Questions, Types &amp; Generate AI Answers</strong> to see every
              question, its type (Dropdown, DT Picker, Radio), and the AI-generated answer.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
            <div className="text-xs font-mono font-bold text-blue-600">STEP 04</div>
            <h2 className="text-sm font-semibold text-slate-900">AI Agent Form Fill</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Click <strong>2. AI Agent: Fill All Answers into Form</strong> to select dropdowns,
              populate DT pickers, click radio options, and fill screening answers.
            </p>
          </div>
        </div>
      </section>

      {/* Main Inspector Grid: Generated Extension Source Files (Left 7 Cols) + Post-Install SidePanel Preview (Right 5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Live Extension Source Code Inspector */}
        <section className="lg:col-span-7 bg-slate-900 text-slate-100 border border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-semibold text-white">
                Unseeded Chrome Extension v1.3 Source Files (Manifest V3)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopyFileContent(activeFile.name, activeFile.content)}
                className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded flex items-center gap-1.5 transition-colors"
              >
                {copiedFile === activeFile.name ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied {activeFile.name}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy {activeFile.name}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadSingleFile(activeFile.name, activeFile.content)}
                className="px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download {activeFile.name}</span>
              </button>
            </div>
          </div>

          {/* File Selector Tabs */}
          <div className="flex items-center gap-1 px-3 py-2 bg-slate-950/60 border-b border-slate-800 overflow-x-auto">
            {extensionFiles.map((file, idx) => (
              <button
                key={file.name}
                type="button"
                onClick={() => setSelectedFileIndex(idx)}
                className={`px-3 py-1.5 text-xs font-mono rounded transition-colors whitespace-nowrap ${
                  idx === selectedFileIndex
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                }`}
              >
                {file.name}
              </button>
            ))}
          </div>

          <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-xs text-slate-400">
            {activeFile.description}
          </div>

          <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-[780px] leading-relaxed">
            {activeFile.content}
          </pre>
        </section>

        {/* Right 5 Columns: Interactive Preview of the Post-Install Chrome SidePanel UI */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-slate-900 text-slate-100 border border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 block">
                  Interactive SidePanel Simulator (sidepanel.html v1.3)
                </span>
                <h2 className="text-sm font-bold text-white">AutoApply AI Agent — Chrome SidePanel</h2>
              </div>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono rounded ${
                  previewFullProfile
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-slate-800 text-amber-300 border border-slate-700'
                }`}
              >
                {previewIsParsing ? 'PARSING...' : previewFullProfile ? 'READY' : 'NO RESUME'}
              </span>
            </div>

            {/* Step 1 inside SidePanel: Upload / Update Resume + Visible Extracted PDF Text */}
            <div className="p-3.5 bg-slate-800/80 border border-slate-700 rounded-lg space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
                  1. Upload / Update Resume
                </span>
                <span className="font-mono text-[11px] text-blue-400">
                  {previewResumeName || 'None uploaded'}
                </span>
              </div>

              <label className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md cursor-pointer transition-colors flex items-center justify-center gap-2">
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {previewIsParsing
                    ? 'Parsing PDF & Extracting with Gemini AI...'
                    : 'Upload / Update Resume (PDF or TXT)'}
                </span>
                <input
                  type="file"
                  id="sidepanel-preview-upload"
                  accept=".pdf,.txt"
                  disabled={previewIsParsing}
                  onChange={handlePreviewSidepanelUpload}
                  className="sr-only"
                />
              </label>

              {previewEngine && (
                <div className="px-2.5 py-1.5 bg-emerald-950/70 border border-emerald-800/80 rounded text-[11px] font-mono text-emerald-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>Engine: {previewEngine}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[10px] font-semibold text-slate-300">
                  Extracted PDF Text / Paste Resume Text
                </label>
                <textarea
                  rows={3}
                  value={previewExtractedText}
                  onChange={(e) => setPreviewExtractedText(e.target.value)}
                  placeholder="Uploaded PDF text appears here automatically..."
                  className="w-full p-2 bg-slate-950 border border-slate-700 rounded text-[11px] font-mono text-slate-200 leading-relaxed"
                />
                <button
                  type="button"
                  disabled={previewIsParsing || !previewExtractedText.trim()}
                  onClick={handlePreviewReExtractText}
                  className="w-full py-1.5 px-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-xs font-semibold text-white rounded transition-colors"
                >
                  Re-Extract Profile from Text Above
                </button>
              </div>
            </div>

            {/* Step 2 inside SidePanel: AI Form Question & Type Agent Inspector */}
            <div className="p-3.5 bg-slate-800/80 border border-slate-700 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
                  2. AI Form Question &amp; Type Agent
                </span>
                <span className="font-mono text-[11px] text-emerald-400">
                  {previewAnswers.length} questions analyzed
                </span>
              </div>

              <button
                type="button"
                id="btn-preview-scan-questions"
                disabled={!previewFullProfile || isScanningQuestions}
                onClick={() =>
                  previewFullProfile &&
                  runAgentQuestionScanWithProfile(
                    previewFullProfile,
                    previewResumeName || undefined
                  )
                }
                className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-semibold text-white rounded flex items-center justify-center gap-1.5 transition-colors"
              >
                {isScanningQuestions ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Scan Questions, Detect Types &amp; Generate AI Answers</span>
              </button>

              {previewAnswers.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {previewAnswers.map((ans, i) => (
                    <div
                      key={ans.question_id}
                      className="p-2.5 bg-slate-950 border border-slate-800 rounded space-y-1 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-slate-100 text-[11px]">
                          {i + 1}. {ans.question_text}
                        </span>
                        <span className="px-1.5 py-0.5 text-[9px] font-mono font-semibold bg-blue-950 text-blue-300 border border-blue-800 rounded whitespace-nowrap shrink-0">
                          {ans.question_type_label}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-emerald-300 bg-slate-900 px-2 py-1 rounded border border-slate-800 break-words">
                        {ans.answer}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Source: {ans.profile_source}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Custom Question & Type Tester */}
              <div className="pt-2 border-t border-slate-700/80 space-y-2">
                <label className="block text-[10px] font-semibold text-blue-300">
                  3. Ask AI Agent Any Question From Your Uploaded Profile
                </label>
                <input
                  type="text"
                  id="sidepanel-custom-question"
                  value={customQText}
                  onChange={(e) => setCustomQText(e.target.value)}
                  placeholder="e.g. What is your university? / When can you start? / Why hire you?"
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={customQType}
                    onChange={(e) =>
                      setCustomQType(e.target.value as 'AUTO' | QuestionControlType)
                    }
                    className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-[11px] text-slate-200"
                  >
                    <option value="AUTO">Auto-Detect Type</option>
                    <option value="DROPDOWN">Dropdown Select</option>
                    <option value="DT_PICKER">DT Picker (Date)</option>
                    <option value="OPTION_SELECTION">Option Selection</option>
                    <option value="NUMBER_INPUT">Number Input</option>
                    <option value="SHORT_TEXT">Short Text</option>
                    <option value="LONG_ESSAY">Long Essay</option>
                  </select>
                  <input
                    type="text"
                    value={customQOptions}
                    onChange={(e) => setCustomQOptions(e.target.value)}
                    placeholder="Options (comma-sep)"
                    className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-[11px] text-slate-200"
                  />
                </div>
                <button
                  type="button"
                  disabled={!previewFullProfile || !customQText.trim() || isAskingCustomQ}
                  onClick={handleAskCustomPreviewQuestion}
                  className="w-full py-1.5 px-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-xs font-semibold text-white rounded flex items-center justify-center gap-1.5 transition-colors"
                >
                  {isAskingCustomQ ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Generate Answer from My Profile</span>
                </button>
                {customQAnswer && (
                  <div className="p-2 bg-slate-950 border border-blue-800/80 rounded text-[11px] space-y-1">
                    <div className="font-mono text-blue-300 text-[10px]">
                      Detected Type: {customQAnswer.question_type_label}
                    </div>
                    <div className="font-mono text-emerald-300 break-words">
                      {customQAnswer.answer}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 3 inside SidePanel: Extracted Candidate Profile & JSON */}
            <div className="p-3.5 bg-slate-800/80 border border-slate-700 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
                  4. Extracted Candidate Profile
                </span>
                {previewFullProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewFullProfile(null);
                      setPreviewResumeName(null);
                      setPreviewExtractedText('');
                      setPreviewEngine(null);
                      setPreviewAnswers([]);
                      setCustomQAnswer(null);
                      setPreviewLogs((prev) => [
                        ...prev,
                        'Cleared stored resume & profile from chrome.storage.local.',
                      ]);
                    }}
                    className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">First Name</label>
                  <input
                    type="text"
                    readOnly
                    value={previewFullProfile?.personal_info.first_name || ''}
                    placeholder="Empty until uploaded"
                    className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Last Name</label>
                  <input
                    type="text"
                    readOnly
                    value={previewFullProfile?.personal_info.last_name || ''}
                    placeholder="Empty until uploaded"
                    className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Email</label>
                  <input
                    type="text"
                    readOnly
                    value={previewFullProfile?.personal_info.email || ''}
                    placeholder="you@example.com"
                    className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Phone</label>
                  <input
                    type="text"
                    readOnly
                    value={previewFullProfile?.personal_info.phone.number || ''}
                    placeholder="10-digit phone"
                    className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">University</label>
                  <input
                    type="text"
                    readOnly
                    value={previewFullProfile?.education[0]?.institution || ''}
                    placeholder="University"
                    className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Recent Company</label>
                  <input
                    type="text"
                    readOnly
                    value={previewFullProfile?.work_experience[0]?.company || ''}
                    placeholder="Company"
                    className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-white"
                  />
                </div>
              </div>
            </div>

            {/* Step 5 inside SidePanel: Execution Log */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-md font-mono text-[11px] text-slate-300 space-y-1 max-h-28 overflow-y-auto">
              {previewLogs.map((l, i) => (
                <div key={i}>&gt; {l}</div>
              ))}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <h3 className="text-sm font-semibold text-slate-900">
                How v1.3 Detects Question Types &amp; Generates Profile Answers
              </h3>
            </div>

            <ul className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
              <li className="flex items-start gap-2">
                <Layers className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Overarching Question Extraction:</strong> Walks up to{' '}
                  <code className="font-mono">&lt;fieldset&gt;&lt;legend&gt;</code>,{' '}
                  <code className="font-mono">[role=&quot;radiogroup&quot;]</code>, and question
                  containers so radio/checkbox choices (&quot;Yes&quot; / &quot;No&quot;) are
                  grouped under the actual question prompt.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Layers className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Multi-Type Classification &amp; Formatting:</strong> Distinguishes{' '}
                  <code className="font-mono">DROPDOWN</code> (with extracted options),{' '}
                  <code className="font-mono">DT_PICKER</code> (<code className="font-mono">YYYY-MM-DD</code>{' '}
                  or <code className="font-mono">YYYY-MM</code>),{' '}
                  <code className="font-mono">OPTION_SELECTION</code>,{' '}
                  <code className="font-mono">NUMBER_INPUT</code>, and{' '}
                  <code className="font-mono">LONG_ESSAY</code>.
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};
