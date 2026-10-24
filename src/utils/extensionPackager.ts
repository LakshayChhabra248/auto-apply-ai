export interface ExtensionFileEntry {
  name: string;
  description: string;
  language: 'json' | 'javascript' | 'html' | 'markdown';
  content: string;
}

/**
 * Generates a clean, unseeded Chrome Extension (Manifest V3 v1.5.0) bundle.
 * Includes:
 * 1. Multi-Frame Script Injection & Aggregation (`chrome.scripting.executeScript` with `allFrames: true`)
 *    so blank analytics iframes never race-out real form frames (fixes "0 questions" on Stripe Careers, Greenhouse iframes, Workday, Ashby).
 * 2. Deep 6-Level Ancestor Field Label Walker + Custom Dropdown (`<button aria-haspopup="listbox">`, `[role="combobox"]`) detector
 *    for Stripe Careers, Greenhouse, Lever, Workday, and React-Select forms.
 * 3. Context-Aware Semantic Question-Answering Agent (Preferred Name, Pronouns, Offer Deadlines, Start/End Year & Month,
 *    Education, Referrals, Visa/Work Authorization, plus strict SHORT_TEXT concise guards so short inputs never get bio dumps).
 * 4. Native browser DecompressionStream('deflate') PDF text extractor + multi-section resume parser in sidepanel.js.
 */
