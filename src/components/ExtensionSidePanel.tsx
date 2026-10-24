import React, { useState } from 'react';
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
} from 'lucide-react';
import {
  AgentState,
  AgentActionStep,
  DistilledElement,
  TokenTelemetry,
} from '../types/autoapply';

interface ExtensionSidePanelProps {
  agentState: AgentState;
  currentPage: number;
  distilledElements: DistilledElement[];
  actionPlan: AgentActionStep[];
  telemetry: TokenTelemetry;
  isExecuting: boolean;
  onDistillOnly: () => void;
  onRunCurrentPageAgent: () => Promise<void>;
  onRunFullAutopilot: () => Promise<void>;
}

const MV3_MANIFEST_CODE = `{
  "manifest_version": 3,
  "name": "AutoApply AI — Hybrid-Agentic ATS Engine",
  "version": "1.0.0",
  "permissions": ["storage", "sidePanel", "activeTab", "scripting", "notifications"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content-script.js"],
      "run_at": "document_idle"
    }
  ]
}`;

const MV3_CONTENT_SCRIPT_CODE = `// FR 2.3: React/Vue Synthetic Event Bypass
export function setNativeValue(element: HTMLElement, value: string) {
  const proto = element.tagName === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : element.tagName === 'SELECT'
    ? window.HTMLSelectElement.prototype
    : window.HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  valueSetter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
}

// FR 2.1: Recursive DOM + Open Shadow Root Distiller
export function traverseWithShadowDOM(root: Document | ShadowRoot | Element, acc: HTMLElement[] = []) {
  for (const el of Array.from(root.querySelectorAll('*')) as HTMLElement[]) {
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el.tagName) || el.getAttribute('role') === 'combobox') {
      acc.push(el);
    }
    if (el.shadowRoot) traverseWithShadowDOM(el.shadowRoot, acc);
  }
  return acc;
}`;

export const ExtensionSidePanel: React.FC<ExtensionSidePanelProps> = ({
  agentState,
  currentPage,
  distilledElements,
  actionPlan,
  telemetry,
  isExecuting,
  onDistillOnly,
  onRunCurrentPageAgent,
  onRunFullAutopilot,
}) => {
  const [activeTab, setActiveTab] = useState<'actions' | 'dom' | 'mv3'>('actions');
  const [copiedCode, setCopiedCode] = useState(false);

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
            AutoApply AI · Chrome SidePanel (MV3)
          </div>
          <div className="text-[11px] text-slate-400 font-mono truncate">
            background.js Master State · Page {currentPage}/4
          </div>
        </div>
        <span className="text-[11px] font-mono font-semibold text-blue-400 whitespace-nowrap shrink-0">
          {agentState}
        </span>
      </div>

      {/* State Machine Pipeline Bar (FR 4.1) */}
      <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800">
        <div className="text-[11px] text-slate-400 mb-1.5 flex items-center justify-between">
          <span>Service Worker State Machine</span>
          <span className="font-mono tabular-nums text-slate-300">
            Latency: {telemetry.latencyMs}ms
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
          {[
            { id: 'ANALYZING_DOM', label: '1. ANALYZE_DOM' },
            { id: 'EXECUTING_ACTIONS', label: '2. EXECUTE_LOOP' },
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
            <span>Auto-Fill Page {currentPage}</span>
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

        <button
          type="button"
          disabled={isExecuting}
          onClick={onDistillOnly}
          className="w-full px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors flex items-center justify-center gap-1.5"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Distill Live DOM Only (Tag data-autoapply-id)</span>
        </button>
      </div>

      {/* NFR Token Compression Metrics Strip */}
      <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] text-slate-400">Token Reduction</div>
          <div className="text-xs font-semibold font-mono tabular-nums text-emerald-400">
            -{telemetry.reductionPercentage}%
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">Distilled Budget</div>
          <div className="text-xs font-semibold font-mono tabular-nums text-slate-200">
            {telemetry.distilledEstimatedTokens} / 3,000 tok
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">Nodes (Shadow)</div>
          <div className="text-xs font-semibold font-mono tabular-nums text-blue-300">
            {telemetry.elementsExtracted} ({telemetry.shadowElementsExtracted} shadow)
          </div>
        </div>
      </div>

      {/* SidePanel Segmented View Switcher */}
      <div className="px-4 pt-3 bg-slate-900 border-b border-slate-800 flex items-center gap-1">
        {[
          { id: 'actions', label: `Action Plan (${actionPlan.length})` },
          { id: 'dom', label: `Distilled DOM (${distilledElements.length})` },
          { id: 'mv3', label: 'MV3 Extension Code' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as 'actions' | 'dom' | 'mv3')}
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
      <div className="p-4 flex-1 overflow-y-auto max-h-[540px] space-y-3">
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
                <p>No action plan generated for this step yet.</p>
                <p className="text-[11px] text-slate-500">
                  Click &quot;Auto-Fill Page {currentPage}&quot; or &quot;Run 4-Page Autopilot&quot;
                  to distill the live DOM and execute synthetic event injection.
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
                Manifest V3 & Content Script Core
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
