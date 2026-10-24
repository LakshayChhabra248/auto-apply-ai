import React, { useState, useMemo, useEffect } from 'react';
import {
  Play,
  Zap,
  Code2,
  CheckCircle2,
  Loader2,
  Eye,
  Lock,
  ShieldAlert,
  Copy,
  Check,
  Sparkles,
  Send,
} from 'lucide-react';
import {
  AgentState,
  AgentActionStep,
  DistilledElement,
  TokenTelemetry,
  UserProfileSchema,
} from '../types/autoapply';
import {
  convertDistilledElementsToQuestions,
  reasonAnswerForQuestions,
  AgentQuestionAnswer,
  QuestionControlType,
} from '../utils/questionAgent';
import { DEFAULT_USER_PROFILE } from '../data/seedProfile';

interface ExtensionSidePanelProps {
  agentState: AgentState;
  currentPage: number;
  distilledElements: DistilledElement[];
  actionPlan: AgentActionStep[];
  telemetry: TokenTelemetry;
  isExecuting: boolean;
  profile?: UserProfileSchema;
  cachedResumeFileName?: string;
  onDistillOnly: () => void;
  onRunCurrentPageAgent: () => Promise<void>;
  onRunFullAutopilot: () => Promise<void>;
}

const MV3_MANIFEST_CODE = `{
  "manifest_version": 3,
  "name": "AutoApply AI — Autonomous ATS Form Agent",
  "version": "1.3.0",
  "permissions": ["storage", "sidePanel", "activeTab", "scripting", "tabs"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle",
      "all_frames": true
    }
  ]
}`;

const MV3_CONTENT_SCRIPT_CODE = `// Question & Control Type Detector (DROPDOWN, DT_PICKER, OPTION_SELECTION, NUMBER, ESSAY)
function classifyControlQuestionType(el, questionText, optionsList) {
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || tag).toLowerCase();
  const role = (el.getAttribute('role') || '').toLowerCase();
  if (type === 'file') return { question_type: 'FILE_UPLOAD', label: 'File Upload (PDF)' };
  if (type === 'radio' || type === 'checkbox') return { question_type: 'OPTION_SELECTION', label: 'Option Selection' };
  if (type === 'date' || type === 'month' || /start\\s*date|end\\s*date|joining\\s*date/i.test(questionText))
    return { question_type: 'DT_PICKER', label: 'DT Picker (Date/Month)' };
  if (tag === 'select' || role === 'combobox' || (optionsList && optionsList.length > 0))
    return { question_type: 'DROPDOWN', label: 'Dropdown Select' };
  if (type === 'number' || /cgpa|gpa|ctc|notice\\s*period/i.test(questionText))
    return { question_type: 'NUMBER_INPUT', label: 'Number Input' };
  if (tag === 'textarea') return { question_type: 'LONG_ESSAY', label: 'Long Essay / Screening' };
  return { question_type: 'SHORT_TEXT', label: 'Short Text Input' };
}`;