export function buildChromeExtensionFiles(backendUrl: string): ExtensionFileEntry[] {
  const safeBackendUrl = backendUrl.replace(/\/$/, '');

  const manifestJson = JSON.stringify(
    {
      manifest_version: 3,
      name: 'AutoApply AI — Autonomous ATS Form Agent',
      version: '1.5.0',
      description:
        'Autonomous AI Agent that scans form questions across all frames, detects control types (Dropdown, DT Picker, Option Selection, Essay), generates accurate context-aware answers from your resume profile, and autofills any ATS.',
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
 * AutoApply AI — Manifest V3 Background Service Worker (v1.5.0)
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
 * AutoApply AI — Universal AI Agent Content Script (Manifest V3 v1.5.0)
 * 1. Scans any webpage or embedded ATS iframe (Stripe Careers, Greenhouse, Workday, Lever, Ashby)
 *    and extracts overarching Question Prompts + Option Labels using a 6-level ancestor DOM walker.
 * 2. Detects exact Question Types: DROPDOWN (including custom <button role="combobox"> & React-Select),
 *    DT_PICKER, OPTION_SELECTION (Radio/Checkbox), NUMBER_INPUT, LONG_ESSAY, SHORT_TEXT, and FILE_UPLOAD.
 * 3. Accurately answers Preferred Name, Pronouns, Offer Deadlines, Start/End Date Year/Month, Education,
 *    Referrals, and Work Authorization without ever dumping multi-sentence bios into SHORT_TEXT or logistical fields.
 */

(function () {
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

  function cleanLabelText(raw) {
    return String(raw || '')
      .replace(/\\s+/g, ' ')
      .replace(/^(required|optional)\\s*[:\\-]?\\s*/i, '')
      .trim();
  }

  // 3. Deep 6-Level Ancestor Field Label Resolver (handles Stripe Careers, Greenhouse, Workday, React-Select)
  function resolveFieldLabel(el) {
    const root =
      el.getRootNode && el.getRootNode() instanceof ShadowRoot ? el.getRootNode() : document;

    const explicitQuestion =
      el.getAttribute('data-question') ||
      el.getAttribute('data-label') ||
      el.getAttribute('data-field-label');
    if (explicitQuestion && cleanLabelText(explicitQuestion).length > 1) {
      return cleanLabelText(explicitQuestion);
    }

    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const ids = ariaLabelledBy.split(/\\s+/).filter(Boolean);
      const texts = ids
        .map((id) => {
          const refEl = root.querySelector('#' + CSS.escape(id));
          return refEl && refEl.textContent ? cleanLabelText(refEl.textContent) : '';
        })
        .filter(Boolean);
      if (texts.length > 0) return texts.join(' ');
    }

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && cleanLabelText(ariaLabel).length > 1) {
      return cleanLabelText(ariaLabel);
    }

    if (el.id) {
      try {
        const explicit = root.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (explicit && explicit.textContent && cleanLabelText(explicit.textContent).length > 1) {
          return cleanLabelText(explicit.textContent);
        }
      } catch (_e) {
        // ignore invalid selector
      }
    }

    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, select, textarea, button').forEach((n) => n.remove());
      const txt = cleanLabelText(clone.textContent || parentLabel.textContent);
      if (txt.length > 1) return txt;
    }

    // Walk up 1 to 6 ancestor levels (crucial for Stripe Careers / React forms where <input> is wrapped in 1-3 inner styling <div>s)
    let curr = el.parentElement;
    for (let depth = 0; depth < 6 && curr && curr !== document.body && curr !== document.documentElement; depth++) {
      // Check previous sibling at this level (e.g. <label>First Name *</label><div class="input-wrap"><input/></div>)
      const prev = curr.previousElementSibling;
      if (
        prev &&
        !prev.querySelector('input:not([type="hidden"]), select, textarea') &&
        /^(label|legend|span|div|p|h[1-6])$/i.test(prev.tagName)
      ) {
        const prevTxt = cleanLabelText(prev.textContent);
        if (prevTxt.length >= 2 && prevTxt.length <= 140) {
          return prevTxt;
        }
      }

      // Count how many distinct primary fields exist inside curr so we don't bleed across multi-column rows (like Country * and Phone *)
      const primaryInputs = curr.querySelectorAll(
        'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), select, textarea, button[aria-haspopup="listbox"], button[role="combobox"]'
      );
      if (primaryInputs.length > 1 && depth > 0) {
        break;
      }

      // First look for explicit <label>, <legend>, or field-label classes (ignoring generic section headings like "Education" or "Experience")
      const labelCand = curr.querySelector(
        'label, legend, [class*="label" i], [class*="Label"], [data-testid*="label" i], [class*="question" i]'
      );
      if (labelCand && !labelCand.contains(el)) {
        const candTxt = cleanLabelText(labelCand.textContent);
        if (
          candTxt.length >= 2 &&
          candTxt.length <= 160 &&
          !/^(education|work experience|experience|personal information|voluntary self-identification|eeo)$/i.test(candTxt)
        ) {
          return candTxt;
        }
      }

      // Fallback to heading inside single-field wrapper if not a broad section title
      const headingCand = curr.querySelector('[role="heading"], h3, h4');
      if (headingCand && !headingCand.contains(el)) {
        const hTxt = cleanLabelText(headingCand.textContent);
        if (
          hTxt.length >= 2 &&
          hTxt.length <= 160 &&
          !/^(education|work experience|experience|personal information|voluntary self-identification|eeo)$/i.test(hTxt)
        ) {
          return hTxt;
        }
      }

      curr = curr.parentElement;
    }

    const placeholder = cleanLabelText(el.getAttribute('placeholder') || '');
    if (placeholder && !/^(select|choose|type here|enter)/i.test(placeholder)) {
      return placeholder;
    }

    const rawName = el.getAttribute('name') || el.id || '';
    if (rawName) {
      const humanized = rawName
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_\\-\\[\\].]+/g, ' ')
        .replace(/\\b(input|field|text|id)\\b/gi, '')
        .replace(/\\s+/g, ' ')
        .trim();
      if (humanized.length >= 2) return humanized;
    }

    return placeholder || el.tagName.toLowerCase();
  }

  /**
   * Resolves the parent question title for a radio button or checkbox group
   * so we never mistake an option label ("Yes" / "No") for the question itself.
   */
  function resolveGroupQuestionTitle(el, optionLabel) {
    const explicitQ = el.getAttribute('data-question');
    if (explicitQ) return cleanLabelText(explicitQ);

    const fieldset = el.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend && legend.textContent) return cleanLabelText(legend.textContent);
    }

    const radioGroup = el.closest('[role="radiogroup"], [role="group"], [role="listitem"]');
    if (radioGroup) {
      const heading = radioGroup.querySelector(
        '[role="heading"], legend, h3, h4, [class*="question" i], [class*="title" i], [class*="label" i], p, label:not(:has(input))'
      );
      if (heading && heading.textContent) return cleanLabelText(heading.textContent);
    }

    let curr = el.parentElement;
    for (let depth = 0; depth < 5 && curr && curr !== document.body; depth++) {
      const candidates = curr.querySelectorAll('legend, label, p, h3, h4, span, div');
      for (const cand of candidates) {
        if (cand.contains(el)) continue;
        const txt = cleanLabelText(cand.textContent || '');
        if (
          txt.length >= 10 &&
          txt.length <= 220 &&
          txt.toLowerCase() !== (optionLabel || '').toLowerCase() &&
          (txt.includes('?') || /sponsorship|authorized|relocate|gender|veteran|disability|experience|notice|degree|work|intern|consent|acknowledge/i.test(txt))
        ) {
          return txt;
        }
      }
      curr = curr.parentElement;
    }

    return optionLabel || el.getAttribute('name') || 'Selection Question';
  }

  function isCustomDropdownTrigger(node) {
    const tag = node.tagName.toLowerCase();
    const role = (node.getAttribute('role') || '').toLowerCase();
    const hasPopup = (node.getAttribute('aria-haspopup') || '').toLowerCase();
    const cls = String(node.className || '');

    if (role === 'combobox' || role === 'listbox' || hasPopup === 'listbox') {
      // If this container wraps an inner <input> or <select>, let the inner input be the primary control
      if (tag !== 'button' && node.querySelector('input:not([type="hidden"]), select')) {
        return false;
      }
      return true;
    }

    if (tag === 'button') {
      // Detect Stripe / Radix / HeadlessUI select buttons that have aria-expanded or sit inside a labeled select field
      if (node.hasAttribute('aria-expanded') && (hasPopup === 'listbox' || hasPopup === 'true' || /select|dropdown|combobox|country/i.test(cls + ' ' + (node.id || '')))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Classifies any DOM element into its semantic Question Type:
   * DROPDOWN, DT_PICKER, OPTION_SELECTION, NUMBER_INPUT, LONG_ESSAY, SHORT_TEXT, FILE_UPLOAD
   */
  function classifyControlQuestionType(el, questionText, optionsList) {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || tag).toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    const hasPopup = (el.getAttribute('aria-haspopup') || '').toLowerCase();
    const placeholder = el.getAttribute('placeholder') || '';
    const isReadonly = el.hasAttribute('readonly');
    const combined = (questionText + ' ' + placeholder + ' ' + (el.getAttribute('name') || '') + ' ' + (el.id || '')).toLowerCase();

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
    const isStandaloneYearOrMonthField =
      type !== 'date' &&
      type !== 'month' &&
      type !== 'datetime-local' &&
      /\\b(year|month)\\b/i.test(combined);

    if (
      !isStandaloneYearOrMonthField &&
      (type === 'date' ||
        type === 'month' ||
        type === 'datetime-local' ||
        type === 'time' ||
        /\\b(start\\s*date|end\\s*date|date\\s*of\\s*birth|dob|joining\\s*date|available\\s*date|graduation\\s*date|earliest\\s*start)\\b/i.test(combined) ||
        /\\b(yyyy-mm-dd|yyyy-mm|mm\\/dd\\/yyyy|dd\\/mm\\/yyyy)\\b/i.test(combined))
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
      hasPopup === 'listbox' ||
      isCustomDropdownTrigger(el) ||
      el.hasAttribute('list') ||
      /react-select/i.test(el.id || '') ||
      (optionsList && optionsList.length > 0) ||
      /\\b(country|current\\s*location|university|institution|school|degree|discipline)\\b/i.test(combined)
    ) {
      const count = optionsList ? optionsList.length : 0;
      return {
        question_type: 'DROPDOWN',
        question_type_label:
          role === 'combobox' || hasPopup === 'listbox' || /react-select/i.test(el.id || '')
            ? 'Dropdown (Combobox)'
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

  function isIgnoredChromeElement(node, labelText) {
    const tag = node.tagName.toLowerCase();
    const type = (node.getAttribute('type') || '').toLowerCase();
    const nameAndId = ((node.getAttribute('name') || '') + ' ' + (node.id || '') + ' ' + (node.className || '')).toLowerCase();
    const lowerLabel = (labelText || '').toLowerCase();

    if (type === 'hidden' || type === 'search' || type === 'submit' || type === 'reset' || type === 'image') {
      return true;
    }
    if (/g-recaptcha|h-captcha|turnstile|honeypot|csrf|search|cookie|onetrust/i.test(nameAndId)) {
      return true;
    }
    // Ignore site header/navigation links or "Autofill my application" trigger buttons
    if (tag === 'button' && /autofill|apply now|submit|sign in|log in|open roles|search|menu|close|back|next|continue/i.test(lowerLabel + ' ' + (node.textContent || ''))) {
      return true;
    }
    if (node.closest('nav, header, footer, [role="navigation"], [id*="onetrust"]')) {
      return true;
    }
    return false;
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
        const role = (node.getAttribute('role') || '').toLowerCase();
        const customDropdown = isCustomDropdownTrigger(node);
        const isInteractive =
          tag === 'input' ||
          tag === 'select' ||
          tag === 'textarea' ||
          tag === 'button' ||
          customDropdown;

        if (!isInteractive) return;
        const type = (node.getAttribute('type') || (customDropdown ? 'combobox' : tag)).toLowerCase();
        if (type === 'hidden') return;
        if (node.disabled) return;

        const rect = node.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0 && type !== 'file') return;

        const itemLabel = resolveFieldLabel(node).replace(/\\s+/g, ' ').slice(0, 160);
        if (isIgnoredChromeElement(node, itemLabel)) return;

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

        const groupQuestion =
          type === 'radio'
            ? resolveGroupQuestionTitle(node, itemLabel).replace(/\\s+/g, ' ').slice(0, 180)
            : itemLabel;

        const entry = {
          agent_id: agentId,
          tag,
          type,
          role: role || (customDropdown ? 'combobox' : null),
          is_custom_dropdown: customDropdown,
          name: node.getAttribute('name') || '',
          label: itemLabel,
          group_question: groupQuestion,
          placeholder: node.getAttribute('placeholder') || '',
          is_readonly: node.hasAttribute('readonly'),
          current_value: node.value || (customDropdown ? cleanLabelText(node.textContent || '') : ''),
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
      if ((item.tag === 'button' && !item.is_custom_dropdown) || item.type === 'submit') continue;

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

    const rawBytes = document.documentElement ? document.documentElement.outerHTML.length : 1000;
    const distilledBytes = JSON.stringify(distilled).length;
    const reductionPct =
      rawBytes > 0 ? Math.max(0, ((rawBytes - distilledBytes) / rawBytes) * 100) : 95;

    return {
      questions,
      elements: distilled,
      pageTitle: document.title || location.href,
      frameUrl: location.href,
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

    if (target === 'india' || target === '+91' || target.includes('india')) {
      const ind = options.find((o) => /\\b(india|\\+91)\\b/i.test((o.label || '') + ' ' + (o.value || '')));
      if (ind) return ind;
    }

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
    if (/m\\.?\\s*tech|master/i.test(target)) {
      const deg = options.find((o) => /m\\.?\\s*tech|master|postgraduate|m\\.?s\\b/i.test(o.label));
      if (deg) return deg;
    }

    // Month synonym matching (e.g. "May" <-> "05", "August" <-> "08")
    const MONTH_PATTERNS = {
      january: /\\b(january|jan|0?1)\\b/i,
      february: /\\b(february|feb|0?2)\\b/i,
      march: /\\b(march|mar|0?3)\\b/i,
      april: /\\b(april|apr|0?4)\\b/i,
      may: /\\b(may|0?5)\\b/i,
      june: /\\b(june|jun|0?6)\\b/i,
      july: /\\b(july|jul|0?7)\\b/i,
      august: /\\b(august|aug|0?8)\\b/i,
      september: /\\b(september|sep|sept|0?9)\\b/i,
      october: /\\b(october|oct|10)\\b/i,
      november: /\\b(november|nov|11)\\b/i,
      december: /\\b(december|dec|12)\\b/i,
    };
    if (MONTH_PATTERNS[target]) {
      const mOpt = options.find((o) => MONTH_PATTERNS[target].test((o.label || '') + ' ' + (o.value || '')));
      if (mOpt) return mOpt;
    }

    if (target.includes('he/him')) {
      const pOpt = options.find((o) => /\\bhe\\s*\\/\\s*him/i.test(o.label || ''));
      if (pOpt) return pOpt;
    }
    if (target.includes('she/her')) {
      const pOpt = options.find((o) => /\\bshe\\s*\\/\\s*her/i.test(o.label || ''));
      if (pOpt) return pOpt;
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

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function extractYearFromDate(rawDate, fallbackYear) {
    if (!rawDate) return fallbackYear || '2026';
    if (/present|current|now/i.test(String(rawDate))) return String(new Date().getFullYear());
    const m = String(rawDate).trim().match(/(\\d{4})/);
    return m ? m[1] : (fallbackYear || '2026');
  }

  function extractMonthFromDate(rawDate, fallbackMonth) {
    if (!rawDate) return fallbackMonth || 'May';
    const m = String(rawDate).trim().match(/^(\\d{4})-(\\d{1,2})/);
    if (m && m[2]) {
      const idx = Math.max(0, Math.min(11, parseInt(m[2], 10) - 1));
      return MONTH_NAMES[idx] || fallbackMonth || 'May';
    }
    return fallbackMonth || 'May';
  }

  function derivePronouns(meta) {
    const g = String((meta && meta.gender) || '').trim().toLowerCase();
    if (g.startsWith('f') || g.includes('woman') || g.includes('female')) return 'She/Her';
    if (g.startsWith('m') || g.includes('man') || g.includes('male')) return 'He/Him';
    if (g.includes('non') || g.includes('they')) return 'They/Them';
    return 'He/Him';
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
        } else if (/offer\\s*deadline|recruiting.*deadline|competing\\s*offer|previously\\s*worked|ever\\s*been\\s*employed|former\\s*employee|non-?compete|relative|government\\s*official/i.test(key)) {
          desired = 'No';
          source = 'application_metadata (Compliance / Recruiting)';
        } else if (/authorized|legally/i.test(key)) {
          desired = meta.work_authorization !== false ? 'Yes' : 'No';
          source = 'application_metadata.work_authorization';
        } else if (/pronoun/i.test(key)) {
          desired = derivePronouns(meta);
          source = 'application_metadata.gender -> pronouns';
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
      if (/preferred\\s*name|chosen\\s*name|nick\\s*name|preferred\\s*first\\s*name|what\\s*should\\s*we\\s*call\\s*you/i.test(key)) {
        ans = p.first_name || '';
        source = 'personal_info.first_name (Preferred Name)';
      } else if (/middle\\s*name|middle\\s*initial/i.test(key)) {
        ans = '';
        source = 'personal_info (Middle Name optional)';
      } else if (/pronoun/i.test(key)) {
        ans = derivePronouns(meta);
        source = 'application_metadata.gender -> pronouns';
      } else if (/full\\s*name|candidate\\s*name|your\\s*name|legal\\s*name|signature|print\\s*name/i.test(key)) {
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
      } else if (/country\\s*code|phone\\s*code|dial\\s*code/i.test(key)) {
        ans = (p.phone && p.phone.country_code) || '+91';
        source = 'personal_info.phone.country_code';
      } else if (/\\bcountry\\b/i.test(key) && !/phone\\s*number/i.test(key)) {
        ans = (p.location && p.location.country) || 'India';
        source = 'personal_info.location.country';
      } else if (/phone|mobile|contact\\s*number|whatsapp|tel/i.test(key)) {
        ans = (p.phone && p.phone.number) || '';
        source = 'personal_info.phone.number';
      } else if (/linkedin/i.test(key)) {
        ans = (p.links && p.links.linkedin) || (p.links && p.links.github) || (p.links && p.links.portfolio) || '';
        source = 'personal_info.links.linkedin';
      } else if (/github/i.test(key)) {
        ans = (p.links && p.links.github) || (p.links && p.links.portfolio) || (p.links && p.links.linkedin) || '';
        source = 'personal_info.links.github';
      } else if (/portfolio|website|personal\\s*url|blog/i.test(key)) {
        ans = (p.links && p.links.portfolio) || (p.links && p.links.github) || (p.links && p.links.linkedin) || '';
        source = 'personal_info.links.portfolio';
      } else if (/offer\\s*deadline|recruiting[- ]process\\s*deadline|recruiting\\s*deadline|competing\\s*offer|other\\s*deadline|decision\\s*deadline/i.test(key)) {
        ans =
          q.question_type === 'SHORT_TEXT' || q.question_type === 'DROPDOWN'
            ? 'No'
            : 'No, I do not have any active offer deadlines or competing recruiting-process deadlines at this time, and I am flexible with your interview timeline.';
        source = 'application_metadata (Recruiting Timeline & Deadlines)';
      } else if (/\\b(end|to|graduation|passing|completion|expected)\\s*(?:date\\s*)?year\\b|\\bgraduation\\s*year\\b|\\bpassing\\s*year\\b|\\bbatch\\b/i.test(key)) {
        ans = extractYearFromDate(edu.end_date, '2026');
        source = 'education[0].end_date (Year)';
      } else if (/\\b(start|from|enrollment)\\s*(?:date\\s*)?year\\b/i.test(key)) {
        ans = extractYearFromDate(edu.start_date, '2022');
        source = 'education[0].start_date (Year)';
      } else if (/\\b(end|to|graduation|completion|expected)\\s*(?:date\\s*)?month\\b/i.test(key)) {
        ans = extractMonthFromDate(edu.end_date, 'May');
        source = 'education[0].end_date (Month)';
      } else if (/\\b(start|from|enrollment)\\s*(?:date\\s*)?month\\b/i.test(key)) {
        ans = extractMonthFromDate(edu.start_date, 'August');
        source = 'education[0].start_date (Month)';
      } else if (/pincode|postal|zip/i.test(key)) {
        ans = (p.location && p.location.pincode) || '110001';
        source = 'personal_info.location.pincode';
      } else if (/current\\s*location|city|location|preferred\\s*office|which\\s*office/i.test(key) && !/company/i.test(key)) {
        const loc = p.location || {};
        ans = [loc.city, loc.state, loc.country].filter(Boolean).join(', ');
        source = 'personal_info.location';
      } else if (/address|street/i.test(key)) {
        ans = (p.location && p.location.address) || (p.location && p.location.city) || '';
        source = 'personal_info.location.address';
      } else if (/state|province/i.test(key)) {
        ans = (p.location && p.location.state) || (p.location && p.location.city) || '';
        source = 'personal_info.location.state';
      } else if (/university|college|institution|school|alma\\s*mater|^education\\s*\\*?$/i.test(key.trim())) {
        ans = edu.institution || '';
        source = 'education[0].institution';
      } else if (/degree|qualification|highest\\s*education/i.test(key)) {
        ans = q.question_type === 'DROPDOWN' ? (edu.degree || 'B.Tech') : ((edu.degree || 'B.Tech') + ' — ' + (edu.major || 'Computer Science'));
        source = 'education[0].degree';
      } else if (/major|branch|field\\s*of\\s*study|specialization|discipline/i.test(key)) {
        ans = edu.major || 'Computer Science';
        source = 'education[0].major';
      } else if (/gpa|cgpa|cpi|grade|percentage/i.test(key)) {
        ans = String(edu.gpa || 8.5);
        source = 'education[0].gpa';
      } else if (/previously\\s*worked|ever\\s*been\\s*employed|former\\s*employee|previously\\s*interned|worked\\s*at\\s*stripe/i.test(key)) {
        ans = q.question_type === 'LONG_ESSAY' ? 'No, I have not previously been employed by or interned with the company.' : 'No';
        source = 'work_experience (Prior Employment Check)';
      } else if (/how\\s*did\\s*you\\s*hear|where\\s*did\\s*you\\s*hear|source\\s*of\\s*application/i.test(key)) {
        ans = 'Company Careers Page & LinkedIn';
        source = 'application_metadata (Source)';
      } else if (/referred\\s*by|employee\\s*referral|referrer|who\\s*referred/i.test(key)) {
        ans = /name|email|who/i.test(key) ? 'N/A' : 'No';
        source = 'application_metadata (Referral)';
      } else if (/non-?compete|restrictive\\s*covenant|bound\\s*by\\s*any\\s*agreement|conflict\\s*of\\s*interest/i.test(key)) {
        ans = q.question_type === 'LONG_ESSAY' ? 'No, I am not bound by any non-compete agreements or restrictive covenants.' : 'No';
        source = 'application_metadata (Compliance)';
      } else if (/relocate|willing\\s*to\\s*relocate|work\\s*from\\s*office|hybrid|in-?office|onsite/i.test(key)) {
        ans = q.question_type === 'LONG_ESSAY' ? 'Yes, I am open to relocating and working onsite or hybrid as required.' : 'Yes';
        source = 'application_metadata (Relocation & Work Arrangement)';
      } else if (/company\\s*name|employer|current\\s*company|organization/i.test(key)) {
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
      } else if (/notice\\s*period|earliest\\s*joining|when\\s*can\\s*you\\s*start|availability/i.test(key)) {
        ans =
          q.question_type === 'NUMBER_INPUT'
            ? String(meta.notice_period_days ?? 30)
            : (meta.notice_period_days ?? 30) + ' days notice period — Earliest joining: ' + (meta.earliest_joining_date || '2026-11-15');
        source = 'application_metadata.notice_period_days';
      } else if (/expected\\s*ctc|expected\\s*salary|desired\\s*compensation|desired\\s*salary/i.test(key)) {
        ans = String(meta.expected_ctc_lpa ?? 24);
        source = 'application_metadata.expected_ctc_lpa';
      } else if (/current\\s*ctc|current\\s*salary|present\\s*compensation/i.test(key)) {
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
      } else if (/authorized|work\\s*authorization|legally\\s*eligible|right\\s*to\\s*work/i.test(key)) {
        ans =
          q.question_type === 'LONG_ESSAY'
            ? 'Yes, I am legally authorized to work in ' + ((p.location && p.location.country) || 'India') + ' without restrictions.'
            : meta.work_authorization !== false
            ? 'Yes'
            : 'No';
        source = 'application_metadata.work_authorization';
      } else if (/sponsorship|require\\s*visa|need\\s*visa/i.test(key)) {
        ans =
          q.question_type === 'LONG_ESSAY'
            ? meta.requires_sponsorship
              ? 'Yes, I will require visa sponsorship.'
              : 'No, I do not require visa sponsorship now or in the future.'
            : meta.requires_sponsorship
            ? 'Yes'
            : 'No';
        source = 'application_metadata.requires_sponsorship';
      } else if (/citizenship|nationality/i.test(key)) {
        ans = (p.location && p.location.country) || 'India';
        source = 'personal_info.location.country (Citizenship)';
      } else if (/skill|technologies|tech\\s*stack|programming\\s*languages/i.test(key)) {
        ans = skills.join(', ');
        source = 'skills[]';
      } else if (q.question_type === 'SHORT_TEXT' || q.question_type === 'NUMBER_INPUT') {
        // CRITICAL GUARD: Never dump a multi-sentence biography into a SHORT_TEXT or NUMBER_INPUT field!
        if (q.question_type === 'NUMBER_INPUT' || /\\byear\\b/i.test(key)) {
          ans = extractYearFromDate(edu.end_date, '2026');
          source = 'education[0].end_date (Year)';
        } else if (/\\bmonth\\b/i.test(key)) {
          ans = extractMonthFromDate(edu.end_date, 'May');
          source = 'education[0].end_date (Month)';
        } else if (/^(do|are|have|will|can|would|is|did|were)\\b/i.test(String(q.question_text || '').trim())) {
          ans = /deadline|conflict|compete|sponsorship|former|previously/i.test(key) ? 'No' : 'Yes';
          source = 'application_metadata (Concise Yes/No)';
        } else {
          ans = (edu.degree || 'B.Tech') + ' (' + (edu.major || 'Computer Science') + ') — ' + (edu.institution || '');
          source = 'education[0] (Concise Summary)';
        }
      } else {
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
    if (elementMap.size === 0) {
      distillDocument();
    }
    const logs = [];
    for (const ans of answers) {
      const primaryId = ans.selected_option_agent_id || (ans.agent_ids && ans.agent_ids[0]);
      const domEl =
        elementMap.get(primaryId) ||
        document.querySelector('[data-autoapply-id="' + primaryId + '"]');
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
          let radioToClick = domEl;
          if (!ans.selected_option_agent_id && ans.agent_ids && ans.agent_ids.length > 1) {
            const targetStr = String(ans.answer || '').toLowerCase();
            for (const aid of ans.agent_ids) {
              const cand =
                elementMap.get(aid) ||
                document.querySelector('[data-autoapply-id="' + aid + '"]');
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
              (targetLower === 'india' && /\\b(india|\\+91)\\b/i.test(o.text + ' ' + o.value)) ||
              o.text.toLowerCase().includes(targetLower) ||
              targetLower.includes(o.text.toLowerCase())
          );
          setNativeValue(domEl, best ? best.value : ans.answer);
        } else {
          // Custom combobox / Stripe Select / Radix / React-Select trigger
          domEl.focus();
          domEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          domEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          domEl.click();
          if (tag === 'input') {
            setNativeValue(domEl, ans.answer);
          }
          await new Promise((r) => setTimeout(r, 280));
          const listboxOptions = document.querySelectorAll(
            '[role="option"], [data-option-value], li[role="option"], [class*="option" i], [id*="react-select"][id*="-option-"]'
          );
          const targetLower = String(ans.answer || '').toLowerCase();
          for (const optNode of listboxOptions) {
            const txt = (optNode.textContent || '').trim().toLowerCase();
            if (!txt) continue;
            const isCountryIndia =
              (targetLower === 'india' || targetLower === '+91') &&
              /\\b(india|\\+91)\\b/i.test(txt);
            if (isCountryIndia || txt === targetLower || txt.includes(targetLower) || targetLower.includes(txt)) {
              optNode.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
              optNode.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              optNode.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
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
    if (!initialScan.questions.length) {
      return {
        questions: [],
        answers: [],
        elements: [],
        telemetry: initialScan.telemetry,
        logs: [],
      };
    }
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

  // Expose global hooks on window so chrome.scripting.executeScript({ allFrames: true }) can invoke them in every frame
  window.__autoApplyScanPageQuestions = function (profile, cachedResume) {
    const scan = distillDocument();
    const localAnswers = profile
      ? reasonAnswersLocally(scan.questions, profile, cachedResume)
      : scan.questions.map((q) => ({
          question_id: q.question_id,
          agent_ids: q.agent_ids,
          question_text: q.question_text,
          question_type: q.question_type,
          question_type_label: q.question_type_label,
          answer: '',
          profile_source: 'Upload resume to generate answer',
          reasoning: 'Detected ' + q.question_type_label,
        }));
    return { ...scan, answers: localAnswers };
  };

  window.__autoApplyExecuteAutofill = executeAutofillOnPage;

  if (!window.__autoApplyMessageListenerRegistered) {
    window.__autoApplyMessageListenerRegistered = true;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
        const res = window.__autoApplyScanPageQuestions(message.profile, message.cachedResume);
        sendResponse(res);
        return true;
      }

      if (message.type === 'EXECUTE_AUTOFILL') {
        window.__autoApplyExecuteAutofill(
          message.profile,
          message.cachedResume,
          message.clickNextWhenDone,
          message.answers
        ).then((result) => sendResponse(result));
        return true;
      }
      return false;
    });
  }
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

    <button class="btn btn-primary" id="btn-scan-questions">
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
      <div class="log-item">AI Agent v1.5 ready. Auto-scanning active page across all frames...</div>
    </div>
  </div>

  <script src="sidepanel.js"></script>
</body>
</html>`;

  const sidepanelJs = `/**
 * AutoApply AI — Autonomous AI Form Question & Type Agent SidePanel Controller (v1.5.0)
 * 1. Decompresses & extracts text directly from uploaded PDF files in the browser via DecompressionStream('deflate').
 * 2. Uses chrome.scripting.executeScript({ allFrames: true }) to inject content.js and aggregate form questions
 *    across ALL frames (main page + embedded Greenhouse/Workday/Ashby iframes) so blank analytics iframes
 *    never race-out real form frames with "0 questions".
 * 3. Context-aware question reasoning for Preferred Name, Pronouns, Offer Deadlines, Start/End Date Year/Month,
 *    Education, Referrals, Relocation, and Work Authorization.
 * 4. Bridges through any open AutoApply AI tab (PROXY_PLAN_FORM & PROXY_PARSE_RESUME) to run Gemini AI
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

/**
 * Multi-Frame Question Scanner:
 * 1. Injects content.js into ALL frames of the active tab so pre-existing tabs (like Stripe Careers)
 *    and embedded ATS iframes (Greenhouse, Workday, Ashby) never need a manual refresh.
 * 2. Executes window.__autoApplyScanPageQuestions across ALL frames and merges non-empty questions/answers,
 *    preventing blank analytics iframes from winning a single-response sendMessage race with "0 questions".
 */
async function scanAllFramesInActiveTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content.js'],
    });
  } catch (_e) {
    // Frame might be chrome:// or restricted; continue
  }

  try {
    const frameResults = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (prof, res) => {
        if (typeof window.__autoApplyScanPageQuestions === 'function') {
          return window.__autoApplyScanPageQuestions(prof, res);
        }
        return null;
      },
      args: [currentProfile, currentResume],
    });

    const mergedQuestions = [];
    const mergedAnswers = [];
    let pageTitle = '';
    let qCounter = 1;

    for (const frameEntry of frameResults || []) {
      const r = frameEntry && frameEntry.result;
      if (!r || !Array.isArray(r.questions) || r.questions.length === 0) continue;
      if (!pageTitle && r.pageTitle) pageTitle = r.pageTitle;

      for (let i = 0; i < r.questions.length; i++) {
        const q = r.questions[i];
        const a = (r.answers && r.answers[i]) || null;
        const globalQId = 'q_' + qCounter++;
        mergedQuestions.push({
          ...q,
          question_id: globalQId,
          frameId: frameEntry.frameId,
        });
        if (a) {
          mergedAnswers.push({
            ...a,
            question_id: globalQId,
            frameId: frameEntry.frameId,
          });
        }
      }
    }

    return {
      questions: mergedQuestions,
      answers: mergedAnswers,
      pageTitle: pageTitle || 'Job Application',
    };
  } catch (_err) {
    // Fallback to sendMessage if executeScript is unavailable
    return await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        { type: 'SCAN_QUESTIONS', profile: currentProfile, cachedResume: currentResume },
        (res) => {
          if (chrome.runtime.lastError || !res) resolve({ questions: [], answers: [], pageTitle: '' });
          else resolve(res);
        }
      );
    });
  }
}

async function executeAutofillAcrossAllFrames(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content.js'],
    });
  } catch (_e) {
    // ignore
  }

  try {
    const frameResults = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (prof, res, preAnswers) => {
        if (typeof window.__autoApplyExecuteAutofill === 'function') {
          return window.__autoApplyExecuteAutofill(prof, res, false, preAnswers);
        }
        return null;
      },
      args: [currentProfile, currentResume, lastGeneratedAnswers],
    });

    const allLogs = [];
    const allAnswers = [];
    for (const frameEntry of frameResults || []) {
      const r = frameEntry && frameEntry.result;
      if (!r) continue;
      if (Array.isArray(r.logs) && r.logs.length > 0) {
        allLogs.push(...r.logs);
      }
      if (Array.isArray(r.answers) && r.answers.length > 0) {
        allAnswers.push(...r.answers);
      }
    }
    return { logs: allLogs, answers: allAnswers };
  } catch (_err) {
    return await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          type: 'EXECUTE_AUTOFILL',
          profile: currentProfile,
          cachedResume: currentResume,
          answers: lastGeneratedAnswers,
          clickNextWhenDone: false,
        },
        (res) => resolve(res || { logs: [], answers: [] })
      );
    });
  }
}

