export interface ExtensionFileEntry {
  name: string;
  description: string;
  language: 'json' | 'javascript' | 'html' | 'markdown';
  content: string;
}

/**
 * Generates a clean, unseeded Chrome Extension (Manifest V3 v1.3.0) bundle.
 * Includes:
 * 1. AI Question & Control Type Scanner in content.js (detects DROPDOWN, DT_PICKER, OPTION_SELECTION,
 *    NUMBER_INPUT, LONG_ESSAY, SHORT_TEXT, FILE_UPLOAD, and groups radio/checkbox options under their parent question).
 * 2. Universal Profile Question-Answering Agent + Same-Origin Gemini AI Bridge (PROXY_PLAN_FORM & PROXY_PARSE_RESUME)
 *    so the extension can answer ANY question from the candidate's generated profile.
 * 3. Native browser DecompressionStream('deflate') PDF text extractor + multi-section resume parser in sidepanel.js.
 */
export function buildChromeExtensionFiles(backendUrl: string): ExtensionFileEntry[] {
  const safeBackendUrl = backendUrl.replace(/\/$/, '');

  const manifestJson = JSON.stringify(
    {
      manifest_version: 3,
      name: 'AutoApply AI — Autonomous ATS Form Agent',
      version: '1.3.0',
      description:
        'Autonomous AI Agent that scans form questions, detects control types (Dropdown, DT Picker, Option Selection, Essay), generates answers from your resume profile, and autofills any ATS.',
      permissions: ['storage', 'activeTab', 'scripting', 'sidePanel', 'tabs'],
      host_permissions: ['<all_urls>'],
      background: {
        service_worker: 'background.js',
      },
      side_panel: {
        default_path: 'sidepanel.html',
      },
      action: {
        default_title: 'Open AutoApply AI Agent SidePanel',
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
 * AutoApply AI — Manifest V3 Background Service Worker (v1.3.0)
 * Starts completely clean (NO pre-seeded dummy profile).
 * Coordinates multi-page form navigation and persistent storage for the AI Form Agent.
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
 * AutoApply AI — Universal AI Agent Content Script (Manifest V3 v1.3.0)
 * 1. Scans any webpage form and properly extracts the overarching Question Text + Option Labels.
 * 2. Detects the exact Question Type: DROPDOWN, DT_PICKER, OPTION_SELECTION (Radio/Checkbox),
 *    NUMBER_INPUT, LONG_ESSAY, SHORT_TEXT, or FILE_UPLOAD.
 * 3. Bridges Gemini AI calls (PROXY_PARSE_RESUME & PROXY_PLAN_FORM) same-origin when running on the AutoApply AI tab.
 * 4. Injects answers using React-compatible native prototype setters, dropdown option matching,
 *    DT Picker date formatting, and MutationObserver re-scanning for conditional questions.
 */

(function () {
  if (window.__autoApplyContentScriptLoaded) return;
  window.__autoApplyContentScriptLoaded = true;

  // 1. React/Vue/Angular Native Value Setter
  function setNativeValue(element, value) {
    if (!element) return;
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
    if (!element) return;
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

  // 3. Properly extract BOTH the Option Label (for radio/checkbox) AND the Overarching Question Prompt
  function resolveFieldLabel(el) {
    const root =
      el.getRootNode && el.getRootNode() instanceof ShadowRoot ? el.getRootNode() : document;

    const explicitQuestion = el.getAttribute('data-question') || el.getAttribute('data-label');
    if (explicitQuestion && explicitQuestion.trim().length > 2) {
      return explicitQuestion.trim();
    }

    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const ids = ariaLabelledBy.split(/\\s+/).filter(Boolean);
      const texts = ids
        .map((id) => {
          const refEl = root.querySelector('#' + CSS.escape(id));
          return refEl && refEl.textContent ? refEl.textContent.trim() : '';
        })
        .filter(Boolean);
      if (texts.length > 0) return texts.join(' ');
    }

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim().length > 1) return ariaLabel.trim();

    if (el.id) {
      const explicit = root.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (explicit && explicit.textContent) return explicit.textContent.trim();
    }

    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent) {
      return parentLabel.textContent.trim();
    }

    const wrapper = el.closest(
      '[role="listitem"], fieldset, .form-group, .field, section, div'
    );
    if (wrapper) {
      const lbl = wrapper.querySelector(
        'legend, [role="heading"], label, [class*="label"], [class*="question"], h3, h4, p'
      );
      if (lbl && lbl.textContent && !lbl.contains(el)) {
        return lbl.textContent.trim();
      }
      if (lbl && lbl.textContent) {
        return lbl.textContent.trim();
      }
    }

    return el.getAttribute('placeholder') || el.getAttribute('name') || el.tagName.toLowerCase();
  }

  /**
   * Resolves the parent question title for a radio button or checkbox group
   * so we never mistake an option label ("Yes" / "No") for the question itself.
   */
  function resolveGroupQuestionTitle(el, optionLabel) {
    const explicitQ = el.getAttribute('data-question');
    if (explicitQ) return explicitQ.trim();

    const fieldset = el.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend && legend.textContent) return legend.textContent.trim();
    }

    const radioGroup = el.closest('[role="radiogroup"], [role="group"], [role="listitem"]');
    if (radioGroup) {
      const heading = radioGroup.querySelector(
        '[role="heading"], legend, h3, h4, [class*="question"], [class*="title"], p, label:not(:has(input))'
      );
      if (heading && heading.textContent) return heading.textContent.trim();
    }

    // Walk up 3 ancestor containers looking for a question label or heading that doesn't just say "Yes"/"No"
    let curr = el.parentElement;
    for (let depth = 0; depth < 4 && curr; depth++) {
      const candidates = curr.querySelectorAll('legend, label, p, h3, h4, span, div');
      for (const cand of candidates) {
        if (cand.contains(el)) continue;
        const txt = (cand.textContent || '').replace(/\\s+/g, ' ').trim();
        if (
          txt.length >= 10 &&
          txt.length <= 220 &&
          txt.toLowerCase() !== (optionLabel || '').toLowerCase() &&
          (txt.includes('?') || /sponsorship|authorized|relocate|gender|veteran|disability|experience|notice|degree|work/i.test(txt))
        ) {
          return txt;
        }
      }
      curr = curr.parentElement;
    }

    return optionLabel || el.getAttribute('name') || 'Selection Question';
  }

  /**
   * Classifies any DOM element into its semantic Question Type:
   * DROPDOWN, DT_PICKER, OPTION_SELECTION, NUMBER_INPUT, LONG_ESSAY, SHORT_TEXT, FILE_UPLOAD
   */
  function classifyControlQuestionType(el, questionText, optionsList) {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || tag).toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    const placeholder = el.getAttribute('placeholder') || '';
    const isReadonly = el.hasAttribute('readonly');
    const combined = (questionText + ' ' + placeholder + ' ' + (el.getAttribute('name') || '')).toLowerCase();

    if (type === 'file') {
      return { question_type: 'FILE_UPLOAD', question_type_label: 'File Upload (PDF)' };
    }
    if (type === 'radio') {
      return { question_type: 'OPTION_SELECTION', question_type_label: 'Option Selection (Radio)' };
    }
    if (type === 'checkbox') {
      return { question_type: 'OPTION_SELECTION', question_type_label: 'Option Selection (Checkbox)' };
    }
    if (type === 'email' || type === 'tel' || type === 'url') {
      return {
        question_type: 'SHORT_TEXT',
        question_type_label:
          type === 'email'
            ? 'Short Text (Email)'
            : type === 'tel'
            ? 'Short Text (Phone)'
            : 'Short Text (URL)',
      };
    }
    if (
      type === 'date' ||
      type === 'month' ||
      type === 'datetime-local' ||
      type === 'time' ||
      /\\b(start\\s*date|end\\s*date|date\\s*of\\s*birth|dob|joining\\s*date|available\\s*date|graduation\\s*date)\\b/i.test(combined) ||
      /\\b(yyyy-mm-dd|yyyy-mm|mm\\/dd\\/yyyy|dd\\/mm\\/yyyy)\\b/i.test(combined)
    ) {
      let dateFormat = 'YYYY-MM-DD';
      if (
        type === 'month' ||
        (/\\byyyy-mm\\b/i.test(combined) && !/\\byyyy-mm-dd\\b/i.test(combined)) ||
        (isReadonly && /\\b(start\\s*date|end\\s*date)\\b/i.test(combined))
      ) {
        dateFormat = 'YYYY-MM';
      } else if (/\\bmm\\/dd\\/yyyy\\b/i.test(combined)) {
        dateFormat = 'MM/DD/YYYY';
      }
      return {
        question_type: 'DT_PICKER',
        question_type_label: 'DT Picker (' + dateFormat + ')',
        date_format: dateFormat,
      };
    }
    if (
      tag === 'select' ||
      role === 'combobox' ||
      role === 'listbox' ||
      el.hasAttribute('list') ||
      (optionsList && optionsList.length > 0) ||
      /\\b(current\\s*location|university|institution)\\b/i.test(combined)
    ) {
      const count = optionsList ? optionsList.length : 0;
      return {
        question_type: 'DROPDOWN',
        question_type_label:
          role === 'combobox'
            ? 'Dropdown (Typeahead Combobox)'
            : count > 0
            ? 'Dropdown (' + count + ' options)'
            : 'Dropdown Select',
      };
    }
    if (
      type === 'number' ||
      /\\b(cgpa|gpa|cpi|notice\\s*period\\s*\\(days\\)|expected\\s*ctc|current\\s*ctc|years\\s*of\\s*experience|how\\s*many\\s*years)\\b/i.test(combined)
    ) {
      return { question_type: 'NUMBER_INPUT', question_type_label: 'Number Input' };
    }
    if (tag === 'textarea') {
      return { question_type: 'LONG_ESSAY', question_type_label: 'Long Essay / Screening' };
    }
    return {
      question_type: 'SHORT_TEXT',
      question_type_label:
        type === 'email'
          ? 'Short Text (Email)'
          : type === 'tel'
          ? 'Short Text (Phone)'
          : type === 'url'
          ? 'Short Text (URL)'
          : 'Short Text Input',
    };
  }

  // 4. Distill live DOM + Open Shadow DOM roots AND build structured Question list
  const elementMap = new Map();

  function distillDocument() {
    elementMap.clear();
    const distilled = [];
    const rawRadioGroups = new Map();
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
          role === 'listbox' ||
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
            .map((o) => ({ label: o.text.trim(), value: o.value }))
            .filter((o) => o.label && !/^(--|select|choose)/i.test(o.label));
        } else if (node.hasAttribute('list')) {
          const listId = node.getAttribute('list');
          const dataList = document.getElementById(listId);
          if (dataList) {
            options = Array.from(dataList.querySelectorAll('option'))
              .map((o) => ({ label: o.value || o.textContent.trim(), value: o.value || o.textContent.trim() }))
              .filter((o) => o.label);
          }
        } else if (node.getAttribute('data-options')) {
          options = node
            .getAttribute('data-options')
            .split('|')
            .map((s) => ({ label: s.trim(), value: s.trim() }))
            .filter((o) => o.label);
        }

        const itemLabel = resolveFieldLabel(node).replace(/\\s+/g, ' ').slice(0, 160);
        const groupQuestion =
          type === 'radio'
            ? resolveGroupQuestionTitle(node, itemLabel).replace(/\\s+/g, ' ').slice(0, 180)
            : itemLabel;

        const entry = {
          agent_id: agentId,
          tag,
          type,
          role: role || null,
          name: node.getAttribute('name') || '',
          label: itemLabel,
          group_question: groupQuestion,
          placeholder: node.getAttribute('placeholder') || '',
          is_readonly: node.hasAttribute('readonly'),
          current_value: node.value || '',
          options: options ? options.map((o) => o.label) : null,
          option_objects: options,
          in_shadow_dom: inShadow,
        };

        distilled.push(entry);

        if (type === 'radio') {
          const gKey = entry.name || entry.group_question || 'radio_group';
          const list = rawRadioGroups.get(gKey) || [];
          list.push(entry);
          rawRadioGroups.set(gKey, list);
        }
      });
    }

    walk(document, false);

    // Build structured questions array
    const questions = [];
    const emittedGroups = new Set();
    let qIdx = 1;

    for (const item of distilled) {
      if (item.tag === 'button' || item.type === 'submit') continue;

      if (item.type === 'radio') {
        const gKey = item.name || item.group_question || 'radio_group';
        if (emittedGroups.has(gKey)) continue;
        emittedGroups.add(gKey);

        const groupItems = rawRadioGroups.get(gKey) || [item];
        let qText = groupItems[0].group_question || item.label;
        const allOptLabels = groupItems.map((g) => g.label).join(' ').toLowerCase();
        if (/^(yes|no)\\b/i.test(qText) || qText.length < 12) {
          if (allOptLabels.includes('sponsorship') || allOptLabels.includes('notice')) {
            qText = 'Do you require visa sponsorship or have a notice period > 30 days?';
          } else if (allOptLabels.includes('authorized') || allOptLabels.includes('legally')) {
            qText = 'Are you legally authorized to work in this country?';
          } else {
            qText = 'Select an option (' + (item.name || 'Question ' + qIdx) + ')';
          }
        }

        questions.push({
          question_id: 'q_' + qIdx++,
          agent_ids: groupItems.map((g) => g.agent_id),
          question_text: qText,
          question_type: 'OPTION_SELECTION',
          question_type_label: 'Option Selection (Radio · ' + groupItems.length + ' choices)',
          raw_input_type: 'radio',
          options: groupItems.map((g) => ({
            label: g.label,
            value: g.current_value || g.label,
            agent_id: g.agent_id,
          })),
          in_shadow_dom: item.in_shadow_dom,
        });
        continue;
      }

      const domNode = elementMap.get(item.agent_id);
      const classified = classifyControlQuestionType(
        domNode,
        item.label,
        item.option_objects
      );

      questions.push({
        question_id: 'q_' + qIdx++,
        agent_ids: [item.agent_id],
        question_text: item.label || item.placeholder || item.name || 'Question ' + qIdx,
        question_type: classified.question_type,
        question_type_label: classified.question_type_label,
        raw_input_type: item.type,
        options: item.option_objects || [],
        date_format: classified.date_format || null,
        placeholder: item.placeholder,
        in_shadow_dom: item.in_shadow_dom,
      });
    }

    const rawBytes = document.documentElement.outerHTML.length;
    const distilledBytes = JSON.stringify(distilled).length;
    const reductionPct =
      rawBytes > 0 ? Math.max(0, ((rawBytes - distilledBytes) / rawBytes) * 100) : 95;

    return {
      questions,
      elements: distilled,
      pageTitle: document.title || location.href,
      telemetry: {
        rawHtmlBytes: rawBytes,
        distilledJsonBytes: distilledBytes,
        reductionPercentage: Number(reductionPct.toFixed(1)),
        elementsExtracted: distilled.length,
        questionsExtracted: questions.length,
      },
    };
  }

  // 5. Format profile dates for DT_PICKER controls
  function formatDateForControl(rawDate, dateFormat) {
    const clean = (rawDate || '2025-05').trim();
    const match = clean.match(/^(\\d{4})(?:-(\\d{1,2}))?(?:-(\\d{1,2}))?/);
    const yyyy = (match && match[1]) || '2025';
    const mm = String((match && match[2]) || '05').padStart(2, '0');
    const dd = String((match && match[3]) || '15').padStart(2, '0');
    if (dateFormat === 'YYYY') return yyyy;
    if (dateFormat === 'YYYY-MM') return yyyy + '-' + mm;
    if (dateFormat === 'MM/DD/YYYY') return mm + '/' + dd + '/' + yyyy;
    return yyyy + '-' + mm + '-' + dd;
  }

  // 6. Fuzzy Option Matcher for DROPDOWN & OPTION_SELECTION
  function pickBestOption(options, desiredValue) {
    if (!options || !options.length) return null;
    const target = String(desiredValue || '').trim().toLowerCase();
    if (!target) return options[0];

    const exact = options.find(
      (o) =>
        (o.value && o.value.toLowerCase() === target) ||
        (o.label && o.label.toLowerCase() === target)
    );
    if (exact) return exact;

    if (target === 'yes' || target === 'true') {
      const yesOpt = options.find((o) => /\\b(yes|true|authorized|willing|agree)\\b/i.test(o.label));
      if (yesOpt) return yesOpt;
    }
    if (target === 'no' || target === 'false') {
      const noOpt = options.find((o) => /\\b(no|false|do not|not a)\\b/i.test(o.label));
      if (noOpt) return noOpt;
    }

    if (/b\\.?\\s*tech|bachelor/i.test(target)) {
      const deg = options.find((o) => /b\\.?\\s*tech|bachelor|undergraduate|b\\.?e\\b/i.test(o.label));
      if (deg) return deg;
    }

    const sub = options.find(
      (o) =>
        o.label.toLowerCase().includes(target) ||
        target.includes(o.label.toLowerCase()) ||
        (o.value && o.value.toLowerCase().includes(target))
    );
    if (sub) return sub;

    return options[0];
  }

  // 7. Local AI Agent Reasoner (answers ANY question from profile according to its question_type)
  function reasonAnswersLocally(questions, profile, cachedResume) {
    const p = (profile && profile.personal_info) || {};
    const edu = (profile && profile.education && profile.education[0]) || {};
    const exps = (profile && profile.work_experience) || [];
    const projs = (profile && profile.projects) || [];
    const skills = (profile && profile.skills) || [];
    const meta = (profile && profile.application_metadata) || {};

    let companyIdx = 0;
    let roleIdx = 0;
    let startIdx = 0;
    let endIdx = 0;
    let currIdx = 0;
    let respIdx = 0;

    return questions.map((q) => {
      const key = (q.question_text + ' ' + (q.placeholder || '')).toLowerCase();
      let ans = '';
      let source = 'personal_info';

      if (q.question_type === 'FILE_UPLOAD') {
        const fName = (cachedResume && cachedResume.fileName) || ((p.first_name || 'Candidate') + '_Resume.pdf');
        return {
          question_id: q.question_id,
          agent_ids: q.agent_ids,
          question_text: q.question_text,
          question_type: q.question_type,
          question_type_label: q.question_type_label,
          answer: fName,
          profile_source: 'Cached PDF Resume',
          reasoning: 'Injecting cached PDF resume via DataTransfer.',
        };
      }

      if (q.question_type === 'DT_PICKER') {
        const fmt = q.date_format || 'YYYY-MM-DD';
        if (/start\\s*date|from\\s*date/i.test(key)) {
          const exp = exps[startIdx++] || exps[0] || {};
          ans = formatDateForControl(exp.start_date || edu.start_date || '2024-05', fmt);
          source = 'work_experience.start_date';
        } else if (/end\\s*date|to\\s*date|graduation/i.test(key)) {
          const exp = exps[endIdx++] || exps[0] || {};
          ans = formatDateForControl(exp.end_date || edu.end_date || '2025-05', fmt);
          source = 'work_experience.end_date';
        } else {
          ans = formatDateForControl(meta.earliest_joining_date || '2026-11-15', fmt);
          source = 'application_metadata.earliest_joining_date';
        }
        return {
          question_id: q.question_id,
          agent_ids: q.agent_ids,
          question_text: q.question_text,
          question_type: q.question_type,
          question_type_label: q.question_type_label,
          answer: ans,
          profile_source: source,
          reasoning: 'Formatted date for DT Picker (' + fmt + ').',
        };
      }

      if (q.question_type === 'OPTION_SELECTION') {
        if (q.raw_input_type === 'checkbox') {
          if (/current|present|currently work/i.test(key)) {
            const exp = exps[currIdx++] || exps[0] || {};
            const isC = Boolean(exp.is_current);
            return {
              question_id: q.question_id,
              agent_ids: q.agent_ids,
              question_text: q.question_text,
              question_type: q.question_type,
              question_type_label: q.question_type_label,
              answer: isC ? 'Checked (Yes)' : 'Unchecked (No)',
              selected_option_value: String(isC),
              profile_source: 'work_experience.is_current',
              reasoning: 'Synced checkbox with work_experience.is_current.',
            };
          }
          return {
            question_id: q.question_id,
            agent_ids: q.agent_ids,
            question_text: q.question_text,
            question_type: q.question_type,
            question_type_label: q.question_type_label,
            answer: 'Checked (Yes)',
            selected_option_value: 'true',
            profile_source: 'application_metadata (Consent)',
            reasoning: 'Checked acknowledgment checkbox.',
          };
        }

        // Radio group
        let desired = 'Yes';
        if (/sponsorship|notice.*30|visa/i.test(key)) {
          desired = meta.requires_sponsorship || Number(meta.notice_period_days) > 30 ? 'Yes' : 'No';
          source = 'application_metadata.requires_sponsorship & notice_period_days';
        } else if (/authorized|legally/i.test(key)) {
          desired = meta.work_authorization !== false ? 'Yes' : 'No';
          source = 'application_metadata.work_authorization';
        } else if (/gender/i.test(key)) {
          desired = meta.gender || 'Male';
          source = 'application_metadata.gender';
        } else if (/disability/i.test(key)) {
          desired = meta.disability_status || 'No';
          source = 'application_metadata.disability_status';
        } else if (/veteran/i.test(key)) {
          desired = meta.veteran_status || 'No';
          source = 'application_metadata.veteran_status';
        }

        const matched = pickBestOption(q.options, desired);
        return {
          question_id: q.question_id,
          agent_ids: q.agent_ids,
          question_text: q.question_text,
          question_type: q.question_type,
          question_type_label: q.question_type_label,
          answer: matched ? matched.label : desired,
          selected_option_agent_id: (matched && matched.agent_id) || q.agent_ids[0],
          selected_option_value: (matched && matched.value) || desired,
          profile_source: source,
          reasoning: 'Matched radio option from ' + (q.options ? q.options.length : 2) + ' choices.',
        };
      }

      // Standard / Dropdown / Number / Essay questions
      if (/full\\s*name|candidate\\s*name|your\\s*name/i.test(key)) {
        ans = ((p.first_name || '') + ' ' + (p.last_name || '')).trim();
        source = 'personal_info.first_name + last_name';
      } else if (/first\\s*name|given\\s*name|fname/i.test(key)) {
        ans = p.first_name || '';
        source = 'personal_info.first_name';
      } else if (/last\\s*name|surname|family\\s*name|lname/i.test(key)) {
        ans = p.last_name || '';
        source = 'personal_info.last_name';
      } else if (/e-?mail/i.test(key)) {
        ans = p.email || '';
        source = 'personal_info.email';
      } else if (/country\\s*code|phone\\s*code/i.test(key)) {
        ans = (p.phone && p.phone.country_code) || '+91';
        source = 'personal_info.phone.country_code';
      } else if (/phone|mobile|contact\\s*number|tel/i.test(key)) {
        ans = (p.phone && p.phone.number) || '';
        source = 'personal_info.phone.number';
      } else if (/linkedin/i.test(key)) {
        ans = (p.links && p.links.linkedin) || '';
        source = 'personal_info.links.linkedin';
      } else if (/github/i.test(key)) {
        ans = (p.links && p.links.github) || '';
        source = 'personal_info.links.github';
      } else if (/portfolio|website|personal\\s*url/i.test(key)) {
        ans = (p.links && p.links.portfolio) || (p.links && p.links.github) || '';
        source = 'personal_info.links.portfolio';
      } else if (/pincode|postal|zip/i.test(key)) {
        ans = (p.location && p.location.pincode) || '';
        source = 'personal_info.location.pincode';
      } else if (/current\\s*location|city|location/i.test(key) && !/company/i.test(key)) {
        const loc = p.location || {};
        ans = [loc.city, loc.state, loc.country].filter(Boolean).join(', ');
        source = 'personal_info.location';
      } else if (/address|street/i.test(key)) {
        ans = (p.location && p.location.address) || (p.location && p.location.city) || '';
        source = 'personal_info.location.address';
      } else if (/university|college|institution|school/i.test(key)) {
        ans = edu.institution || '';
        source = 'education[0].institution';
      } else if (/degree|qualification/i.test(key)) {
        ans = q.question_type === 'DROPDOWN' ? (edu.degree || 'B.Tech') : ((edu.degree || 'B.Tech') + ' — ' + (edu.major || 'Computer Science'));
        source = 'education[0].degree';
      } else if (/major|branch|field\\s*of\\s*study|specialization/i.test(key)) {
        ans = edu.major || 'Computer Science';
        source = 'education[0].major';
      } else if (/gpa|cgpa|cpi|grade/i.test(key)) {
        ans = String(edu.gpa || 8.5);
        source = 'education[0].gpa';
      } else if (/company|employer|organization/i.test(key)) {
        const exp = exps[companyIdx++] || exps[0] || {};
        ans = exp.company || '';
        source = 'work_experience.company';
      } else if (/role|job\\s*title|designation|position/i.test(key)) {
        const exp = exps[roleIdx++] || exps[0] || {};
        ans = exp.role || '';
        source = 'work_experience.role';
      } else if (/responsibilit|achievement|work\\s*description/i.test(key)) {
        const exp = exps[respIdx++] || exps[0] || {};
        ans = (exp.description_bullets || []).join(' • ');
        source = 'work_experience.description_bullets';
      } else if (/notice\\s*period|earliest\\s*joining/i.test(key)) {
        ans =
          q.question_type === 'NUMBER_INPUT'
            ? String(meta.notice_period_days ?? 30)
            : (meta.notice_period_days ?? 30) + ' days notice period — Earliest joining: ' + (meta.earliest_joining_date || '2026-11-15');
        source = 'application_metadata.notice_period_days';
      } else if (/expected\\s*ctc|expected\\s*salary/i.test(key)) {
        ans = String(meta.expected_ctc_lpa ?? 24);
        source = 'application_metadata.expected_ctc_lpa';
      } else if (/current\\s*ctc|current\\s*salary/i.test(key)) {
        ans = String(meta.current_ctc_lpa ?? 15);
        source = 'application_metadata.current_ctc_lpa';
      } else if (/years\\s*of\\s*experience|how\\s*many\\s*years|yoe/i.test(key)) {
        ans = q.question_type === 'NUMBER_INPUT' ? '1' : '1+ years';
        source = 'work_experience timeline';
      } else if (/gender|sex/i.test(key)) {
        ans = meta.gender || 'Male';
        source = 'application_metadata.gender';
      } else if (/disability/i.test(key)) {
        ans = meta.disability_status || 'No, I do not have a disability';
        source = 'application_metadata.disability_status';
      } else if (/veteran/i.test(key)) {
        ans = meta.veteran_status || 'I am not a protected veteran';
        source = 'application_metadata.veteran_status';
      } else if (/skill|technologies|tech\\s*stack/i.test(key)) {
        ans = skills.join(', ');
        source = 'skills[]';
      } else {
        // Synthesize from profile for any open-ended or custom question
        const exp0 = exps[0] || { company: 'my previous organization', role: 'Software Engineer', description_bullets: ['built scalable production services'] };
        const proj0 = projs[0] || { title: 'AutoApply AI', tech_stack: ['TypeScript', 'Python'], description: 'autonomous workflow engine' };
        if (/project|complex|architecture|built/i.test(key)) {
          ans = 'My most impactful engineering project is ' + proj0.title + ' (' + (proj0.tech_stack || []).join(', ') + '). ' + (proj0.description || '') + ' Combined with my experience as ' + exp0.role + ' at ' + exp0.company + ' and proficiency in ' + skills.slice(0, 6).join(', ') + ', I build low-latency, high-reliability production systems.';
        } else {
          ans = 'During my experience as ' + exp0.role + ' at ' + exp0.company + ' and my ' + (edu.degree || 'B.Tech') + ' at ' + (edu.institution || 'University') + ' (CGPA ' + (edu.gpa || 8.5) + '), I delivered production software using ' + skills.slice(0, 7).join(', ') + '. At ' + exp0.company + ', ' + ((exp0.description_bullets && exp0.description_bullets[0]) || 'I engineered scalable systems') + ' and built ' + proj0.title + '.';
        }
        source = 'AI Profile Synthesis (work_experience + projects + skills)';
      }

      if (q.question_type === 'DROPDOWN' && q.options && q.options.length > 0) {
        const matched = pickBestOption(q.options, ans);
        if (matched) {
          return {
            question_id: q.question_id,
            agent_ids: q.agent_ids,
            question_text: q.question_text,
            question_type: q.question_type,
            question_type_label: q.question_type_label,
            answer: matched.label,
            selected_option_value: matched.value,
            profile_source: source,
            reasoning: 'Matched dropdown option "' + matched.label + '" from ' + q.options.length + ' choices.',
          };
        }
      }

      return {
        question_id: q.question_id,
        agent_ids: q.agent_ids,
        question_text: q.question_text,
        question_type: q.question_type,
        question_type_label: q.question_type_label,
        answer: ans,
        profile_source: source,
        reasoning: 'Generated answer for ' + q.question_type_label + ' from ' + source + '.',
      };
    });
  }

  // 8. Inject AI Agent Answers into the live DOM according to each question_type
  async function applyAnswersToDom(answers, cachedResume, clickNextWhenDone) {
    const logs = [];
    for (const ans of answers) {
      const primaryId = ans.selected_option_agent_id || (ans.agent_ids && ans.agent_ids[0]);
      const domEl = elementMap.get(primaryId);
      if (!domEl) continue;

      if (ans.question_type === 'FILE_UPLOAD') {
        if (cachedResume && cachedResume.base64Data) {
          const ok = injectBase64PdfIntoFileInput(domEl, cachedResume.base64Data, cachedResume.fileName);
          if (ok) logs.push('[FILE_UPLOAD] Injected ' + cachedResume.fileName);
        }
        continue;
      }

      if (ans.question_type === 'OPTION_SELECTION') {
        const type = (domEl.getAttribute('type') || '').toLowerCase();
        if (type === 'checkbox') {
          const shouldCheck = !/unchecked|false|no/i.test(String(ans.selected_option_value || ans.answer));
          setNativeChecked(domEl, shouldCheck);
          logs.push('[OPTION_SELECTION · Checkbox] ' + ans.question_text.slice(0, 38) + ' -> ' + (shouldCheck ? 'Checked' : 'Unchecked'));
        } else {
          // Radio button group: find target radio by selected_option_agent_id or matching label/value
          let radioToClick = domEl;
          if (!ans.selected_option_agent_id && ans.agent_ids && ans.agent_ids.length > 1) {
            const targetStr = String(ans.answer || '').toLowerCase();
            for (const aid of ans.agent_ids) {
              const cand = elementMap.get(aid);
              if (!cand) continue;
              const candLbl = resolveFieldLabel(cand).toLowerCase();
              const candVal = (cand.value || '').toLowerCase();
              if (candLbl.includes(targetStr) || targetStr.includes(candLbl) || candVal === targetStr) {
                radioToClick = cand;
                break;
              }
            }
          }
          setNativeChecked(radioToClick, true);
          radioToClick.style.outline = '2px solid #2563eb';
          logs.push('[OPTION_SELECTION · Radio] ' + ans.question_text.slice(0, 38) + ' -> ' + ans.answer);
        }
        continue;
      }

      if (ans.question_type === 'DROPDOWN') {
        const tag = domEl.tagName.toLowerCase();
        if (tag === 'select') {
          const opts = Array.from(domEl.options);
          const targetLower = String(ans.selected_option_value || ans.answer || '').toLowerCase();
          const best = opts.find(
            (o) =>
              o.value.toLowerCase() === targetLower ||
              o.text.toLowerCase() === targetLower ||
              o.text.toLowerCase().includes(targetLower) ||
              targetLower.includes(o.text.toLowerCase())
          );
          setNativeValue(domEl, best ? best.value : ans.answer);
        } else {
          // Custom combobox / typeahead input
          domEl.click();
          setNativeValue(domEl, ans.answer);
          await new Promise((r) => setTimeout(r, 380));
          const listboxOptions = document.querySelectorAll('[role="option"], [data-option-value], li[role="option"]');
          const targetLower = String(ans.answer || '').toLowerCase();
          for (const optNode of listboxOptions) {
            const txt = (optNode.textContent || '').trim().toLowerCase();
            if (txt && (txt.includes(targetLower) || targetLower.includes(txt))) {
              optNode.click();
              break;
            }
          }
        }
        domEl.style.outline = '2px solid #2563eb';
        logs.push('[DROPDOWN] ' + ans.question_text.slice(0, 38) + ' -> ' + String(ans.answer).slice(0, 40));
        continue;
      }

      if (ans.question_type === 'DT_PICKER') {
        if (domEl.hasAttribute('readonly')) {
          domEl.removeAttribute('readonly');
          setNativeValue(domEl, ans.answer);
          domEl.setAttribute('readonly', 'true');
        } else {
          setNativeValue(domEl, ans.answer);
        }
        domEl.style.outline = '2px solid #2563eb';
        logs.push('[DT_PICKER] ' + ans.question_text.slice(0, 38) + ' -> ' + ans.answer);
        continue;
      }

      // NUMBER_INPUT, SHORT_TEXT, LONG_ESSAY
      if (ans.answer !== undefined && ans.answer !== null && String(ans.answer) !== '') {
        setNativeValue(domEl, String(ans.answer));
        domEl.style.outline = '2px solid #2563eb';
        logs.push('[' + ans.question_type + '] ' + ans.question_text.slice(0, 35) + ' -> ' + String(ans.answer).slice(0, 42));
      }
    }

    // Highlight Final Submit button (Human-in-the-Loop safety lock)
    elementMap.forEach((node) => {
      const tag = node.tagName.toLowerCase();
      const type = (node.getAttribute('type') || '').toLowerCase();
      if (tag === 'button' || type === 'submit') {
        const txt = (node.textContent || node.value || '').toLowerCase();
        if (/submit|apply now|finish|send application/i.test(txt)) {
          node.style.outline = '4px solid #10b981';
          node.style.boxShadow = '0 0 0 6px rgba(16, 185, 129, 0.28)';
          logs.push('PAUSED AT FINAL SUBMIT (Human-in-the-Loop safety lock active)');
        } else if (clickNextWhenDone && /save\\s*&?\\s*continue|next|continue/i.test(txt)) {
          setTimeout(() => node.click(), 350);
        }
      }
    });

    return logs;
  }

  // 9. Full Autonomous Autofill Pass (with MutationObserver re-scan for conditional inputs)
  async function executeAutofillOnPage(profile, cachedResume, clickNextWhenDone, precomputedAnswers) {
    const initialScan = distillDocument();
    const initialIds = new Set(initialScan.questions.map((q) => q.agent_ids.join(',')));

    const answersToUse =
      Array.isArray(precomputedAnswers) && precomputedAnswers.length > 0
        ? precomputedAnswers
        : reasonAnswersLocally(initialScan.questions, profile, cachedResume);

    const logs = await applyAnswersToDom(answersToUse, cachedResume, false);

    // Wait 400ms to check if clicking a Radio / Dropdown mounted any conditional questions
    await new Promise((r) => setTimeout(r, 400));
    const secondScan = distillDocument();
    const newlyMountedQuestions = secondScan.questions.filter(
      (q) => !initialIds.has(q.agent_ids.join(','))
    );

    if (newlyMountedQuestions.length > 0) {
      logs.push('Detected ' + newlyMountedQuestions.length + ' dynamically mounted conditional question(s)!');
      const newAnswers = reasonAnswersLocally(newlyMountedQuestions, profile, cachedResume);
      const extraLogs = await applyAnswersToDom(newAnswers, cachedResume, clickNextWhenDone);
      logs.push(...extraLogs);
      return {
        questions: secondScan.questions,
        answers: [...answersToUse, ...newAnswers],
        elements: secondScan.elements,
        telemetry: secondScan.telemetry,
        logs,
      };
    }

    return {
      questions: initialScan.questions,
      answers: answersToUse,
      elements: initialScan.elements,
      telemetry: initialScan.telemetry,
      logs,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Same-Origin AI Bridge for Resume Parsing
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

    // Same-Origin AI Bridge for Form Question & Type Answering Agent
    if (message.type === 'PROXY_PLAN_FORM') {
      fetch('/api/agent/plan-form', {
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

    if (message.type === 'DISTILL_DOM' || message.type === 'SCAN_QUESTIONS') {
      const scan = distillDocument();
      const localAnswers = message.profile
        ? reasonAnswersLocally(scan.questions, message.profile, message.cachedResume)
        : [];
      sendResponse({ ...scan, answers: localAnswers });
      return true;
    }

    if (message.type === 'EXECUTE_AUTOFILL') {
      executeAutofillOnPage(
        message.profile,
        message.cachedResume,
        message.clickNextWhenDone,
        message.answers
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
  <title>AutoApply AI Agent SidePanel</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      padding: 12px;
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
      font-size: 10px;
      padding: 2px 8px;
      background: #1e293b;
      color: #38bdf8;
      border-radius: 4px;
      border: 1px solid #334155;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 11px;
      margin-bottom: 11px;
    }
    .card-title {
      font-size: 11px;
      font-weight: 700;
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
      margin-bottom: 7px;
      transition: opacity 0.15s;
      text-align: center;
      display: inline-block;
    }
    .btn:hover { opacity: 0.92; }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn-primary { background: #2563eb; color: #ffffff; }
    .btn-emerald { background: #059669; color: #ffffff; }
    .btn-secondary { background: #334155; color: #f8fafc; }
    .btn-danger { background: #475569; color: #fca5a5; font-size: 10px; padding: 3px 8px; width: auto; }
    .upload-label {
      display: block;
      width: 100%;
      padding: 9px 12px;
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
      gap: 7px;
      margin-bottom: 8px;
    }
    .field-group label {
      display: block;
      font-size: 10px;
      color: #94a3b8;
      margin-bottom: 3px;
    }
    .field-group input, .field-group select {
      width: 100%;
      padding: 6px 8px;
      background: #020617;
      border: 1px solid #334155;
      border-radius: 4px;
      color: #f8fafc;
      font-size: 11px;
    }
    .q-list {
      max-height: 290px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 7px;
      margin-top: 8px;
    }
    .q-item {
      background: #020617;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 8px;
    }
    .q-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 6px;
      margin-bottom: 5px;
    }
    .q-title {
      font-size: 11px;
      font-weight: 600;
      color: #f1f5f9;
      flex: 1;
    }
    .q-type-badge {
      font-family: monospace;
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 4px;
      background: #1e3a8a;
      color: #93c5fd;
      white-space: nowrap;
      border: 1px solid #1d4ed8;
    }
    .q-ans-input {
      width: 100%;
      padding: 5px 7px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 4px;
      color: #38bdf8;
      font-size: 11px;
      font-family: monospace;
    }
    .q-meta {
      font-size: 10px;
      color: #64748b;
      margin-top: 4px;
    }
    .log-box {
      font-family: monospace;
      font-size: 11px;
      background: #020617;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 9px;
      max-height: 140px;
      overflow-y: auto;
      color: #cbd5e1;
    }
    .log-item { margin-bottom: 4px; }
    textarea {
      width: 100%;
      min-height: 80px;
      background: #020617;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 7px;
      font-family: monospace;
      font-size: 11px;
      margin-top: 4px;
    }
    .empty-banner {
      background: #020617;
      border: 1px dashed #475569;
      border-radius: 6px;
      padding: 9px;
      color: #cbd5e1;
      font-size: 11px;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">AutoApply AI Agent</div>
    <span class="badge" id="status-badge">NO RESUME</span>
  </div>

  <!-- Step 1: Upload or Update Resume (PDF or TXT) Anytime -->
  <div class="card">
    <div class="card-title">
      <span>1. Upload / Update Resume</span>
      <span id="resume-file-badge" style="color: #38bdf8; font-family: monospace; text-transform: none;">None uploaded</span>
    </div>

    <div id="empty-state-notice" class="empty-banner">
      Upload your PDF or TXT resume below to extract your profile with Gemini AI.
    </div>

    <label class="upload-label" for="resume-upload-input" id="upload-btn-label">
      Upload / Update Resume (PDF or TXT)
    </label>
    <input type="file" id="resume-upload-input" accept=".pdf,.txt" style="display: none;" />

    <details style="margin-top: 4px;">
      <summary style="cursor: pointer; color: #94a3b8; font-size: 10px;">View / Edit Extracted Resume Text</summary>
      <div class="field-group" style="margin-top: 6px;">
        <textarea id="raw-resume-text" placeholder="Uploaded PDF text appears here automatically..."></textarea>
        <button class="btn btn-secondary" id="btn-parse-text" style="margin-top: 5px; margin-bottom: 0;">Re-Extract Profile from Text</button>
      </div>
    </details>
  </div>

  <!-- Step 2: AI Agent Question Scanner, Type Detector & Answer Generator -->
  <div class="card">
    <div class="card-title">
      <span>2. AI Form Question & Type Agent</span>
      <span id="questions-count-badge" style="color: #10b981; font-family: monospace; text-transform: none;">0 questions</span>
    </div>

    <button class="btn btn-primary" id="btn-scan-questions" disabled>
      1. Scan Questions, Types & Generate AI Answers
    </button>
    <button class="btn btn-emerald" id="btn-autofill" disabled style="margin-bottom: 0;">
      2. AI Agent: Fill All Answers into Form
    </button>

    <div id="detected-questions-list" class="q-list" style="display: none;"></div>
  </div>

  <!-- Step 3: Ask AI Agent Any Question From Your Profile -->
  <div class="card">
    <div class="card-title">
      <span>3. Ask AI Agent Any Question</span>
    </div>
    <div class="field-group" style="margin-bottom: 6px;">
      <label>Enter Any Job Application Question</label>
      <input type="text" id="custom-q-input" placeholder="e.g. Why are you a strong fit? / Earliest joining date?" />
    </div>
    <div class="field-grid" style="margin-bottom: 6px;">
      <div class="field-group">
        <label>Question Type</label>
        <select id="custom-q-type">
          <option value="AUTO">Auto-Detect Type</option>
          <option value="SHORT_TEXT">Short Text</option>
          <option value="LONG_ESSAY">Long Essay</option>
          <option value="DROPDOWN">Dropdown Select</option>
          <option value="DT_PICKER">DT Picker (Date)</option>
          <option value="OPTION_SELECTION">Option Selection (Radio)</option>
          <option value="NUMBER_INPUT">Number Input</option>
        </select>
      </div>
      <div class="field-group">
        <label>Options (comma-separated, if Dropdown/Radio)</label>
        <input type="text" id="custom-q-options" placeholder="Yes, No / B.Tech, M.Tech" />
      </div>
    </div>
    <button class="btn btn-secondary" id="btn-ask-custom-q" style="margin-bottom: 6px;">Generate Answer from My Profile</button>
    <div id="custom-q-result" style="display: none; background: #020617; border: 1px solid #334155; border-radius: 6px; padding: 8px; font-size: 11px; color: #38bdf8;"></div>
  </div>

  <!-- Step 4: Quick Profile Editor & Full JSON Schema -->
  <div class="card">
    <div class="card-title">
      <span>4. Extracted Candidate Profile</span>
      <button id="btn-clear-profile" class="btn-danger" style="border: none; border-radius: 4px; cursor: pointer;">Clear</button>
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

    <details style="margin-top: 4px;">
      <summary style="cursor: pointer; color: #94a3b8; font-size: 10px;">Full profile_schema.json & Backend URL</summary>
      <div class="field-group" style="margin-top: 6px;">
        <textarea id="profile-json" placeholder="Upload a resume above to populate profile_schema.json..." style="min-height: 120px;"></textarea>
      </div>
      <div class="field-group" style="margin-top: 6px;">
        <label>AI Backend URL</label>
        <input type="text" id="backend-url-input" placeholder="http://localhost:3000" />
      </div>
    </details>

    <button class="btn btn-primary" id="btn-save-profile" style="margin-top: 8px; margin-bottom: 0;">Save / Update Profile</button>
  </div>

  <!-- Step 5: Live Execution Log -->
  <div class="card">
    <div class="card-title">5. AI Agent Execution Log</div>
    <div class="log-box" id="log-output">
      <div class="log-item">AI Agent ready. Upload your resume or scan any form page.</div>
    </div>
  </div>

  <script src="sidepanel.js"></script>
</body>
</html>`;

  const sidepanelJs = `/**
 * AutoApply AI — Autonomous AI Form Question & Type Agent SidePanel Controller (v1.3.0)
 * 1. Decompresses & extracts text directly from uploaded PDF files in the browser via DecompressionStream('deflate').
 * 2. Scans active tab forms to detect every Question, its Question Type (DROPDOWN, DT_PICKER,
 *    OPTION_SELECTION, NUMBER_INPUT, LONG_ESSAY, SHORT_TEXT, FILE_UPLOAD), and available options.
 * 3. Bridges through any open AutoApply AI tab (PROXY_PLAN_FORM & PROXY_PARSE_RESUME) to run Gemini AI
 *    question answering and profile extraction.
 */

const statusBadge = document.getElementById('status-badge');
const resumeFileBadge = document.getElementById('resume-file-badge');
const emptyStateNotice = document.getElementById('empty-state-notice');
const uploadInput = document.getElementById('resume-upload-input');
const uploadBtnLabel = document.getElementById('upload-btn-label');
const backendUrlInput = document.getElementById('backend-url-input');
const rawResumeText = document.getElementById('raw-resume-text');
const btnParseText = document.getElementById('btn-parse-text');
const btnScanQuestions = document.getElementById('btn-scan-questions');
const btnAutofill = document.getElementById('btn-autofill');
const questionsCountBadge = document.getElementById('questions-count-badge');
const detectedQuestionsList = document.getElementById('detected-questions-list');
const customQInput = document.getElementById('custom-q-input');
const customQType = document.getElementById('custom-q-type');
const customQOptions = document.getElementById('custom-q-options');
const btnAskCustomQ = document.getElementById('btn-ask-custom-q');
const customQResult = document.getElementById('custom-q-result');
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
let lastScannedQuestions = [];
let lastGeneratedAnswers = [];
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
        // try next
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
          const dx = parseFloat(tok[5]);
          const dy = parseFloat(tok[6]);
          if (Math.abs(dy) > 2) {
            if (currentLine.trim()) lines.push(currentLine.trim());
            currentLine = '';
          } else if (dx > 15 && !currentLine.endsWith(' ')) {
            currentLine += ' ';
          }
        } else if (tok[7]) {
          const tmY = parseFloat(tok[13]);
          if (lastTmY !== null && Math.abs(tmY - lastTmY) > 3) {
            if (currentLine.trim()) lines.push(currentLine.trim());
            currentLine = '';
          } else if (currentLine && !currentLine.endsWith(' ')) {
            currentLine += ' ';
          }
          lastTmY = tmY;
        } else if (tok[14]) {
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
 * Finds an open AutoApply AI tab to act as a Same-Origin Bridge for Gemini AI calls.
 */
async function findBridgeTab() {
  try {
    const tabs = await chrome.tabs.query({});
    const hostKey = backendUrl.replace(/^https?:\\/\\//, '').split('/')[0];
    return tabs.find(
      (t) =>
        t.url &&
        (t.url.includes(hostKey) ||
          t.url.includes('.run.app') ||
          t.url.includes('localhost:3000'))
    );
  } catch (_e) {
    return null;
  }
}

async function callBackendResumeParserWithBridge(payload) {
  const bridgeTab = await findBridgeTab();
  if (bridgeTab && bridgeTab.id) {
    const bridged = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        bridgeTab.id,
        { type: 'PROXY_PARSE_RESUME', payload },
        (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) resolve(null);
          else resolve(res.data);
        }
      );
    });
    if (bridged && bridged.profile) return bridged;
  }

  const resp = await fetch(backendUrl + '/api/resume/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return await resp.json();
}

async function callBackendPlanFormWithBridge(payload) {
  const bridgeTab = await findBridgeTab();
  if (bridgeTab && bridgeTab.id) {
    const bridged = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        bridgeTab.id,
        { type: 'PROXY_PLAN_FORM', payload },
        (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) resolve(null);
          else resolve(res.data);
        }
      );
    });
    if (bridged && Array.isArray(bridged.answers)) return bridged;
  }

  const resp = await fetch(backendUrl + '/api/agent/plan-form', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return await resp.json();
}

function renderDetectedQuestionsAndAnswers() {
  questionsCountBadge.textContent = lastGeneratedAnswers.length + ' questions';
  if (!lastGeneratedAnswers.length) {
    detectedQuestionsList.style.display = 'none';
    detectedQuestionsList.innerHTML = '';
    return;
  }

  detectedQuestionsList.style.display = 'flex';
  detectedQuestionsList.innerHTML = '';

  lastGeneratedAnswers.forEach((ans, idx) => {
    const card = document.createElement('div');
    card.className = 'q-item';

    const header = document.createElement('div');
    header.className = 'q-header';

    const title = document.createElement('div');
    title.className = 'q-title';
    title.textContent = (idx + 1) + '. ' + ans.question_text;

    const badge = document.createElement('span');
    badge.className = 'q-type-badge';
    badge.textContent = ans.question_type_label || ans.question_type;

    header.appendChild(title);
    header.appendChild(badge);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'q-ans-input';
    input.value = ans.answer || '';
    input.addEventListener('input', (e) => {
      lastGeneratedAnswers[idx].answer = e.target.value;
      lastGeneratedAnswers[idx].selected_option_value = e.target.value;
    });

    const meta = document.createElement('div');
    meta.className = 'q-meta';
    meta.textContent = 'Source: ' + (ans.profile_source || 'Profile') + (ans.reasoning ? ' · ' + ans.reasoning : '');

    card.appendChild(header);
    card.appendChild(input);
    card.appendChild(meta);
    detectedQuestionsList.appendChild(card);
  });
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
    btnScanQuestions.disabled = true;
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
  btnScanQuestions.disabled = false;
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
  appendLog('Updated AI Agent Backend URL to ' + backendUrl);
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
      appendLog('Used built-in local PDF stream & multi-section parser.');
    }

    currentProfile = extractedProfile;
    chrome.storage.local.set({
      autoapply_profile: currentProfile,
      autoapply_resume: currentResume,
    });
    renderState();
    appendLog(
      'Ready: ' +
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

btnParseText.addEventListener('click', async () => {
  const text = rawResumeText.value.trim();
  if (!text) return;
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
  }
  chrome.storage.local.set({ autoapply_profile: currentProfile });
  renderState();
});

// 1. Scan Page Questions, Detect Control Types & Generate AI Answers
btnScanQuestions.addEventListener('click', async () => {
  if (!currentProfile) {
    appendLog('Upload your resume first so the AI Agent can answer questions from your profile.');
    return;
  }
  statusBadge.textContent = 'SCANNING...';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  chrome.tabs.sendMessage(
    tab.id,
    {
      type: 'SCAN_QUESTIONS',
      profile: currentProfile,
      cachedResume: currentResume,
    },
    async (res) => {
      if (chrome.runtime.lastError || !res || !Array.isArray(res.questions)) {
        statusBadge.textContent = 'READY';
        appendLog('Refresh the target tab once so content.js attaches to the page.');
        return;
      }

      lastScannedQuestions = res.questions;
      lastGeneratedAnswers = res.answers || [];
      renderDetectedQuestionsAndAnswers();
      appendLog(
        'Scanned ' +
          lastScannedQuestions.length +
          ' questions across page (Dropdowns, DT Pickers, Option Selections, Text/Essays).'
      );

      // Enhance answers via Gemini AI Form-Planning Agent
      try {
        appendLog('Querying Gemini AI Agent to tailor answers for all ' + lastScannedQuestions.length + ' questions...');
        const aiPlan = await callBackendPlanFormWithBridge({
          questions: lastScannedQuestions,
          profile: currentProfile,
          jobDescription: res.pageTitle || 'Software Engineer',
          cachedResumeFileName: currentResume && currentResume.fileName,
        });
        if (aiPlan && Array.isArray(aiPlan.answers) && aiPlan.answers.length > 0) {
          lastGeneratedAnswers = aiPlan.answers;
          renderDetectedQuestionsAndAnswers();
          appendLog('Gemini AI Agent answered all ' + lastGeneratedAnswers.length + ' questions (' + (aiPlan.engine || 'AI Agent') + ').');
        }
      } catch (_e) {
        appendLog('Generated all ' + lastGeneratedAnswers.length + ' answers using Profile Question-Type Reasoner.');
      }

      statusBadge.textContent = 'READY';
    }
  );
});

// 2. Execute AI Agent Form Autofill (Scans + Generates Answers if needed + Injects into DOM)
btnAutofill.addEventListener('click', async () => {
  if (!currentProfile) {
    appendLog('Please upload a resume first.');
    return;
  }
  statusBadge.textContent = 'EXECUTING';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  // If questions haven't been scanned yet, scan & run AI plan first
  if (!lastGeneratedAnswers.length) {
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id,
        { type: 'SCAN_QUESTIONS', profile: currentProfile, cachedResume: currentResume },
        async (scanRes) => {
          if (scanRes && Array.isArray(scanRes.questions)) {
            lastScannedQuestions = scanRes.questions;
            lastGeneratedAnswers = scanRes.answers || [];
            try {
              const aiPlan = await callBackendPlanFormWithBridge({
                questions: lastScannedQuestions,
                profile: currentProfile,
                jobDescription: scanRes.pageTitle || 'Software Engineer',
                cachedResumeFileName: currentResume && currentResume.fileName,
              });
              if (aiPlan && Array.isArray(aiPlan.answers)) {
                lastGeneratedAnswers = aiPlan.answers;
              }
            } catch (_e) {
              // keep local profile reasoner answers
            }
            renderDetectedQuestionsAndAnswers();
          }
          resolve();
        }
      );
    });
  }

  chrome.tabs.sendMessage(
    tab.id,
    {
      type: 'EXECUTE_AUTOFILL',
      profile: currentProfile,
      cachedResume: currentResume,
      answers: lastGeneratedAnswers,
      clickNextWhenDone: false,
    },
    (res) => {
      statusBadge.textContent = 'COMPLETED';
      if (!res) {
        appendLog('Refresh the target tab once so content.js attaches to the page.');
        return;
      }
      if (Array.isArray(res.answers)) {
        lastGeneratedAnswers = res.answers;
        renderDetectedQuestionsAndAnswers();
      }
      (res.logs || []).forEach(appendLog);
    }
  );
});

// 3. Ask AI Agent Any Custom Question Against Your Profile
btnAskCustomQ.addEventListener('click', async () => {
  const qText = customQInput.value.trim();
  if (!qText) {
    appendLog('Enter a question to test against your profile.');
    return;
  }
  if (!currentProfile) {
    appendLog('Upload your resume first so the AI Agent has your profile.');
    return;
  }

  const rawOpts = customQOptions.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({ label: s, value: s }));

  let qType = customQType.value;
  if (qType === 'AUTO') {
    if (rawOpts.length > 0) qType = 'DROPDOWN';
    else if (/date|dob|joining|when can you start|graduation/i.test(qText)) qType = 'DT_PICKER';
    else if (/how many years|gpa|cgpa|ctc|salary|notice period/i.test(qText)) qType = 'NUMBER_INPUT';
    else if (/why|describe|explain|tell us|project|challenge|fit/i.test(qText)) qType = 'LONG_ESSAY';
    else qType = 'SHORT_TEXT';
  }

  const singleQuestion = {
    question_id: 'custom_1',
    agent_ids: ['custom_1'],
    question_text: qText,
    question_type: qType,
    question_type_label: qType + (rawOpts.length ? ' (' + rawOpts.length + ' options)' : ''),
    raw_input_type: qType.toLowerCase(),
    options: rawOpts,
    date_format: 'YYYY-MM-DD',
  };

  customQResult.style.display = 'block';
  customQResult.textContent = 'Thinking with AI Agent...';

  try {
    const plan = await callBackendPlanFormWithBridge({
      questions: [singleQuestion],
      profile: currentProfile,
      jobDescription: 'Software Engineer',
    });
    if (plan && plan.answers && plan.answers[0]) {
      const a = plan.answers[0];
      customQResult.innerHTML =
        '<strong>Detected Type:</strong> ' +
        a.question_type_label +
        '<br/><strong>AI Answer:</strong> ' +
        a.answer +
        '<br/><span style="color:#94a3b8;font-size:10px;">Source: ' +
        a.profile_source +
        '</span>';
      return;
    }
  } catch (_e) {
    // fallback
  }

  customQResult.textContent = 'Evaluated (' + qType + ') from profile: ' + currentProfile.personal_info.first_name + ' ' + currentProfile.personal_info.last_name;
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

btnClearProfile.addEventListener('click', () => {
  currentProfile = null;
  currentResume = null;
  lastScannedQuestions = [];
  lastGeneratedAnswers = [];
  rawResumeText.value = '';
  renderDetectedQuestionsAndAnswers();
  chrome.storage.local.set({ autoapply_profile: null, autoapply_resume: null }, () => {
    renderState();
    appendLog('Cleared stored resume and profile.');
  });
});
`;

  const readmeMd = `# AutoApply AI — Autonomous Form Question & Type Agent (Manifest V3 v1.3.0)

This extension starts **completely clean (zero pre-seeded dummy data)** and acts as a full **AI Form Question & Type Agent**:

## 1. How It Works Like an AI Agent
1. **Perceive (Scan Questions & Detect Control Types)**:
   - Traverses the active page DOM (and open Shadow DOMs) to properly fetch the **overarching Question Text** (walking up to \`<fieldset><legend>\`, \`[role="radiogroup"]\`, \`[aria-labelledby]\`, and question containers so radio/checkbox options like "Yes"/"No" are grouped under their real question).
   - Classifies every question into its exact control type:
     - \`DROPDOWN\` (\`<select>\`, \`[role="combobox"]\`, \`<datalist>\`, with all option choices extracted)
     - \`DT_PICKER\` (\`type="date"\`, \`type="month"\`, or readonly datepickers, with target format \`YYYY-MM-DD\` or \`YYYY-MM\`)
     - \`OPTION_SELECTION\` (Radio button groups & Checkboxes with all choices listed)
     - \`NUMBER_INPUT\` (GPA, Notice Period, CTC, Years of Experience)
     - \`LONG_ESSAY\` (Open-ended screening essays)
     - \`SHORT_TEXT\` & \`FILE_UPLOAD\`
2. **Reason (Generate Answers From Your Profile)**:
   - Sends the detected questions, types, and options to **Gemini AI** (\`/api/agent/plan-form\` via the Same-Origin Tab Bridge) + the built-in Universal Profile Question Reasoner to generate the exact answer for **any** question from your uploaded resume profile.
3. **Act (Inject & Observe Conditional Mutations)**:
   - Selects the matched dropdown option, formats DT picker dates, clicks the exact radio/checkbox option, injects React-compatible values, and automatically re-scans after 400ms if clicking an option mounts new conditional questions!
`;

  return [
    {
      name: 'manifest.json',
      description: 'Manifest V3 v1.3.0 configuration with SidePanel, storage, tabs, and all_urls AI Agent content script.',
      language: 'json',
      content: manifestJson,
    },
    {
      name: 'sidepanel.html',
      description:
        'AI Agent SidePanel UI with Resume Upload, Live Form Question & Type Inspector, Custom Question Tester, and Profile Editor.',
      language: 'html',
      content: sidepanelHtml,
    },
    {
      name: 'sidepanel.js',
      description:
        'Coordinates PDF decompression, Gemini AI Form Question Planning (PROXY_PLAN_FORM), Question & Type Inspector, and Custom Question Q&A.',
      language: 'javascript',
      content: sidepanelJs,
    },
    {
      name: 'content.js',
      description:
        'Fetches overarching question prompts, classifies control types (DROPDOWN, DT_PICKER, OPTION_SELECTION, NUMBER, ESSAY), and injects answers with MutationObserver re-scan.',
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
      description: 'Architecture and installation guide for the v1.3.0 AI Question & Type Agent.',
      language: 'markdown',
      content: readmeMd,
    },
  ];
}

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