export const ExtensionSidePanel: React.FC<ExtensionSidePanelProps> = ({
  agentState,
  currentPage,
  distilledElements,
  actionPlan,
  telemetry,
  isExecuting,
  profile = DEFAULT_USER_PROFILE,
  cachedResumeFileName,
  onDistillOnly,
  onRunCurrentPageAgent,
  onRunFullAutopilot,
}) => {
  const [activeTab, setActiveTab] = useState<'questions' | 'actions' | 'dom' | 'mv3'>('questions');
  const [copiedCode, setCopiedCode] = useState(false);

  // Convert distilled elements on the current page into grouped questions with QuestionControlType
  const detectedQuestions = useMemo(
    () => convertDistilledElementsToQuestions(distilledElements),
    [distilledElements]
  );

  // Compute baseline answers for all detected questions from the active profile
  const baselineAnswers = useMemo(
    () =>
      reasonAnswerForQuestions(
        detectedQuestions,
        profile,
        'Software Engineer — Autonomous Agent Systems',
        cachedResumeFileName
      ),
    [detectedQuestions, profile, cachedResumeFileName]
  );

  const [aiAnswers, setAiAnswers] = useState<AgentQuestionAnswer[]>(baselineAnswers);
  const [aiEngineName, setAiEngineName] = useState<string>('Profile Question-Type Agent');
  const [isPlanningWithAi, setIsPlanningWithAi] = useState<boolean>(false);

  useEffect(() => {
    setAiAnswers(baselineAnswers);
  }, [baselineAnswers]);

  // Custom question tester state
  const [customQuestionText, setCustomQuestionText] = useState<string>('');
  const [customQuestionType, setCustomQuestionType] = useState<'AUTO' | QuestionControlType>('AUTO');
  const [customOptionsText, setCustomOptionsText] = useState<string>('');
  const [customQuestionResult, setCustomQuestionResult] = useState<AgentQuestionAnswer | null>(null);
  const [isAskingCustom, setIsAskingCustom] = useState<boolean>(false);

  const handleRunGeminiPlanForm = async () => {
    if (detectedQuestions.length === 0) return;
    setIsPlanningWithAi(true);
    try {
      const resp = await fetch('/api/agent/plan-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: detectedQuestions,
          profile,
          jobDescription: 'Software Engineer — Autonomous Agent Systems',
          cachedResumeFileName,
        }),
      });
      const data = await resp.json();
      if (Array.isArray(data?.answers) && data.answers.length > 0) {
        setAiAnswers(data.answers);
        setAiEngineName(data.engine || 'gemini-3.1-flash-lite-preview');
      }
    } catch {
      // keep baselineAnswers
    } finally {
      setIsPlanningWithAi(false);
    }
  };

  const handleAskCustomQuestion = async () => {
    const qText = customQuestionText.trim();
    if (!qText) return;
    setIsAskingCustom(true);

    const parsedOptions = customOptionsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => ({ label: s, value: s }));

    let resolvedType: QuestionControlType =
      customQuestionType === 'AUTO' ? 'SHORT_TEXT' : customQuestionType;
    if (customQuestionType === 'AUTO') {
      if (parsedOptions.length > 0) resolvedType = 'DROPDOWN';
      else if (/date|dob|joining|graduation|start|end/i.test(qText)) resolvedType = 'DT_PICKER';
      else if (/how many years|gpa|cgpa|ctc|salary|notice/i.test(qText))
        resolvedType = 'NUMBER_INPUT';
      else if (/why|describe|explain|project|complex|fit|challenge/i.test(qText))
        resolvedType = 'LONG_ESSAY';
    }

    const singleQuestion = {
      question_id: 'custom_q_1',
      agent_ids: ['custom_q_1'],
      question_text: qText,
      question_type: resolvedType,
      question_type_label:
        resolvedType === 'DROPDOWN'
          ? `Dropdown (${parsedOptions.length || 1} options)`
          : resolvedType === 'DT_PICKER'
          ? 'DT Picker (YYYY-MM-DD)'
          : resolvedType === 'OPTION_SELECTION'
          ? 'Option Selection (Radio)'
          : resolvedType,
      raw_input_type: resolvedType.toLowerCase(),
      options: parsedOptions,
      date_format: 'YYYY-MM-DD' as const,
    };

    try {
      const resp = await fetch('/api/agent/plan-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: [singleQuestion],
          profile,
          jobDescription: 'Software Engineer — Autonomous Agent Systems',
        }),
      });
      const data = await resp.json();
      if (data?.answers?.[0]) {
        setCustomQuestionResult(data.answers[0]);
        setIsAskingCustom(false);
        return;
      }
    } catch {
      // fallback to local reasoner
    }

    const fallback = reasonAnswerForQuestions([singleQuestion], profile)[0];
    setCustomQuestionResult(fallback);
    setIsAskingCustom(false);
  };

  const copyMv3Code = () => {
    navigator.clipboard?.writeText(`${MV3_MANIFEST_CODE}\n\n${MV3_CONTENT_SCRIPT_CODE}`);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  return (
    <aside
      aria-label="AutoApply AI Chrome SidePanel"
      className="bg-slate-900 text-slate-100 border border-slate-800 rounded-lg overflow-hidden flex flex-col"
    >
      {/* Chrome SidePanel Header */}
      <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-white tracking-tight truncate">
            AutoApply AI · Question &amp; Type Agent (MV3 v1.3)
          </div>
          <div className="text-[11px] text-slate-400 font-mono truncate">
            Active Profile: {profile.personal_info.first_name} {profile.personal_info.last_name} · Page {currentPage}/4
          </div>
        </div>
        <span className="text-[11px] font-mono font-semibold text-blue-400 whitespace-nowrap shrink-0">
          {agentState}
        </span>
      </div>

      {/* State Machine Pipeline Bar (FR 4.1) */}
      <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800">
        <div className="text-[11px] text-slate-400 mb-1.5 flex items-center justify-between">
          <span>AI Agent Perception &amp; Action Loop</span>
          <span className="font-mono tabular-nums text-emerald-400">
            {detectedQuestions.length} Questions Detected
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
          {[
            { id: 'ANALYZING_DOM', label: '1. SCAN_TYPES' },
            { id: 'EXECUTING_ACTIONS', label: '2. AI_ANSWER' },
            { id: 'AWAITING_FINAL_HUMAN_SUBMIT', label: '3. SUBMIT_GUARD' },
          ].map((st) => {
            const active =
              agentState === st.id ||
              (st.id === 'EXECUTING_ACTIONS' &&
                (agentState === 'VERIFYING_ERRORS' || agentState === 'NAVIGATING_NEXT_PAGE'));
            return (
              <div
                key={st.id}
                className={`px-2 py-1 rounded text-center truncate border ${
                  active
                    ? 'bg-blue-600/25 border-blue-500 text-blue-200 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-500'
                }`}
              >
                {st.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Primary Action Controls */}
      <div className="p-4 border-b border-slate-800 space-y-2.5 bg-slate-900">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isExecuting}
            onClick={onRunCurrentPageAgent}
            className="px-3.5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-md transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            {isExecuting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            <span>AI Agent Fill Page {currentPage}</span>
          </button>

          <button
            type="button"
            disabled={isExecuting}
            onClick={onRunFullAutopilot}
            className="px-3.5 py-2.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-md transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Run 4-Page Autopilot</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isExecuting || isPlanningWithAi}
            onClick={handleRunGeminiPlanForm}
            className="px-3 py-1.5 text-xs font-medium text-blue-300 bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800 rounded-md transition-colors flex items-center justify-center gap-1.5"
          >
            {isPlanningWithAi ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>Re-Plan Answers with Gemini AI</span>
          </button>

          <button
            type="button"
            disabled={isExecuting}
            onClick={onDistillOnly}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors flex items-center justify-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Re-Scan Live DOM</span>
          </button>
        </div>
      </div>

      {/* SidePanel Segmented View Switcher */}
      <div className="px-4 pt-3 bg-slate-900 border-b border-slate-800 flex items-center gap-1 overflow-x-auto">
        {[
          { id: 'questions', label: `Questions & Types (${aiAnswers.length})` },
          { id: 'actions', label: `Action Plan (${actionPlan.length})` },
          { id: 'dom', label: `Distilled DOM (${distilledElements.length})` },
          { id: 'mv3', label: 'MV3 Code' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as 'questions' | 'actions' | 'dom' | 'mv3')}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-blue-500 text-white bg-slate-800/70'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content Viewport */}
      <div className="p-4 flex-1 overflow-y-auto max-h-[600px] space-y-3">
        {activeTab === 'questions' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Detected Page Questions, Control Types &amp; Profile Answers</span>
              <span className="font-mono text-emerald-400">{aiEngineName}</span>
            </div>

            {aiAnswers.map((ans, idx) => (
              <div
                key={ans.question_id}
                className="p-3 bg-slate-950/90 border border-slate-800 rounded-md space-y-1.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-white">
                    {idx + 1}. {ans.question_text}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-blue-950 text-blue-300 border border-blue-800 rounded whitespace-nowrap shrink-0">
                    {ans.question_type_label}
                  </span>
                </div>

                <div className="font-mono text-[11px] text-emerald-300 bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800 break-words">
                  Answer: {ans.answer}
                </div>

                <div className="text-[11px] text-slate-400 flex items-center justify-between gap-2">
                  <span>Source: {ans.profile_source}</span>
                  <span className="font-mono text-[10px] text-slate-500">
                    [{ans.agent_ids.join(', ')}]
                  </span>
                </div>
              </div>
            ))}

            {/* Ask AI Agent Any Custom Question Against Profile */}
            <div className="p-3.5 bg-slate-950 border border-blue-900/60 rounded-lg space-y-2.5 mt-4">
              <div className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Test Any Question &amp; Type Against Your Profile</span>
              </div>

              <input
                type="text"
                value={customQuestionText}
                onChange={(e) => setCustomQuestionText(e.target.value)}
                placeholder="Ask any question (e.g. What is your degree? / When can you start? / Why hire you?)"
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
              />

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={customQuestionType}
                  onChange={(e) =>
                    setCustomQuestionType(e.target.value as 'AUTO' | QuestionControlType)
                  }
                  className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"
                >
                  <option value="AUTO">Auto-Detect Question Type</option>
                  <option value="DROPDOWN">Dropdown Select</option>
                  <option value="DT_PICKER">DT Picker (Date)</option>
                  <option value="OPTION_SELECTION">Option Selection (Radio)</option>
                  <option value="NUMBER_INPUT">Number Input</option>
                  <option value="SHORT_TEXT">Short Text</option>
                  <option value="LONG_ESSAY">Long Essay</option>
                </select>

                <input
                  type="text"
                  value={customOptionsText}
                  onChange={(e) => setCustomOptionsText(e.target.value)}
                  placeholder="Options (e.g. B.Tech, M.Tech, MBA)"
                  className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"
                />
              </div>

              <button
                type="button"
                disabled={isAskingCustom || !customQuestionText.trim()}
                onClick={handleAskCustomQuestion}
                className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-semibold text-white rounded flex items-center justify-center gap-1.5 transition-colors"
              >
                {isAskingCustom ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Fetch Question Type &amp; Generate Answer from Profile</span>
              </button>

              {customQuestionResult && (
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-blue-400">
                      Detected Type: {customQuestionResult.question_type_label}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {customQuestionResult.profile_source}
                    </span>
                  </div>
                  <div className="font-mono text-emerald-300 text-xs break-words">
                    {customQuestionResult.answer}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'actions' && (
          <>
            {agentState === 'PAUSED_CAPTCHA' && (
              <div className="p-3 bg-amber-950/60 border border-amber-700 rounded-md text-xs text-amber-200 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Action Required: Please solve CAPTCHA</div>
                  <div className="text-[11px] text-amber-300 mt-0.5">
                    Execution paused per NFR Bot Detection Fallback. Click &quot;Verify I am
                    Human&quot; in the MockATS banner to resume.
                  </div>
                </div>
              </div>
            )}

            {actionPlan.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 space-y-2">
                <p>No action plan executed on this step yet.</p>
                <p className="text-[11px] text-slate-500">
                  Click &quot;AI Agent Fill Page {currentPage}&quot; or &quot;Run 4-Page
                  Autopilot&quot; to execute synthetic event injection.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {actionPlan.map((step) => (
                  <div
                    key={step.id}
                    className={`p-3 rounded-md border text-xs space-y-1.5 ${
                      step.action_type === 'HIGHLIGHT_FINAL_SUBMIT'
                        ? 'bg-emerald-950/50 border-emerald-700/80 text-emerald-100'
                        : step.status === 'completed'
                        ? 'bg-slate-950/80 border-slate-800 text-slate-200'
                        : 'bg-slate-950/40 border-slate-800/70 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-blue-400 font-semibold">
                        [{step.agent_id}] · {step.action_type}
                        {step.in_shadow_dom ? ' · #shadow-root' : ''}
                      </span>
                      {step.action_type === 'HIGHLIGHT_FINAL_SUBMIT' ? (
                        <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                    </div>
                    <div className="font-semibold text-white">{step.target_label}</div>
                    <div className="font-mono text-[11px] text-emerald-300 break-words bg-slate-900 px-2 py-1 rounded border border-slate-800">
                      Value: {step.value}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{step.reasoning}</p>
                    {step.sub_steps && step.sub_steps.length > 0 && (
                      <div className="pt-1.5 mt-1.5 border-t border-slate-800/80 space-y-1">
                        <div className="text-[10px] font-mono text-slate-400">
                          Observe-Act-Observe Sub-Steps:
                        </div>
                        <ul className="space-y-0.5 text-[11px] font-mono text-slate-300">
                          {step.sub_steps.map((sub, i) => (
                            <li key={i}>→ {sub}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'dom' && (
          <div className="space-y-2">
            <div className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>Live Distilled Elements (FR 2.2 JSON Schema)</span>
              <span className="font-mono tabular-nums">
                Raw ~{telemetry.rawEstimatedTokens} tok → {telemetry.distilledEstimatedTokens} tok
              </span>
            </div>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-md text-[11px] font-mono text-slate-200 overflow-x-auto leading-relaxed">
              {JSON.stringify(distilledElements, null, 2)}
            </pre>
          </div>
        )}

        {activeTab === 'mv3' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Code2 className="w-4 h-4 text-blue-400" />
                Manifest V3 v1.3 &amp; Question Type Classifier
              </span>
              <button
                type="button"
                onClick={copyMv3Code}
                className="px-2.5 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 flex items-center gap-1"
              >
                {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedCode ? 'Copied' : 'Copy Code'}
              </button>
            </div>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-md text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
              {MV3_MANIFEST_CODE}
            </pre>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-md text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
              {MV3_CONTENT_SCRIPT_CODE}
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
};