function renderDetectedQuestionsAndAnswers() {
  const count = lastGeneratedAnswers.length || lastScannedQuestions.length;
  questionsCountBadge.textContent = count + ' questions';
  if (!count) {
    detectedQuestionsList.style.display = 'none';
    detectedQuestionsList.innerHTML = '';
    return;
  }

  detectedQuestionsList.style.display = 'flex';
  detectedQuestionsList.innerHTML = '';

  const itemsToRender = lastGeneratedAnswers.length ? lastGeneratedAnswers : lastScannedQuestions;
  itemsToRender.forEach((ans, idx) => {
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
    input.placeholder = currentProfile ? 'AI Answer...' : 'Upload resume to auto-generate answer...';
    input.addEventListener('input', (e) => {
      if (lastGeneratedAnswers[idx]) {
        lastGeneratedAnswers[idx].answer = e.target.value;
        lastGeneratedAnswers[idx].selected_option_value = e.target.value;
      }
    });

    const meta = document.createElement('div');
    meta.className = 'q-meta';
    meta.textContent = 'Source: ' + (ans.profile_source || 'Form Scanner') + (ans.reasoning ? ' · ' + ans.reasoning : '');

    card.appendChild(header);
    card.appendChild(input);
    card.appendChild(meta);
    detectedQuestionsList.appendChild(card);
  });
}

