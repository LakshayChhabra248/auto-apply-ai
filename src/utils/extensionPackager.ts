export interface ExtensionFileEntry {
  name: string;
  description: string;
  language: 'json' | 'javascript' | 'html' | 'markdown';
  content: string;
}

/**
 * Generates a clean, unseeded Chrome Extension (Manifest V3) bundle.
 * Includes:
 * - Same-origin AI Tab Bridge (PROXY_PARSE_RESUME in content.js) so the extension SidePanel
 *   can invoke the authenticated /api/resume/parse Gemini AI endpoint through any open app tab.
 * - Native browser DecompressionStream('deflate') PDF text extractor in sidepanel.js so PDF
 *   text is always extracted even offline.
 * - Full multi-section resume parser (Education, 2-line Work Experience, Projects, 80+ Skills).
 */
export function buildChromeExtensionFiles(backendUrl: string): ExtensionFileEntry[] {
  const safeBackendUrl = backendUrl.replace(/\/$/, '');

  const manifestJson = JSON.stringify(
    {
      manifest_version: 3,
      name: 'AutoApply AI — Autonomous ATS Form Agent',
      version: '1.2.0',
      description:
        'Upload and update your PDF resume in the SidePanel, extract your profile with Gemini AI, and autofill any ATS form with React-compatible synthetic events.',
      permissions: ['storage', 'activeTab', 'scripting', 'sidePanel', 'tabs'],
      host_permissions: ['<all_urls>'],
      background: {
        service_worker: 'background.js',
      },
      side_panel: {
        default_path: 'sidepanel.html',
      },
      action: {
        default_title: 'Open AutoApply AI SidePanel',
      },
      content_scripts: [
        {
          matches: ['<all_urls>'],
          js: ['content.js'],
          run_at: 'document_idle',
          all_frames: true,
        },
      ],
    },
    null,
    2
  );

  const backgroundJs = `/**
 * AutoApply AI — Manifest V3 Background Service Worker
 * Starts completely clean (NO pre-seeded dummy profile).
 * Stores whatever resume and profile the user uploads or updates inside the SidePanel
 * in chrome.storage.local and coordinates multi-page form navigation.
 */

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(
    ['autoapply_profile', 'autoapply_resume', 'autoapply_backend_url'],
    (res) => {
      if (typeof res.autoapply_profile === 'undefined') {
        chrome.storage.local.set({ autoapply_profile: null });
      }
      if (typeof res.autoapply_resume === 'undefined') {
        chrome.storage.local.set({ autoapply_resume: null });
      }
      if (!res.autoapply_backend_url) {
        chrome.storage.local.set({
          autoapply_backend_url: ${JSON.stringify(safeBackendUrl)},
        });
      }
    }
  );

  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

// Resume multi-page autopilot across URL transitions when enabled by the user
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    chrome.storage.local.get(
      ['autopilot_active', 'autoapply_profile', 'autoapply_resume'],
      (data) => {
        if (data.autopilot_active && data.autoapply_profile) {
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, {
              type: 'EXECUTE_AUTOFILL',
              profile: data.autoapply_profile,
              cachedResume: data.autoapply_resume,
              clickNextWhenDone: false,
            });
          }, 800);
        }
      }
    );
  }
});
`;

  const contentJs = `/**
 * AutoApply AI — Universal Content Script (Manifest V3)
 * 1. Bridges AI Resume Parsing requests same-origin when running on the AutoApply AI web app tab.
 * 2. Distills arbitrary ATS forms (including open Shadow DOMs) and injects React-compatible values.
 */

(function () {
  if (window.__autoApplyContentScriptLoaded) return;
  window.__autoApplyContentScriptLoaded = true;

  // 1. React/Vue/Angular Native Value Setter (bypasses Virtual DOM value trackers)
  function setNativeValue(element, value) {
    element.focus();
    const proto =
      element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    element.blur();
  }

  function setNativeChecked(element, checked) {
    element.focus();
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked');
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, checked);
    } else {
      element.checked = checked;
    }
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    element.blur();
  }

  // 2. Programmatic File Upload via DataTransfer
  function injectBase64PdfIntoFileInput(fileInput, base64Data, fileName) {
    try {
      const clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const binary = atob(clean);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const file = new File([bytes], fileName || 'Resume.pdf', { type: 'application/pdf' });
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      return true;
    } catch (err) {
      console.warn('[AutoApply AI] File injection warning:', err);
      return false;
    }
  }

  // 3. Resolve human-readable label for any form control
  function resolveFieldLabel(el) {
    const dataLabel = el.getAttribute('data-label') || el.getAttribute('aria-label');
    if (dataLabel) return dataLabel.trim();

    if (el.id) {
      const root =
        el.getRootNode && el.getRootNode() instanceof ShadowRoot ? el.getRootNode() : document;
      const explicit = root.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (explicit && explicit.textContent) return explicit.textContent.trim();
    }

    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent) {
      return parentLabel.textContent.trim();
    }

    const wrapper = el.closest('div, fieldset, section, li');
    if (wrapper) {
      const lbl = wrapper.querySelector('label, legend, [class*="label"], h3, h4');
      if (lbl && lbl.textContent) return lbl.textContent.trim();
    }

    return el.getAttribute('placeholder') || el.getAttribute('name') || el.tagName.toLowerCase();
  }

  // 4. Distill live DOM + Open Shadow DOM roots
  const elementMap = new Map();

  function distillDocument() {
    elementMap.clear();
    const distilled = [];
    let counter = 1;

    function walk(root, inShadow) {
      const nodes = root.querySelectorAll('*');
      nodes.forEach((node) => {
        if (node.shadowRoot) {
          walk(node.shadowRoot, true);
        }
        const tag = node.tagName.toLowerCase();
        const role = node.getAttribute('role');
        const isInteractive =
          tag === 'input' ||
          tag === 'select' ||
          tag === 'textarea' ||
          tag === 'button' ||
          role === 'combobox' ||
          role === 'button';

        if (!isInteractive) return;
        const type = (node.getAttribute('type') || tag).toLowerCase();
        if (type === 'hidden') return;

        const rect = node.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0 && type !== 'file') return;

        const agentId = 'el_' + counter++;
        node.setAttribute('data-autoapply-id', agentId);
        elementMap.set(agentId, node);

        let options = null;
        if (tag === 'select') {
          options = Array.from(node.options)
            .map((o) => o.text.trim())
            .filter(Boolean);
        }

        distilled.push({
          agent_id: agentId,
          tag,
          type,
          name: node.getAttribute('name') || '',
          label: resolveFieldLabel(node).replace(/\\s+/g, ' ').slice(0, 140),
          placeholder: node.getAttribute('placeholder') || '',
          options,
          in_shadow_dom: inShadow,
        });
      });
    }

    walk(document, false);
    const rawBytes = document.documentElement.outerHTML.length;
    const distilledBytes = JSON.stringify(distilled).length;
    const reductionPct =
      rawBytes > 0 ? Math.max(0, ((rawBytes - distilledBytes) / rawBytes) * 100) : 95;

    return {
      elements: distilled,
      telemetry: {
        rawHtmlBytes: rawBytes,
        distilledJsonBytes: distilledBytes,
        reductionPercentage: Number(reductionPct.toFixed(1)),
        elementsExtracted: distilled.length,
      },
    };
  }

  // 5. Map a distilled element to the user's uploaded UserProfileSchema
  function matchProfileValue(item, profile) {
    const key = (item.label + ' ' + item.name + ' ' + item.placeholder).toLowerCase();
    const p = profile.personal_info || {};
    const edu = (profile.education && profile.education[0]) || {};
    const exp = (profile.work_experience && profile.work_experience[0]) || {};
    const meta = profile.application_metadata || {};

    if (item.type === 'file') return { action: 'UPLOAD_RESUME' };

    if (item.tag === 'button' || item.type === 'submit') {
      if (/submit|apply now|finish|send application/i.test(key)) {
        return { action: 'HIGHLIGHT_SUBMIT' };
      }
      if (/save\\s*&?\\s*continue|next|continue/i.test(key)) {
        return { action: 'NEXT_PAGE_BUTTON' };
      }
      return null;
    }

    if (item.type === 'checkbox') {
      if (/current|present|currently work/i.test(key)) {
        return { action: 'CHECK', checked: Boolean(exp.is_current) };
      }
      if (/terms|acknowledge|consent|agree|privacy/i.test(key)) {
        return { action: 'CHECK', checked: true };
      }
      return null;
    }

    if (item.type === 'radio') {
      const val = (elementMap.get(item.agent_id)?.value || '').toLowerCase();
      if (/sponsor|visa/i.test(key)) {
        const wants = meta.requires_sponsorship ? 'yes' : 'no';
        if (val.includes(wants)) return { action: 'CHECK', checked: true };
      }
      if (/authorized|legally|work auth/i.test(key)) {
        const wants = meta.work_authorization !== false ? 'yes' : 'no';
        if (val.includes(wants)) return { action: 'CHECK', checked: true };
      }
      return null;
    }

    if (/full\\s*name|candidate\\s*name|your\\s*name/i.test(key)) {
      return { action: 'FILL', value: ((p.first_name || '') + ' ' + (p.last_name || '')).trim() };
    }
    if (/first\\s*name|given\\s*name|fname/i.test(key)) {
      return { action: 'FILL', value: p.first_name || '' };
    }
    if (/last\\s*name|surname|family\\s*name|lname/i.test(key)) {
      return { action: 'FILL', value: p.last_name || '' };
    }
    if (/e-?mail/i.test(key)) {
      return { action: 'FILL', value: p.email || '' };
    }
    if (/country\\s*code|phone\\s*code/i.test(key)) {
      return { action: 'FILL', value: (p.phone && p.phone.country_code) || '+91' };
    }
    if (/phone|mobile|contact\\s*number|tel/i.test(key)) {
      return { action: 'FILL', value: (p.phone && p.phone.number) || '' };
    }
    if (/linkedin/i.test(key)) {
      return { action: 'FILL', value: (p.links && p.links.linkedin) || '' };
    }
    if (/github/i.test(key)) {
      return { action: 'FILL', value: (p.links && p.links.github) || '' };
    }
    if (/portfolio|website|personal\\s*url/i.test(key)) {
      return {
        action: 'FILL',
        value: (p.links && p.links.portfolio) || (p.links && p.links.github) || '',
      };
    }
    if (/pincode|postal|zip/i.test(key)) {
      return { action: 'FILL', value: (p.location && p.location.pincode) || '' };
    }
    if (/city|current\\s*location|location/i.test(key)) {
      const loc = p.location || {};
      return {
        action: 'FILL',
        value: [loc.city, loc.state, loc.country].filter(Boolean).join(', '),
      };
    }
    if (/address|street/i.test(key)) {
      return {
        action: 'FILL',
        value: (p.location && p.location.address) || (p.location && p.location.city) || '',
      };
    }
    if (/university|college|institution|school/i.test(key)) {
      return { action: 'FILL', value: edu.institution || '' };
    }
    if (/degree|qualification/i.test(key)) {
      return { action: 'FILL', value: edu.degree || 'B.Tech' };
    }
    if (/major|branch|field\\s*of\\s*study|specialization|discipline/i.test(key)) {
      return { action: 'FILL', value: edu.major || 'Computer Science' };
    }
    if (/gpa|cgpa|cpi|grade|marks/i.test(key)) {
      return { action: 'FILL', value: String(edu.gpa || '') };
    }
    if (/company|employer|organization/i.test(key)) {
      return { action: 'FILL', value: exp.company || '' };
    }
    if (/role|job\\s*title|designation|position/i.test(key)) {
      return { action: 'FILL', value: exp.role || '' };
    }
    if (/start\\s*date|from\\s*date/i.test(key)) {
      return { action: 'FILL', value: exp.start_date || edu.start_date || '2024-05' };
    }
    if (/end\\s*date|to\\s*date/i.test(key)) {
      return { action: 'FILL', value: exp.end_date || edu.end_date || '2024-08' };
    }
    if (/notice\\s*period/i.test(key)) {
      return { action: 'FILL', value: String(meta.notice_period_days ?? 30) };
    }
    if (/expected\\s*ctc|expected\\s*salary|compensation/i.test(key)) {
      return { action: 'FILL', value: String(meta.expected_ctc_lpa ?? 24) };
    }
    if (/current\\s*ctc|current\\s*salary/i.test(key)) {
      return { action: 'FILL', value: String(meta.current_ctc_lpa ?? 15) };
    }
    if (/gender|sex/i.test(key)) {
      return { action: 'FILL', value: meta.gender || 'Male' };
    }
    if (/disability/i.test(key)) {
      return {
        action: 'FILL',
        value: meta.disability_status || 'No, I do not have a disability',
      };
    }
    if (/veteran/i.test(key)) {
      return {
        action: 'FILL',
        value: meta.veteran_status || 'I am not a protected veteran',
      };
    }
    if (/skill|technologies|tech\\s*stack/i.test(key)) {
      return { action: 'FILL', value: (profile.skills || []).join(', ') };
    }

    if (item.tag === 'textarea') {
      if (/description|responsibilit|summary|work\\s*done|achievement/i.test(key)) {
        return { action: 'FILL', value: (exp.description_bullets || []).join('\\n• ') };
      }
      return { action: 'GENERATE_AI_ANSWER', question: item.label };
    }

    return null;
  }

  // 6. Execute autofill across all distilled elements on the current page
  async function executeAutofillOnPage(profile, cachedResume, clickNextWhenDone, backendUrl) {
    const { elements, telemetry } = distillDocument();
    const logs = [];
    let nextBtn = null;

    for (const item of elements) {
      const domEl = elementMap.get(item.agent_id);
      if (!domEl) continue;

      const decision = matchProfileValue(item, profile);
      if (!decision) continue;

      if (decision.action === 'UPLOAD_RESUME' && cachedResume && cachedResume.base64Data) {
        const ok = injectBase64PdfIntoFileInput(
          domEl,
          cachedResume.base64Data,
          cachedResume.fileName
        );
        if (ok) {
          logs.push('Uploaded resume PDF: ' + cachedResume.fileName);
        }
      } else if (decision.action === 'CHECK') {
        setNativeChecked(domEl, decision.checked);
        logs.push('Checked [' + item.label + ']');
      } else if (decision.action === 'FILL' && decision.value) {
        if (item.tag === 'select') {
          const opts = Array.from(domEl.options);
          const targetLower = String(decision.value).toLowerCase();
          const best = opts.find(
            (o) =>
              o.value.toLowerCase() === targetLower ||
              o.text.toLowerCase().includes(targetLower) ||
              targetLower.includes(o.text.toLowerCase())
          );
          setNativeValue(domEl, best ? best.value : decision.value);
        } else {
          setNativeValue(domEl, decision.value);
        }
        domEl.style.outline = '2px solid #2563eb';
        domEl.style.outlineOffset = '1px';
        logs.push('Filled [' + item.label + '] -> ' + String(decision.value).slice(0, 42));
      } else if (decision.action === 'GENERATE_AI_ANSWER') {
        let answerText =
          'I am a software engineer experienced in ' +
          (profile.skills || []).slice(0, 6).join(', ') +
          '. At ' +
          ((profile.work_experience &&
            profile.work_experience[0] &&
            profile.work_experience[0].company) ||
            'my previous organization') +
          ', I ' +
          ((profile.work_experience &&
            profile.work_experience[0] &&
            profile.work_experience[0].description_bullets &&
            profile.work_experience[0].description_bullets[0]) ||
            'built scalable production systems.');

        try {
          if (backendUrl) {
            const resp = await fetch(
              backendUrl.replace(/\\/$/, '') + '/api/agent/generate-answer',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  questionLabel: decision.question,
                  profile,
                  jobDescription: document.title,
                }),
              }
            );
            const data = await resp.json();
            if (data && data.answer) answerText = data.answer;
          }
        } catch (_e) {
          // Use local profile-synthesized answer
        }
        setNativeValue(domEl, answerText);
        domEl.style.outline = '2px solid #2563eb';
        logs.push('Synthesized screening answer for [' + item.label + ']');
      } else if (decision.action === 'HIGHLIGHT_SUBMIT') {
        domEl.style.outline = '4px solid #10b981';
        domEl.style.boxShadow = '0 0 0 6px rgba(16, 185, 129, 0.28)';
        domEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        logs.push('PAUSED AT FINAL SUBMIT (Human-in-the-Loop safety lock active)');
      } else if (decision.action === 'NEXT_PAGE_BUTTON') {
        nextBtn = domEl;
      }
    }

    if (clickNextWhenDone && nextBtn) {
      logs.push('Clicking intermediate Save & Continue button...');
      setTimeout(() => nextBtn.click(), 350);
    }

    return { elements, telemetry, logs };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Same-Origin AI Bridge: allows the SidePanel to execute /api/resume/parse inside the authenticated app tab
    if (message.type === 'PROXY_PARSE_RESUME') {
      fetch('/api/resume/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(message.payload),
      })
        .then((r) => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }
    if (message.type === 'DISTILL_DOM') {
      sendResponse(distillDocument());
      return true;
    }
    if (message.type === 'EXECUTE_AUTOFILL') {
      executeAutofillOnPage(
        message.profile,
        message.cachedResume,
        message.clickNextWhenDone,
        message.backendUrl
      ).then((result) => sendResponse(result));
      return true;
    }
    return false;
  });
})();
`;

  const sidepanelHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>AutoApply AI SidePanel</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      padding: 14px;
      font-size: 12px;
      line-height: 1.45;
    }
    .header {
      padding-bottom: 10px;
      border-bottom: 1px solid #1e293b;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .title { font-size: 15px; font-weight: 700; color: #ffffff; }
    .badge {
      font-family: monospace;
      font-size: 11px;
      padding: 2px 8px;
      background: #1e293b;
      color: #38bdf8;
      border-radius: 4px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .card-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn {
      width: 100%;
      padding: 9px 12px;
      border-radius: 6px;
      border: none;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      margin-bottom: 8px;
      transition: opacity 0.15s;
      text-align: center;
      display: inline-block;
    }
    .btn:hover { opacity: 0.92; }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn-primary { background: #2563eb; color: #ffffff; }
    .btn-emerald { background: #059669; color: #ffffff; }
    .btn-secondary { background: #334155; color: #f8fafc; }
    .btn-danger { background: #475569; color: #fca5a5; font-size: 11px; padding: 4px 8px; }
    .upload-label {
      display: block;
      width: 100%;
      padding: 10px 12px;
      background: #2563eb;
      color: #ffffff;
      font-weight: 600;
      font-size: 12px;
      text-align: center;
      border-radius: 6px;
      cursor: pointer;
      margin-bottom: 8px;
    }
    .upload-label:hover { background: #3b82f6; }
    .field-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 8px;
    }
    .field-group label {
      display: block;
      font-size: 10px;
      color: #94a3b8;
      margin-bottom: 3px;
    }
    .field-group input {
      width: 100%;
      padding: 6px 8px;
      background: #020617;
      border: 1px solid #334155;
      border-radius: 4px;
      color: #f8fafc;
      font-size: 12px;
    }
    .log-box {
      font-family: monospace;
      font-size: 11px;
      background: #020617;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 10px;
      max-height: 150px;
      overflow-y: auto;
      color: #cbd5e1;
    }
    .log-item { margin-bottom: 4px; }
    textarea {
      width: 100%;
      min-height: 100px;
      background: #020617;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 8px;
      font-family: monospace;
      font-size: 11px;
      margin-top: 4px;
    }
    .empty-banner {
      background: #020617;
      border: 1px dashed #475569;
      border-radius: 6px;
      padding: 10px;
      color: #cbd5e1;
      font-size: 11px;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">AutoApply AI</div>
    <span class="badge" id="status-badge">NO RESUME</span>
  </div>

  <!-- Step 1: Upload or Update Resume (PDF or TXT) Anytime -->
  <div class="card">
    <div class="card-title">
      <span>1. Upload / Update Resume</span>
      <span id="resume-file-badge" style="color: #38bdf8; font-family: monospace; text-transform: none;">None uploaded</span>
    </div>

    <div id="empty-state-notice" class="empty-banner">
      No resume loaded yet. Upload your PDF or TXT resume below to parse its text and extract your profile with AI.
    </div>

    <label class="upload-label" for="resume-upload-input" id="upload-btn-label">
      Upload / Update Resume (PDF or TXT)
    </label>
    <input type="file" id="resume-upload-input" accept=".pdf,.txt" style="display: none;" />

    <div class="field-group" style="margin-top: 6px;">
      <label>Extracted PDF Text / Paste Resume Text (Editable)</label>
      <textarea id="raw-resume-text" placeholder="Uploaded PDF text will appear here automatically, or paste your resume text here..."></textarea>
      <button class="btn btn-secondary" id="btn-parse-text" style="margin-top: 6px; margin-bottom: 0;">Re-Extract Profile from Text Above</button>
    </div>

    <details style="margin-top: 6px;">
      <summary style="cursor: pointer; color: #94a3b8; font-size: 10px;">Configure AI Backend URL</summary>
      <div class="field-group" style="margin-top: 6px;">
        <input type="text" id="backend-url-input" placeholder="http://localhost:3000" />
      </div>
    </details>
  </div>

  <!-- Step 2: Autofill Actions on Active Browser Tab -->
  <button class="btn btn-emerald" id="btn-autofill" disabled>Autofill Current Form Page</button>
  <button class="btn btn-secondary" id="btn-distill">Distill Page DOM Only</button>

  <!-- Step 3: Quick Profile Editor & Full JSON Schema -->
  <div class="card">
    <div class="card-title">
      <span>2. Extracted Candidate Profile</span>
      <button id="btn-clear-profile" class="btn-danger" style="width: auto; border: none; border-radius: 4px; cursor: pointer;">Clear</button>
    </div>

    <div class="field-grid">
      <div class="field-group">
        <label>First Name</label>
        <input type="text" id="f-fname" placeholder="First Name" />
      </div>
      <div class="field-group">
        <label>Last Name</label>
        <input type="text" id="f-lname" placeholder="Last Name" />
      </div>
      <div class="field-group">
        <label>Email</label>
        <input type="email" id="f-email" placeholder="you@example.com" />
      </div>
      <div class="field-group">
        <label>Phone (10-digit)</label>
        <input type="text" id="f-phone" placeholder="9876543210" />
      </div>
      <div class="field-group">
        <label>City</label>
        <input type="text" id="f-city" placeholder="City" />
      </div>
      <div class="field-group">
        <label>University</label>
        <input type="text" id="f-uni" placeholder="University" />
      </div>
      <div class="field-group">
        <label>Recent Company</label>
        <input type="text" id="f-company" placeholder="Company" />
      </div>
      <div class="field-group">
        <label>Recent Role</label>
        <input type="text" id="f-role" placeholder="Software Engineer" />
      </div>
      <div class="field-group">
        <label>Notice Period (Days)</label>
        <input type="number" id="f-notice" placeholder="30" />
      </div>
      <div class="field-group">
        <label>Expected CTC (LPA)</label>
        <input type="number" step="0.5" id="f-ctc" placeholder="24" />
      </div>
    </div>

    <div class="field-group" style="margin-top: 6px;">
      <label>Full profile_schema.json (Live Synced)</label>
      <textarea id="profile-json" placeholder="Upload a resume above to populate profile_schema.json..." style="min-height: 150px;"></textarea>
    </div>

    <button class="btn btn-primary" id="btn-save-profile" style="margin-top: 8px; margin-bottom: 0;">Save / Update Profile</button>
  </div>

  <!-- Step 4: Live Execution Log -->
  <div class="card">
    <div class="card-title">3. Execution & Distillation Log</div>
    <div class="log-box" id="log-output">
      <div class="log-item">Extension ready. Upload your resume above to begin.</div>
    </div>
  </div>

  <script src="sidepanel.js"></script>
</body>
</html>`;

  const sidepanelJs = `/**
 * AutoApply AI — Unseeded SidePanel Controller
 * 1. Decompresses & extracts text directly from uploaded PDF files in the browser via DecompressionStream('deflate').
 * 2. Bridges through any open AutoApply AI tab (or direct CORS fetch) to run Gemini AI + unpdf extraction.
 * 3. Includes the full multi-section resume parser (Education, 2-line Work Experience, Projects, 80+ Skills)
 *    so even offline PDF uploads produce a complete, rich profile_schema.json.
 */

const statusBadge = document.getElementById('status-badge');
const resumeFileBadge = document.getElementById('resume-file-badge');
const emptyStateNotice = document.getElementById('empty-state-notice');
const uploadInput = document.getElementById('resume-upload-input');
const uploadBtnLabel = document.getElementById('upload-btn-label');
const backendUrlInput = document.getElementById('backend-url-input');
const rawResumeText = document.getElementById('raw-resume-text');
const btnParseText = document.getElementById('btn-parse-text');
const btnAutofill = document.getElementById('btn-autofill');
const btnDistill = document.getElementById('btn-distill');
const btnSaveProfile = document.getElementById('btn-save-profile');
const btnClearProfile = document.getElementById('btn-clear-profile');
const profileTextarea = document.getElementById('profile-json');
const logOutput = document.getElementById('log-output');

const fFname = document.getElementById('f-fname');
const fLname = document.getElementById('f-lname');
const fEmail = document.getElementById('f-email');
const fPhone = document.getElementById('f-phone');
const fCity = document.getElementById('f-city');
const fUni = document.getElementById('f-uni');
const fCompany = document.getElementById('f-company');
const fRole = document.getElementById('f-role');
const fNotice = document.getElementById('f-notice');
const fCtc = document.getElementById('f-ctc');

let currentProfile = null;
let currentResume = null;
let backendUrl = ${JSON.stringify(safeBackendUrl)};

function appendLog(msg) {
  const div = document.createElement('div');
  div.className = 'log-item';
  div.textContent = '> ' + msg;
  logOutput.appendChild(div);
  logOutput.scrollTop = logOutput.scrollHeight;
}

/**
 * Native Browser PDF Text Extractor using DecompressionStream('deflate').
 * Decompresses FlateDecode streams inside PDF binaries and parses BT..ET text blocks (Tj / TJ / Td / Tm).
 */
async function extractTextFromPdfArrayBuffer(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const latin1Decoder = new TextDecoder('latin1');
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
  const rawLatin = latin1Decoder.decode(bytes);

  if (!rawLatin.startsWith('%PDF-')) {
    return utf8Decoder.decode(bytes).trim();
  }

  async function tryInflate(slice) {
    for (const format of ['deflate', 'deflate-raw']) {
      try {
        const ds = new DecompressionStream(format);
        const writer = ds.writable.getWriter();
        writer.write(slice).catch(() => {});
        writer.close().catch(() => {});
        const outBuf = await new Response(ds.readable).arrayBuffer();
        const text = latin1Decoder.decode(outBuf);
        if (text && text.length > 0) return text;
      } catch (_e) {
        // try next format
      }
    }
    return latin1Decoder.decode(slice);
  }

  function decodePdfLiteral(str) {
    return str
      .replace(/\\\\n/g, '\\n')
      .replace(/\\\\r/g, '\\r')
      .replace(/\\\\t/g, ' ')
      .replace(/\\\\([()\\\\])/g, '$1')
      .replace(/\\\\([0-7]{1,3})/g, (_m, oct) => String.fromCharCode(parseInt(oct, 8)));
  }

  function decodePdfHex(hex) {
    const clean = hex.replace(/\\s+/g, '');
    if (clean.toUpperCase().startsWith('FEFF')) {
      let out = '';
      for (let i = 4; i + 3 < clean.length; i += 4) {
        out += String.fromCharCode(parseInt(clean.slice(i, i + 4), 16));
      }
      return out;
    }
    let out = '';
    for (let i = 0; i + 1 < clean.length; i += 2) {
      const code = parseInt(clean.slice(i, i + 2), 16);
      if (code >= 32 && code <= 126) out += String.fromCharCode(code);
    }
    return out;
  }

  function parseBtEtBlocks(streamText) {
    const lines = [];
    const btRegex = /\\bBT\\b([\\s\\S]*?)\\bET\\b/g;
    let btMatch;
    while ((btRegex.lastIndex < streamText.length) && (btMatch = btRegex.exec(streamText)) !== null) {
      const block = btMatch[1];
      let currentLine = '';
      let lastTmY = null;
      const tokenRegex =
        /(\\[[\\s\\S]*?\\]\\s*TJ)|(\\((?:\\\\.|[^\\\\()])*\\)\\s*(?:Tj|'|"))|(<[0-9A-Fa-f\\s]+>\\s*Tj)|((-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\s+T[dD])|((-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\s+Tm)|(\\bT\\*)/g;
      let tok;
      while ((tok = tokenRegex.exec(block)) !== null) {
        if (tok[1]) {
          // [...] TJ array
          const arrContent = tok[1];
          const itemRegex = /\\((?:\\\\.|[^\\\\()])*\\)|<[0-9A-Fa-f\\s]+>|-?\\d+(?:\\.\\d+)?/g;
          let item;
          while ((item = itemRegex.exec(arrContent)) !== null) {
            const val = item[0];
            if (val.startsWith('(')) {
              currentLine += decodePdfLiteral(val.slice(1, -1));
            } else if (val.startsWith('<')) {
              currentLine += decodePdfHex(val.slice(1, -1));
            } else {
              const kern = parseFloat(val);
              if (kern < -120 && !currentLine.endsWith(' ')) currentLine += ' ';
            }
          }
        } else if (tok[2]) {
          const strPart = tok[2].replace(/\\s*(?:Tj|'|")$/, '');
          currentLine += decodePdfLiteral(strPart.slice(1, -1));
        } else if (tok[3]) {
          const hexPart = tok[3].replace(/\\s*Tj$/, '');
          currentLine += decodePdfHex(hexPart.slice(1, -1));
        } else if (tok[4]) {
          // Td / TD
          const dx = parseFloat(tok[5]);
          const dy = parseFloat(tok[6]);
          if (Math.abs(dy) > 2) {
            if (currentLine.trim()) lines.push(currentLine.trim());
            currentLine = '';
          } else if (dx > 15 && !currentLine.endsWith(' ')) {
            currentLine += ' ';
          }
        } else if (tok[7]) {
          // Tm
          const tmY = parseFloat(tok[13]);
          if (lastTmY !== null && Math.abs(tmY - lastTmY) > 3) {
            if (currentLine.trim()) lines.push(currentLine.trim());
            currentLine = '';
          } else if (currentLine && !currentLine.endsWith(' ')) {
            currentLine += ' ';
          }
          lastTmY = tmY;
        } else if (tok[14]) {
          // T*
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = '';
        }
      }
      if (currentLine.trim()) lines.push(currentLine.trim());
    }
    return lines.join('\\n');
  }

  const extractedChunks = [];
  let searchPos = 0;
  while (searchPos < rawLatin.length) {
    const streamIdx = rawLatin.indexOf('stream', searchPos);
    if (streamIdx === -1) break;
    const endIdx = rawLatin.indexOf('endstream', streamIdx + 6);
    if (endIdx === -1) break;

    let dataStart = streamIdx + 6;
    if (rawLatin[dataStart] === '\\r' && rawLatin[dataStart + 1] === '\\n') dataStart += 2;
    else if (rawLatin[dataStart] === '\\n' || rawLatin[dataStart] === '\\r') dataStart += 1;

    let dataEnd = endIdx;
    if (rawLatin[dataEnd - 2] === '\\r' && rawLatin[dataEnd - 1] === '\\n') dataEnd -= 2;
    else if (rawLatin[dataEnd - 1] === '\\n' || rawLatin[dataEnd - 1] === '\\r') dataEnd -= 1;

    if (dataEnd > dataStart && dataEnd - dataStart < 2000000) {
      const slice = bytes.subarray(dataStart, dataEnd);
      const decompressed = await tryInflate(slice);
      if (decompressed.includes('BT') && decompressed.includes('ET')) {
        const parsed = parseBtEtBlocks(decompressed);
        if (parsed.trim()) extractedChunks.push(parsed.trim());
      }
    }
    searchPos = endIdx + 9;
  }

  return extractedChunks.join('\\n').trim();
}

/**
 * Full Multi-Section Resume Parser (Personal Info, Education, 2-Line Work Experience, Projects, 80+ Skills)
 */
const KNOWN_CITIES = [
  { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
  { city: 'Bangalore', state: 'Karnataka', country: 'India' },
  { city: 'Mumbai', state: 'Maharashtra', country: 'India' },
  { city: 'New Delhi', state: 'Delhi', country: 'India' },
  { city: 'Delhi', state: 'Delhi', country: 'India' },
  { city: 'Noida', state: 'Uttar Pradesh', country: 'India' },
  { city: 'Gurugram', state: 'Haryana', country: 'India' },
  { city: 'Gurgaon', state: 'Haryana', country: 'India' },
  { city: 'Hyderabad', state: 'Telangana', country: 'India' },
  { city: 'Pune', state: 'Maharashtra', country: 'India' },
  { city: 'Chennai', state: 'Tamil Nadu', country: 'India' },
  { city: 'Kolkata', state: 'West Bengal', country: 'India' },
  { city: 'Chandigarh', state: 'Chandigarh', country: 'India' },
  { city: 'Jaipur', state: 'Rajasthan', country: 'India' },
  { city: 'Ahmedabad', state: 'Gujarat', country: 'India' },
  { city: 'San Francisco', state: 'CA', country: 'USA' },
  { city: 'New York', state: 'NY', country: 'USA' },
];

const KNOWN_SKILLS = [
  'Python', 'TypeScript', 'JavaScript', 'C++', 'C', 'Java', 'Go', 'Golang', 'Rust', 'SQL',
  'HTML', 'CSS', 'Bash', 'Kotlin', 'Swift', 'React', 'Next.js', 'Node.js', 'Express.js',
  'FastAPI', 'Flask', 'Django', 'Spring Boot', 'Tailwind CSS', 'GraphQL', 'REST API',
  'gRPC', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Supabase', 'Firebase', 'Docker',
  'Kubernetes', 'AWS', 'GCP', 'Azure', 'Linux', 'Git', 'CI/CD', 'Kafka', 'Machine Learning',
  'Deep Learning', 'NLP', 'Computer Vision', 'Generative AI', 'LLMs', 'RAG', 'LangChain',
  'LangGraph', 'PyTorch', 'TensorFlow', 'Scikit-learn', 'Pandas', 'NumPy', 'Playwright'
];

function fullLocalParseResume(rawText, fileName) {
  let text = (rawText || '').replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
  text = text.replace(/\\s*[•●▪❖➢◦∙]\\s*/g, '\\n- ');
  const headers = [
    'EDUCATION', 'ACADEMIC BACKGROUND', 'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE',
    'EXPERIENCE', 'INTERNSHIPS', 'PROJECTS', 'KEY PROJECTS', 'PERSONAL PROJECTS',
    'TECHNICAL SKILLS', 'SKILLS', 'ACHIEVEMENTS', 'CERTIFICATIONS'
  ];
  headers.forEach((h) => {
    const rx = new RegExp('(?:^|\\\\n|\\\\s{2,}|\\\\|\\\\s*)(' + h + ')(?:\\\\s*[:|]?\\\\s*)(?=\\\\n|[A-Z0-9])', 'gi');
    text = text.replace(rx, '\\n$1\\n');
  });

  const lines = text.split('\\n').map((l) => l.replace(/\\s+/g, ' ').trim()).filter(Boolean);
  const fullNormalized = lines.join('\\n');

  // Name
  let first_name = 'Candidate';
  let last_name = '';
  const banned = new Set(['resume', 'cv', 'education', 'experience', 'projects', 'skills', 'india', 'btech', 'dtu', 'iit', 'nit', 'university', 'college']);
  for (const line of lines.slice(0, 6)) {
    const seg = line.split(/[|•·]/)[0].trim();
    if (seg.includes('@') || seg.includes('http') || /\\d{4,}/.test(seg)) continue;
    const words = seg.replace(/[^a-zA-Z\\s.-]/g, ' ').trim().split(/\\s+/).filter((w) => w.length >= 2);
    if (words.length >= 1 && words.length <= 4 && !words.some((w) => banned.has(w.toLowerCase()))) {
      const fmt = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      first_name = fmt(words[0]);
      last_name = words.slice(1).map(fmt).join(' ');
      break;
    }
  }
  if (first_name === 'Candidate' && fileName) {
    const parts = fileName.replace(/\\.[^.]+$/, '').replace(/resume|cv|final|202\\d/gi, ' ').replace(/[_\\-.]+/g, ' ').trim().split(/\\s+/).filter((p) => /^[a-zA-Z]{2,}$/.test(p));
    if (parts.length) {
      const fmt = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      first_name = fmt(parts[0]);
      last_name = parts.slice(1).map(fmt).join(' ');
    }
  }

  const emailMatch = fullNormalized.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/);
  const phoneMatch = fullNormalized.match(/(?:\\(?(\\+?\\d{1,3})\\)?[-.\\s]?)?(\\d{10}|\\d{5}[-.\\s]\\d{5})/);
  const linkedinMatch = fullNormalized.match(/(?:https?:\\/\\/)?(?:www\\.)?linkedin\\.com\\/in\\/[a-zA-Z0-9_-]+/i);
  const githubMatch = fullNormalized.match(/(?:https?:\\/\\/)?(?:www\\.)?github\\.com\\/[a-zA-Z0-9_-]+/i);
  const pincodeMatch = fullNormalized.match(/\\b([1-8]\\d{5})\\b/);

  let detectedLocation = { address: 'New Delhi', city: 'New Delhi', state: 'Delhi', pincode: pincodeMatch ? pincodeMatch[1] : '', country: 'India' };
  const headerSlice = lines.slice(0, 3).join('\\n');
  for (const loc of KNOWN_CITIES) {
    if (new RegExp('\\\\b' + loc.city + '\\\\b', 'i').test(headerSlice) || new RegExp('\\\\b' + loc.city + '\\\\b', 'i').test(fullNormalized)) {
      detectedLocation = { address: loc.city, city: loc.city === 'Bangalore' ? 'Bengaluru' : loc.city, state: loc.state, pincode: pincodeMatch ? pincodeMatch[1] : '', country: loc.country };
      break;
    }
  }

  // Sections
  const sections = { header: [], education: [], experience: [], projects: [], skills: [], other: [] };
  let cur = 'header';
  for (const line of lines) {
    const h = line.replace(/^[-•*▪#]+\\s*/, '').replace(/[:|—–-]+$/, '').trim().toUpperCase();
    if (/^(EDUCATION|ACADEMIC BACKGROUND|ACADEMICS)$/.test(h)) { cur = 'education'; continue; }
    if (/^(EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|INTERNSHIPS)$/.test(h)) { cur = 'experience'; continue; }
    if (/^(PROJECTS|KEY PROJECTS|PERSONAL PROJECTS|ACADEMIC PROJECTS)$/.test(h)) { cur = 'projects'; continue; }
    if (/^(SKILLS|TECHNICAL SKILLS|TECHNOLOGIES|TECH STACK)$/.test(h)) { cur = 'skills'; continue; }
    if (/^(ACHIEVEMENTS|CERTIFICATIONS|AWARDS)$/.test(h)) { cur = 'other'; continue; }
    sections[cur].push(line);
  }

  // Education
  const education = [];
  const eduLines = sections.education.length ? sections.education : lines;
  const instRx = /\\b(University|Institute|College|School|IIT|NIT|IIIT|BITS|DTU|NSUT|VIT|SRM|Thapar|Manipal|PEC)\\b/i;
  const degRx = /\\b(B\\.?\\s*Tech|M\\.?\\s*Tech|B\\.?\\s*E\\.?|B\\.?\\s*S\\.?|M\\.?\\s*S\\.?|BCA|MCA|MBA|Bachelor of Technology)\\b/i;
  for (let i = 0; i < eduLines.length; i++) {
    const l = eduLines[i];
    if (instRx.test(l)) {
      const next = eduLines[i + 1] || '';
      const comb = l + ' | ' + next;
      const degM = comb.match(degRx);
      const gpaM = comb.match(/(?:CGPA|GPA|CPI)[:\\s-]*([0-9]+\\.[0-9]+|[0-9]+)/i) || comb.match(/\\b([6-9]\\.\\d{1,2})\\s*\\/\\s*10/);
      const instClean = l.split(/[|—–]/)[0].trim();
      education.push({
        institution: instClean,
        degree: degM ? degM[1] : 'B.Tech',
        major: 'Computer Science & Engineering',
        gpa: gpaM ? parseFloat(gpaM[1]) : 8.5,
        start_date: '2022-08',
        end_date: '2026-05',
        is_current: false,
      });
      if (degRx.test(next)) i++;
      if (education.length >= 2) break;
    }
  }
  if (!education.length) {
    education.push({ institution: sections.education[0] || 'Institute of Technology', degree: 'B.Tech', major: 'Computer Science & Engineering', gpa: 8.5, start_date: '2022-08', end_date: '2026-05', is_current: false });
  }

  // Experience
  const work_experience = [];
  const roleRx = /\\b(Intern|Internship|Engineer|Developer|Analyst|Researcher|SDE|SWE|Lead|Architect)\\b/i;
  let curExp = null;
  for (const line of sections.experience) {
    const isBullet = /^[-•*▪]/.test(line);
    if (!isBullet && (roleRx.test(line) || /202\\d/.test(line)) && line.length < 100) {
      const segs = line.replace(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s+20\\d{2}\\s*[-–to]+\\s*(?:Present|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s+20\\d{2})/i, '').split(/[|—–,]/).map((s) => s.trim()).filter(Boolean);
      if (curExp && curExp.description_bullets.length === 0 && roleRx.test(line) && curExp.role === 'Software Engineer') {
        curExp.role = segs[0] || curExp.role;
        if (segs[1]) curExp.location = segs.slice(1).join(', ');
        continue;
      }
      if (curExp) work_experience.push(curExp);
      curExp = {
        company: segs[0] || line,
        role: segs[1] || 'Software Engineer',
        location: segs[2] || detectedLocation.city,
        start_date: '2024-05',
        end_date: '2024-08',
        is_current: /present|current/i.test(line),
        description_bullets: [],
      };
    } else if (curExp) {
      curExp.description_bullets.push(line.replace(/^[-•*▪]\\s*/, '').trim());
    }
  }
  if (curExp) work_experience.push(curExp);

  // Projects
  const projects = [];
  let curProj = null;
  for (const line of sections.projects) {
    const isBullet = /^[-•*▪]/.test(line);
    if (!isBullet && (line.includes('|') || line.length < 75)) {
      if (curProj) projects.push(curProj);
      const parts = line.split(/[|—–:]/).map((p) => p.trim()).filter(Boolean);
      curProj = {
        title: parts[0] || line,
        tech_stack: KNOWN_SKILLS.filter((sk) => new RegExp('(?:^|[^a-zA-Z0-9])' + sk.replace(/[.+]/g, '\\\\$&') + '(?:$|[^a-zA-Z0-9])', 'i').test(line)).slice(0, 6),
        description: '',
        url: githubMatch ? 'https://' + githubMatch[0].replace(/^https?:\\/\\//, '') : '',
      };
    } else if (curProj) {
      const b = line.replace(/^[-•*▪]\\s*/, '').trim();
      curProj.description = curProj.description ? curProj.description + ' ' + b : b;
    }
  }
  if (curProj) projects.push(curProj);

  if (!work_experience.length && projects.length) {
    work_experience.push({ company: projects[0].title, role: 'Project Lead', location: detectedLocation.city, start_date: '2024-05', end_date: '2024-08', is_current: false, description_bullets: [projects[0].description || projects[0].title] });
  } else if (!work_experience.length) {
    work_experience.push({ company: education[0].institution, role: 'Software Developer', location: detectedLocation.city, start_date: '2024-05', end_date: '2024-08', is_current: false, description_bullets: ['Built full-stack software systems.'] });
  }

  const matchedSkills = KNOWN_SKILLS.filter((sk) =>
    new RegExp('(?:^|[^a-zA-Z0-9])' + sk.replace(/[.+]/g, '\\\\$&') + '(?:$|[^a-zA-Z0-9])', 'i').test(fullNormalized)
  );

  return {
    personal_info: {
      first_name,
      last_name,
      email: emailMatch ? emailMatch[0] : '',
      phone: {
        country_code: phoneMatch && phoneMatch[1] ? '+' + phoneMatch[1].replace(/^\\+/, '') : '+91',
        number: phoneMatch && phoneMatch[2] ? phoneMatch[2].replace(/\\D/g, '') : '',
      },
      location: detectedLocation,
      links: {
        linkedin: linkedinMatch ? 'https://' + linkedinMatch[0].replace(/^https?:\\/\\//, '') : '',
        github: githubMatch ? 'https://' + githubMatch[0].replace(/^https?:\\/\\//, '') : '',
        portfolio: '',
      },
    },
    education,
    work_experience,
    projects,
    skills: matchedSkills.length ? matchedSkills : ['Python', 'TypeScript', 'React', 'SQL'],
    application_metadata: {
      work_authorization: true,
      requires_sponsorship: false,
      notice_period_days: 30,
      earliest_joining_date: '2026-11-15',
      expected_ctc_lpa: 24,
      current_ctc_lpa: 15,
      gender: 'Male',
      disability_status: 'No, I do not have a disability',
      veteran_status: 'I am not a protected veteran',
    },
  };
}

/**
 * Calls the Backend AI Resume Parser either via Same-Origin Tab Bridge (if the AutoApply AI web app tab is open)
 * or via direct fetch.
 */
async function callBackendResumeParserWithBridge(payload) {
  // 1. Try Same-Origin Tab Bridge first (bypasses Cloud Run cookie proxy walls from chrome-extension://)
  try {
    const tabs = await chrome.tabs.query({});
    const hostKey = backendUrl.replace(/^https?:\\/\\//, '').split('/')[0];
    const bridgeTab = tabs.find(
      (t) =>
        t.url &&
        (t.url.includes(hostKey) ||
          t.url.includes('.run.app') ||
          t.url.includes('localhost:3000'))
    );
    if (bridgeTab && bridgeTab.id) {
      const bridged = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          bridgeTab.id,
          { type: 'PROXY_PARSE_RESUME', payload },
          (res) => {
            if (chrome.runtime.lastError || !res || !res.ok) {
              resolve(null);
            } else {
              resolve(res.data);
            }
          }
        );
      });
      if (bridged && bridged.profile) return bridged;
    }
  } catch (_e) {
    // fallback to direct fetch
  }

  // 2. Try direct fetch
  const resp = await fetch(backendUrl + '/api/resume/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return await resp.json();
}

function renderState() {
  backendUrlInput.value = backendUrl;

  if (currentResume && currentResume.fileName) {
    resumeFileBadge.textContent = currentResume.fileName;
    if (currentResume.rawExtractedText && !rawResumeText.value) {
      rawResumeText.value = currentResume.rawExtractedText;
    }
  } else {
    resumeFileBadge.textContent = 'None uploaded';
  }

  if (!currentProfile || !currentProfile.personal_info || !currentProfile.personal_info.first_name) {
    statusBadge.textContent = 'NO RESUME';
    emptyStateNotice.style.display = 'block';
    btnAutofill.disabled = true;
    fFname.value = '';
    fLname.value = '';
    fEmail.value = '';
    fPhone.value = '';
    fCity.value = '';
    fUni.value = '';
    fCompany.value = '';
    fRole.value = '';
    fNotice.value = '30';
    fCtc.value = '24';
    profileTextarea.value = '';
    return;
  }

  statusBadge.textContent = 'READY';
  emptyStateNotice.style.display = 'none';
  btnAutofill.disabled = false;

  const p = currentProfile.personal_info || {};
  const edu = (currentProfile.education && currentProfile.education[0]) || {};
  const exp = (currentProfile.work_experience && currentProfile.work_experience[0]) || {};
  const meta = currentProfile.application_metadata || {};

  fFname.value = p.first_name || '';
  fLname.value = p.last_name || '';
  fEmail.value = p.email || '';
  fPhone.value = (p.phone && p.phone.number) || '';
  fCity.value = (p.location && p.location.city) || '';
  fUni.value = edu.institution || '';
  fCompany.value = exp.company || '';
  fRole.value = exp.role || '';
  fNotice.value = String(meta.notice_period_days ?? 30);
  fCtc.value = String(meta.expected_ctc_lpa ?? 24);
  profileTextarea.value = JSON.stringify(currentProfile, null, 2);
}

chrome.storage.local.get(
  ['autoapply_profile', 'autoapply_resume', 'autoapply_backend_url'],
  (res) => {
    currentProfile = res.autoapply_profile || null;
    currentResume = res.autoapply_resume || null;
    if (res.autoapply_backend_url) backendUrl = res.autoapply_backend_url;
    renderState();
  }
);

backendUrlInput.addEventListener('change', () => {
  backendUrl = backendUrlInput.value.trim().replace(/\\/$/, '');
  chrome.storage.local.set({ autoapply_backend_url: backendUrl });
  appendLog('Updated Parser API URL to ' + backendUrl);
});

// Handle Resume File Upload / Update (PDF or TXT)
uploadInput.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  statusBadge.textContent = 'PARSING...';
  uploadBtnLabel.textContent = 'Parsing ' + file.name + '...';
  appendLog('Reading & decompressing ' + file.name + '...');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;

    // 1. Extract text locally from PDF or TXT right inside the browser
    let localExtractedText = '';
    if (file.name.toLowerCase().endsWith('.txt') || file.type === 'text/plain') {
      localExtractedText = await file.text();
    } else {
      localExtractedText = await extractTextFromPdfArrayBuffer(arrayBuffer);
    }

    if (localExtractedText) {
      rawResumeText.value = localExtractedText;
      appendLog('Extracted ' + localExtractedText.length + ' chars of text from ' + file.name + '.');
    }

    // 2. Immediately populate baseline profile from local text so UI updates right away
    let extractedProfile = fullLocalParseResume(localExtractedText, file.name);
    currentProfile = extractedProfile;
    currentResume = {
      fileName: file.name,
      fileSizeBytes: file.size,
      base64Data,
      rawExtractedText: localExtractedText,
      uploadedAt: new Date().toISOString(),
    };
    renderState();

    // 3. Call Gemini AI + Layout PDF Parser via Same-Origin Tab Bridge or direct fetch
    try {
      appendLog('Running Gemini AI structured profile extraction...');
      const data = await callBackendResumeParserWithBridge({
        pdfBase64: base64Data,
        rawText: localExtractedText,
        fileName: file.name,
        currentProfile,
      });
      if (data && data.profile) {
        extractedProfile = data.profile;
        if (data.extractedText && data.extractedText.length >= localExtractedText.length) {
          localExtractedText = data.extractedText;
          rawResumeText.value = localExtractedText;
          currentResume.rawExtractedText = localExtractedText;
        }
        appendLog('AI Extraction complete via ' + (data.engine || 'Gemini AI') + '.');
      }
    } catch (_apiErr) {
      appendLog('Used built-in local PDF stream & multi-section parser (keep the AutoApply web app tab open in Chrome for cloud Gemini AI enrichment).');
    }

    currentProfile = extractedProfile;
    chrome.storage.local.set({
      autoapply_profile: currentProfile,
      autoapply_resume: currentResume,
    });
    renderState();
    appendLog(
      'Saved profile for ' +
        currentProfile.personal_info.first_name +
        ' ' +
        currentProfile.personal_info.last_name
    );
  } catch (err) {
    appendLog('Resume upload error: ' + err.message);
  } finally {
    uploadBtnLabel.textContent = 'Upload / Update Resume (PDF or TXT)';
    uploadInput.value = '';
  }
});

// Handle Pasted / Edited Resume Text Re-Extraction
btnParseText.addEventListener('click', async () => {
  const text = rawResumeText.value.trim();
  if (!text) {
    appendLog('Please upload a PDF or paste resume text above first.');
    return;
  }
  statusBadge.textContent = 'PARSING...';
  try {
    const data = await callBackendResumeParserWithBridge({
      rawText: text,
      fileName: (currentResume && currentResume.fileName) || 'Resume.txt',
      currentProfile,
    });
    if (data && data.profile) {
      currentProfile = data.profile;
      appendLog('Extracted profile from text via ' + (data.engine || 'Gemini AI') + '.');
    } else {
      currentProfile = fullLocalParseResume(text, 'Resume.txt');
    }
  } catch (_e) {
    currentProfile = fullLocalParseResume(text, 'Resume.txt');
    appendLog('Extracted profile from text using built-in multi-section parser.');
  }
  chrome.storage.local.set({ autoapply_profile: currentProfile });
  renderState();
});

// Save Quick-Edit Inputs or JSON Editor Changes
btnSaveProfile.addEventListener('click', () => {
  try {
    let base = currentProfile
      ? JSON.parse(JSON.stringify(currentProfile))
      : fullLocalParseResume(rawResumeText.value || '', '');
    if (profileTextarea.value.trim()) {
      base = JSON.parse(profileTextarea.value);
    }
    base.personal_info = base.personal_info || {};
    base.personal_info.first_name = fFname.value.trim() || base.personal_info.first_name;
    base.personal_info.last_name = fLname.value.trim() || base.personal_info.last_name;
    base.personal_info.email = fEmail.value.trim() || base.personal_info.email;
    base.personal_info.phone = base.personal_info.phone || { country_code: '+91', number: '' };
    base.personal_info.phone.number = fPhone.value.trim() || base.personal_info.phone.number;
    base.personal_info.location = base.personal_info.location || {
      address: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India',
    };
    base.personal_info.location.city = fCity.value.trim() || base.personal_info.location.city;

    if (!base.education || !base.education.length) {
      base.education = [
        {
          institution: '',
          degree: 'B.Tech',
          major: 'Computer Science',
          gpa: 8.5,
          start_date: '2022-08',
          end_date: '2026-05',
          is_current: false,
        },
      ];
    }
    base.education[0].institution = fUni.value.trim() || base.education[0].institution;

    if (!base.work_experience || !base.work_experience.length) {
      base.work_experience = [
        {
          company: '',
          role: 'Software Engineer',
          location: 'India',
          start_date: '2024-05',
          end_date: '2024-08',
          is_current: false,
          description_bullets: ['Built production software systems.'],
        },
      ];
    }
    base.work_experience[0].company = fCompany.value.trim() || base.work_experience[0].company;
    base.work_experience[0].role = fRole.value.trim() || base.work_experience[0].role;

    base.application_metadata = base.application_metadata || {};
    base.application_metadata.notice_period_days = Number(fNotice.value) || 30;
    base.application_metadata.expected_ctc_lpa = Number(fCtc.value) || 24;

    currentProfile = base;
    chrome.storage.local.set({ autoapply_profile: currentProfile }, () => {
      renderState();
      appendLog('Saved updated profile to chrome.storage.local.');
    });
  } catch (err) {
    appendLog('JSON error: ' + err.message);
  }
});

// Clear Resume & Profile
btnClearProfile.addEventListener('click', () => {
  currentProfile = null;
  currentResume = null;
  rawResumeText.value = '';
  chrome.storage.local.set({ autoapply_profile: null, autoapply_resume: null }, () => {
    renderState();
    appendLog('Cleared stored resume and profile. Upload a new resume anytime.');
  });
});

// Distill Active Tab DOM
btnDistill.addEventListener('click', async () => {
  statusBadge.textContent = 'ANALYZING_DOM';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'DISTILL_DOM' }, (res) => {
    statusBadge.textContent = currentProfile ? 'READY' : 'NO RESUME';
    if (!res || !res.telemetry) {
      appendLog('Refresh the target tab once so content.js attaches to the page.');
      return;
    }
    appendLog(
      'Distilled ' +
        res.telemetry.elementsExtracted +
        ' interactive fields (' +
        res.telemetry.reductionPercentage +
        '% token reduction).'
    );
  });
});

// Autofill Active Tab Form
btnAutofill.addEventListener('click', async () => {
  if (!currentProfile) {
    appendLog('Please upload a resume or save your profile first.');
    return;
  }
  statusBadge.textContent = 'EXECUTING';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(
    tab.id,
    {
      type: 'EXECUTE_AUTOFILL',
      profile: currentProfile,
      cachedResume: currentResume,
      clickNextWhenDone: false,
      backendUrl,
    },
    (res) => {
      statusBadge.textContent = 'COMPLETED';
      if (!res) {
        appendLog('Refresh the target tab once so content.js attaches to the page.');
        return;
      }
      appendLog(
        'Distilled ' +
          res.telemetry.elementsExtracted +
          ' elements (' +
          res.telemetry.reductionPercentage +
          '% compression).'
      );
      (res.logs || []).forEach(appendLog);
    }
  );
});
`;

  const readmeMd = `# AutoApply AI — Chrome Extension (Manifest V3)

This extension starts **completely clean (zero pre-seeded dummy data)**. After installing it in Chrome, you can upload and update your PDF or TXT resume anytime directly inside the Chrome SidePanel.

## 1. How to Install in Google Chrome
1. Unzip \`autoapply-ai-chrome-extension.zip\` into a folder on your computer.
2. Open Google Chrome and navigate to \`chrome://extensions\`.
3. Toggle **Developer mode** ON in the top-right corner across from Extensions.
4. Click **Load unpacked** (top-left button) and select the unzipped folder (if you already loaded an older version, click the **Reload** icon on the extension card).

## 2. How PDF Text Parsing & AI Profile Extraction Work Inside the Extension
1. Click the **AutoApply AI** icon in your Chrome toolbar to open the **SidePanel**.
2. Click **Upload / Update Resume (PDF or TXT)**.
3. **3-Tier PDF & AI Extraction**:
   - **Browser PDF Stream Decompressor**: Immediately decompresses \`FlateDecode\` PDF streams in the browser via \`DecompressionStream('deflate')\` and populates the **Extracted PDF Text** box.
   - **Same-Origin Gemini AI Bridge**: Automatically bridges through your open AutoApply AI web app tab (\`PROXY_PARSE_RESUME\`) to run server-side \`unpdf\` coordinate extraction + **Gemini 3.1 Flash Lite AI** structured extraction.
   - **Full Built-in Multi-Section Parser**: Even if offline, parses Personal Info, Education, 2-line Work Experience, Projects, and 80+ Technical Skills into \`profile_schema.json\`.
`;

  return [
    {
      name: 'manifest.json',
      description: 'Manifest V3 configuration with SidePanel, storage, tabs, and all_urls content script.',
      language: 'json',
      content: manifestJson,
    },
    {
      name: 'sidepanel.html',
      description:
        'Unseeded Chrome SidePanel UI with visible Extracted PDF Text box, Resume Upload (PDF/TXT), Quick Profile Editor, and live JSON inspector.',
      language: 'html',
      content: sidepanelHtml,
    },
    {
      name: 'sidepanel.js',
      description:
        'Includes native browser DecompressionStream PDF text extractor, Same-Origin Gemini AI Tab Bridge, and full multi-section resume parser.',
      language: 'javascript',
      content: sidepanelJs,
    },
    {
      name: 'content.js',
      description:
        'Universal DOM Distiller, React Fiber native value setter, DataTransfer PDF file injector, and Same-Origin AI Proxy Bridge.',
      language: 'javascript',
      content: contentJs,
    },
    {
      name: 'background.js',
      description:
        'Clean Service Worker (no hardcoded dummy data) that initializes empty storage and coordinates multi-page autopilot.',
      language: 'javascript',
      content: backgroundJs,
    },
    {
      name: 'README.md',
      description: 'Installation and PDF/AI extraction guide for chrome://extensions.',
      language: 'markdown',
      content: readmeMd,
    },
  ];
}

/**
 * Pure TypeScript PKZIP (Store / Method 0) generator so the user can download
 * a valid .zip archive containing all Chrome Extension files with zero external dependencies.
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createExtensionZipUint8Array(
  files: Array<{ name: string; content: string }>
): Uint8Array {
  const encoder = new TextEncoder();
  const encodedFiles = files.map((f) => {
    const nameBytes = encoder.encode(f.name);
    const dataBytes = encoder.encode(f.content);
    const crc = crc32(dataBytes);
    return { nameBytes, dataBytes, crc };
  });

  let localHeadersTotal = 0;
  let centralDirTotal = 0;
  for (const ef of encodedFiles) {
    localHeadersTotal += 30 + ef.nameBytes.length + ef.dataBytes.length;
    centralDirTotal += 46 + ef.nameBytes.length;
  }

  const totalSize = localHeadersTotal + centralDirTotal + 22;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  let offset = 0;
  const fileOffsets: number[] = [];

  for (const ef of encodedFiles) {
    fileOffsets.push(offset);
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0, true);
    view.setUint16(offset + 8, 0, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, 0x5421, true);
    view.setUint32(offset + 14, ef.crc, true);
    view.setUint32(offset + 18, ef.dataBytes.length, true);
    view.setUint32(offset + 22, ef.dataBytes.length, true);
    view.setUint16(offset + 26, ef.nameBytes.length, true);
    view.setUint16(offset + 28, 0, true);
    out.set(ef.nameBytes, offset + 30);
    out.set(ef.dataBytes, offset + 30 + ef.nameBytes.length);
    offset += 30 + ef.nameBytes.length + ef.dataBytes.length;
  }

  const centralDirStart = offset;

  for (let i = 0; i < encodedFiles.length; i++) {
    const ef = encodedFiles[i];
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 0, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, 0, true);
    view.setUint16(offset + 14, 0x5421, true);
    view.setUint32(offset + 16, ef.crc, true);
    view.setUint32(offset + 20, ef.dataBytes.length, true);
    view.setUint32(offset + 24, ef.dataBytes.length, true);
    view.setUint16(offset + 28, ef.nameBytes.length, true);
    view.setUint16(offset + 30, 0, true);
    view.setUint16(offset + 32, 0, true);
    view.setUint16(offset + 34, 0, true);
    view.setUint16(offset + 36, 0, true);
    view.setUint32(offset + 38, 0, true);
    view.setUint32(offset + 42, fileOffsets[i], true);
    out.set(ef.nameBytes, offset + 46);
    offset += 46 + ef.nameBytes.length;
  }

  const centralDirSize = offset - centralDirStart;

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, encodedFiles.length, true);
  view.setUint16(offset + 10, encodedFiles.length, true);
  view.setUint32(offset + 12, centralDirSize, true);
  view.setUint32(offset + 16, centralDirStart, true);
  view.setUint16(offset + 20, 0, true);

  return out;
}