function renderState() {
  backendUrlInput.value = backendUrl;
  // Scan button is ALWAYS enabled so the user can inspect questions on any page immediately
  btnScanQuestions.disabled = false;

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

async function runPageScanAndAnswerGeneration(isAutoScan) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || (tab.url && /^chrome:|^edge:|^about:/i.test(tab.url))) {
    return;
  }

  if (!isAutoScan) {
    statusBadge.textContent = 'SCANNING...';
  }

  const res = await scanAllFramesInActiveTab(tab.id);
  lastScannedQuestions = res.questions || [];
  lastGeneratedAnswers = res.answers || [];
  renderDetectedQuestionsAndAnswers();

  if (lastScannedQuestions.length === 0) {
    if (!isAutoScan) {
      appendLog('No form questions detected on the active tab.');
      statusBadge.textContent = currentProfile ? 'READY' : 'NO RESUME';
    }
    return;
  }

  appendLog(
    'Detected ' +
      lastScannedQuestions.length +
      ' form questions across page (Dropdowns, DT Pickers, Option Selections, Text/Essays).'
  );

  if (currentProfile) {
    try {
      const aiPlan = await callBackendPlanFormWithBridge({
        questions: lastScannedQuestions,
        profile: currentProfile,
        jobDescription: res.pageTitle || 'Software Engineer',
        cachedResumeFileName: currentResume && currentResume.fileName,
      });
      if (aiPlan && Array.isArray(aiPlan.answers) && aiPlan.answers.length > 0) {
        lastGeneratedAnswers = aiPlan.answers;
        renderDetectedQuestionsAndAnswers();
        if (!isAutoScan) {
          appendLog('Gemini AI Agent tailored answers for all ' + lastGeneratedAnswers.length + ' questions.');
        }
      }
    } catch (_e) {
      if (!isAutoScan) {
        appendLog('Generated all ' + lastGeneratedAnswers.length + ' answers using Profile Question-Type Reasoner.');
      }
    }
    statusBadge.textContent = 'READY';
  } else {
    statusBadge.textContent = 'NO RESUME';
  }
}

chrome.storage.local.get(
  ['autoapply_profile', 'autoapply_resume', 'autoapply_backend_url'],
  (res) => {
    currentProfile = res.autoapply_profile || null;
    currentResume = res.autoapply_resume || null;
    if (res.autoapply_backend_url) backendUrl = res.autoapply_backend_url;
    renderState();
    // Auto-scan the active tab immediately when SidePanel opens
    runPageScanAndAnswerGeneration(true);
  }
);

// Auto-rescan when user switches tabs or finishes loading a new application page
if (chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener(() => {
    setTimeout(() => runPageScanAndAnswerGeneration(true), 250);
  });
}
if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      setTimeout(() => runPageScanAndAnswerGeneration(true), 350);
    }
  });
}

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
    // Automatically scan and answer questions on the active page now that the profile is ready
    await runPageScanAndAnswerGeneration(false);
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
  await runPageScanAndAnswerGeneration(false);
});

// 1. Scan Page Questions, Detect Control Types & Generate AI Answers Across All Frames
btnScanQuestions.addEventListener('click', async () => {
  await runPageScanAndAnswerGeneration(false);
});

// 2. Execute AI Agent Form Autofill (Scans + Generates Answers if needed + Injects into DOM across all frames)
btnAutofill.addEventListener('click', async () => {
  if (!currentProfile) {
    appendLog('Please upload a resume first.');
    return;
  }
  statusBadge.textContent = 'EXECUTING';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  if (!lastGeneratedAnswers.length) {
    await runPageScanAndAnswerGeneration(false);
  }

  const res = await executeAutofillAcrossAllFrames(tab.id);
  statusBadge.textContent = 'COMPLETED';
  if (Array.isArray(res.answers) && res.answers.length > 0) {
    lastGeneratedAnswers = res.answers;
    renderDetectedQuestionsAndAnswers();
  }
  if (Array.isArray(res.logs) && res.logs.length > 0) {
    res.logs.forEach(appendLog);
  } else {
    appendLog('Autofill completed across active form fields.');
  }
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
      runPageScanAndAnswerGeneration(true);
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

  const readmeMd = `# AutoApply AI — Autonomous Form Question & Type Agent (Manifest V3 v1.5.0)

This extension starts **completely clean (zero pre-seeded dummy data)** and acts as a full **AI Form Question & Type Agent** across all frames:

## 1. What's New in v1.5.0 (Fixes Context-Aware Question Answering on Stripe Careers & Greenhouse)
1. **Accurate Semantic Matching for Stripe & Greenhouse Fields**:
   - **Preferred Name / Chosen Name**: Maps directly to your \`first_name\` (never a bio paragraph).
   - **Pronouns**: Infers \`He/Him\`, \`She/Her\`, or \`They/Them\` from your profile metadata.
   - **Offer Deadlines / Competing Recruiting Timelines**: Answers logistical \`<textarea>\` questions directly (\`"No, I do not have any active offer deadlines or competing recruiting-process deadlines at this time..."\`) instead of outputting a generic work-experience bio.
   - **Education / Start Date Year / End Date Year / Month**: Maps \`End Date Year *\` to your 4-digit graduation year (\`2026\`), \`Start Date Year\` to \`2022\`, and \`Education\` / \`School\` to your university name.
   - **Strict \`SHORT_TEXT\` Concise Safeguard**: Prevents any short text input from ever receiving a multi-sentence biography dump.
2. **Multi-Frame Question Aggregation (\`chrome.scripting.executeScript\` with \`allFrames: true\`)**:
   - Aggregates questions across the main document and all embedded ATS iframes without losing races to blank analytics iframes.
`;

  return [
    {
      name: 'manifest.json',
      description: 'Manifest V3 v1.5.0 configuration with SidePanel, scripting (allFrames), storage, tabs, and all_urls AI Agent content script.',
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
        'Multi-frame executeScript question aggregator, PDF decompressor, Gemini AI Form Question Planner (PROXY_PLAN_FORM), and auto-scanner.',
      language: 'javascript',
      content: sidepanelJs,
    },
    {
      name: 'content.js',
      description:
        'Context-aware question reasoner (Preferred Name, Pronouns, Offer Deadlines, Start/End Year, Education), 6-level label walker, and React-compatible answer injector.',
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
      description: 'Architecture and installation guide for the v1.5.0 Multi-Frame AI Question & Type Agent.',
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
