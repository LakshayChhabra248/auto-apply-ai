import { UserProfileSchema, DistilledElement } from '../types/autoapply';

export type QuestionControlType =
  | 'DROPDOWN'
  | 'DT_PICKER'
  | 'OPTION_SELECTION'
  | 'NUMBER_INPUT'
  | 'LONG_ESSAY'
  | 'SHORT_TEXT'
  | 'FILE_UPLOAD';

export interface QuestionOptionItem {
  label: string;
  value: string;
  agent_id?: string;
}

export interface DetectedFormQuestion {
  question_id: string;
  agent_ids: string[];
  question_text: string;
  question_type: QuestionControlType;
  question_type_label: string;
  raw_input_type: string;
  options: QuestionOptionItem[];
  date_format?: 'YYYY-MM-DD' | 'YYYY-MM' | 'MM/DD/YYYY' | 'YYYY';
  required?: boolean;
  placeholder?: string;
  section_context?: string;
  in_shadow_dom?: boolean;
}

export interface AgentQuestionAnswer {
  question_id: string;
  agent_ids: string[];
  question_text: string;
  question_type: QuestionControlType;
  question_type_label: string;
  answer: string;
  selected_option_agent_id?: string;
  selected_option_value?: string;
  confidence: number;
  profile_source: string;
  reasoning: string;
}

/**
 * Determines the semantic QuestionControlType and human-readable label
 * for a distilled form element or grouped control.
 */
export function classifyQuestionControlType(el: {
  tag: string;
  type: string;
  label: string;
  placeholder?: string;
  options?: string[] | null;
  role?: string | null;
  is_readonly?: boolean;
}): {
  question_type: QuestionControlType;
  question_type_label: string;
  date_format?: 'YYYY-MM-DD' | 'YYYY-MM' | 'MM/DD/YYYY' | 'YYYY';
} {
  const tag = (el.tag || '').toLowerCase();
  const type = (el.type || '').toLowerCase();
  const role = (el.role || '').toLowerCase();
  const combined = `${el.label || ''} ${el.placeholder || ''}`.toLowerCase();

  if (type === 'file') {
    return {
      question_type: 'FILE_UPLOAD',
      question_type_label: 'File Upload (PDF)',
    };
  }

  if (type === 'radio') {
    return {
      question_type: 'OPTION_SELECTION',
      question_type_label: 'Option Selection (Radio)',
    };
  }

  if (type === 'checkbox') {
    return {
      question_type: 'OPTION_SELECTION',
      question_type_label: 'Option Selection (Checkbox)',
    };
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
    /\b(year|month)\b/i.test(combined);

  if (
    !isStandaloneYearOrMonthField &&
    (type === 'date' ||
      type === 'month' ||
      type === 'datetime-local' ||
      type === 'time' ||
      /\b(start\s*date|end\s*date|date\s*of\s*birth|dob|joining\s*date|available\s*date|graduation\s*date)\b/i.test(
        combined
      ) ||
      /\b(yyyy-mm-dd|yyyy-mm|mm\/dd\/yyyy|dd\/mm\/yyyy)\b/i.test(combined))
  ) {
    let dateFormat: 'YYYY-MM-DD' | 'YYYY-MM' | 'MM/DD/YYYY' | 'YYYY' = 'YYYY-MM-DD';
    if (
      type === 'month' ||
      (/\byyyy-mm\b/i.test(combined) && !/\byyyy-mm-dd\b/i.test(combined)) ||
      (el.is_readonly && /\b(start\s*date|end\s*date)\b/i.test(combined))
    ) {
      dateFormat = 'YYYY-MM';
    } else if (/\bmm\/dd\/yyyy\b/i.test(combined)) {
      dateFormat = 'MM/DD/YYYY';
    }
    return {
      question_type: 'DT_PICKER',
      question_type_label: `DT Picker (${dateFormat})`,
      date_format: dateFormat,
    };
  }

  if (
    tag === 'select' ||
    role === 'combobox' ||
    role === 'listbox' ||
    type === 'combobox' ||
    type === 'dropdown' ||
    (Array.isArray(el.options) && el.options.length > 0) ||
    /\b(country|current\s*location|city|university|institution|school|degree|discipline)\b/i.test(
      combined
    )
  ) {
    const optCount = Array.isArray(el.options) ? el.options.length : 0;
    return {
      question_type: 'DROPDOWN',
      question_type_label:
        role === 'combobox' || /\b(location|university|school|country)\b/i.test(combined)
          ? 'Dropdown (Combobox)'
          : optCount > 0
          ? `Dropdown (${optCount} options)`
          : 'Dropdown Select',
    };
  }

  if (
    type === 'number' ||
    /\b(cgpa|gpa|cpi|notice\s*period\s*\(days\)|expected\s*ctc|current\s*ctc|years\s*of\s*experience|how\s*many\s*years)\b/i.test(
      combined
    )
  ) {
    return {
      question_type: 'NUMBER_INPUT',
      question_type_label: 'Number Input',
    };
  }

  if (tag === 'textarea') {
    return {
      question_type: 'LONG_ESSAY',
      question_type_label: 'Long Text / Screening Essay',
    };
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

/**
 * Formats a profile date (e.g. "2024-05", "2024-05-15", "Present") into the target DT Picker format.
 */
export function formatProfileDateForPicker(
  rawDate: string | undefined,
  dateFormat: 'YYYY-MM-DD' | 'YYYY-MM' | 'MM/DD/YYYY' | 'YYYY' = 'YYYY-MM-DD',
  fallback = '2025-05'
): string {
  const clean = (rawDate || fallback).trim();
  if (/present|current|now/i.test(clean)) {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = '01';
    if (dateFormat === 'YYYY') return yyyy;
    if (dateFormat === 'YYYY-MM') return `${yyyy}-${mm}`;
    if (dateFormat === 'MM/DD/YYYY') return `${mm}/${dd}/${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  }

  const match = clean.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  const yyyy = match?.[1] || '2025';
  const mm = String(match?.[2] || '05').padStart(2, '0');
  const dd = String(match?.[3] || '15').padStart(2, '0');

  if (dateFormat === 'YYYY') return yyyy;
  if (dateFormat === 'YYYY-MM') return `${yyyy}-${mm}`;
  if (dateFormat === 'MM/DD/YYYY') return `${mm}/${dd}/${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Converts a list of DistilledElements into grouped, properly labeled DetectedFormQuestions.
 * Automatically groups radio buttons sharing a name or question context into a single OPTION_SELECTION question,
 * while preserving custom <button role="combobox"> dropdowns (such as Stripe Careers "Country *").
 */
export function convertDistilledElementsToQuestions(
  elements: DistilledElement[]
): DetectedFormQuestion[] {
  const questions: DetectedFormQuestion[] = [];
  const radioGroups = new Map<string, DistilledElement[]>();
  let qCounter = 1;

  const isDropdownButton = (el: DistilledElement) =>
    el.role === 'combobox' ||
    el.role === 'listbox' ||
    el.type === 'combobox' ||
    el.type === 'dropdown' ||
    (Array.isArray(el.options) && el.options.length > 0);

  for (const el of elements) {
    if (el.tag === 'button' && !isDropdownButton(el)) continue;
    if (el.type === 'radio') {
      const groupKey = el.name || `radio_group_${el.in_shadow_dom ? 'shadow' : 'main'}`;
      const existing = radioGroups.get(groupKey) || [];
      existing.push(el);
      radioGroups.set(groupKey, existing);
    }
  }

  const emittedRadioGroups = new Set<string>();

  for (const el of elements) {
    if (el.tag === 'button' && !isDropdownButton(el)) continue;

    if (el.type === 'radio') {
      const groupKey = el.name || `radio_group_${el.in_shadow_dom ? 'shadow' : 'main'}`;
      if (emittedRadioGroups.has(groupKey)) continue;
      emittedRadioGroups.add(groupKey);

      const groupEls = radioGroups.get(groupKey) || [el];
      let questionText = el.label;
      const optionLabels = groupEls.map((g) => g.label.trim());
      const combinedOpts = optionLabels.join(' ').toLowerCase();

      if (
        questionText.toLowerCase().startsWith('yes') ||
        questionText.toLowerCase().startsWith('no') ||
        questionText.length < 18
      ) {
        if (combinedOpts.includes('sponsorship') || combinedOpts.includes('notice')) {
          questionText =
            'Do you require visa sponsorship or is your notice period greater than 30 days?';
        } else if (combinedOpts.includes('authorized') || combinedOpts.includes('legally')) {
          questionText = 'Are you legally authorized to work in this country?';
        } else if (combinedOpts.includes('relocate')) {
          questionText = 'Are you willing to relocate for this role?';
        } else {
          questionText = `Select an option (${el.name || 'Screening Question'})`;
        }
      }

      questions.push({
        question_id: `q_${qCounter++}`,
        agent_ids: groupEls.map((g) => g.agent_id),
        question_text: questionText,
        question_type: 'OPTION_SELECTION',
        question_type_label: `Option Selection (Radio · ${groupEls.length} choices)`,
        raw_input_type: 'radio',
        options: groupEls.map((g) => ({
          label: g.label,
          value: g.current_value || g.label,
          agent_id: g.agent_id,
        })),
        in_shadow_dom: Boolean(el.in_shadow_dom),
      });
      continue;
    }

    const classified = classifyQuestionControlType(el);
    const options: QuestionOptionItem[] = Array.isArray(el.options)
      ? el.options
          .filter((o) => !/^(--|select|choose)/i.test(o.trim()))
          .map((o) => ({ label: o, value: o }))
      : [];

    questions.push({
      question_id: `q_${qCounter++}`,
      agent_ids: [el.agent_id],
      question_text: el.label || el.placeholder || el.name || `Field ${qCounter}`,
      question_type: classified.question_type,
      question_type_label: classified.question_type_label,
      raw_input_type: el.type || el.tag,
      options,
      date_format: classified.date_format,
      placeholder: el.placeholder,
      in_shadow_dom: Boolean(el.in_shadow_dom),
    });
  }

  return questions;
}

/**
 * Selects the best matching option from a Dropdown or Option Selection list
 * given a desired target answer and candidate context.
 */
export function matchBestOption(
  options: QuestionOptionItem[],
  desiredValue: string,
  questionText = ''
): QuestionOptionItem | null {
  if (!options || options.length === 0) return null;
  const target = (desiredValue || '').trim().toLowerCase();
  if (!target) return options[0];

  // 1. Exact value or label match
  const exact = options.find(
    (o) => o.value.trim().toLowerCase() === target || o.label.trim().toLowerCase() === target
  );
  if (exact) return exact;

  // 2. Country / Phone Country Code matching (e.g. "India" <-> "India (+91)" <-> "+91")
  if (target === 'india' || target === '+91' || target.includes('india')) {
    const indiaMatch = options.find((o) => /\b(india|\+91)\b/i.test(`${o.label} ${o.value}`));
    if (indiaMatch) return indiaMatch;
  }

  // 3. Yes / No semantic matching for Option Selection
  if (target === 'yes' || target === 'true') {
    const yesMatch = options.find((o) =>
      /\b(yes|true|authorized|i\s*am\s*authorized|agree|willing)\b/i.test(o.label)
    );
    if (yesMatch) return yesMatch;
  }
  if (target === 'no' || target === 'false') {
    const noMatch = options.find((o) =>
      /\b(no|false|do\s*not\s*have|not\s*a\s*protected|no\s*—)\b/i.test(o.label)
    );
    if (noMatch) return noMatch;
  }

  // 4. Degree synonym matching (e.g., B.Tech -> Bachelor's / Bachelor of Technology)
  if (/b\.?\s*tech|bachelor/i.test(target)) {
    const degMatch = options.find((o) => /b\.?\s*tech|bachelor|undergraduate|b\.?\s*e\b/i.test(o.label));
    if (degMatch) return degMatch;
  }
  if (/m\.?\s*tech|master/i.test(target)) {
    const degMatch = options.find((o) => /m\.?\s*tech|master|postgraduate|m\.?\s*s\b/i.test(o.label));
    if (degMatch) return degMatch;
  }

  // 4b. Month name / number synonym matching (e.g. "May" <-> "05" <-> "5 - May", "August" <-> "08" <-> "Aug")
  const MONTH_SYNONYMS: Record<string, RegExp> = {
    january: /\b(january|jan|0?1)\b/i,
    february: /\b(february|feb|0?2)\b/i,
    march: /\b(march|mar|0?3)\b/i,
    april: /\b(april|apr|0?4)\b/i,
    may: /\b(may|0?5)\b/i,
    june: /\b(june|jun|0?6)\b/i,
    july: /\b(july|jul|0?7)\b/i,
    august: /\b(august|aug|0?8)\b/i,
    september: /\b(september|sep|sept|0?9)\b/i,
    october: /\b(october|oct|10)\b/i,
    november: /\b(november|nov|11)\b/i,
    december: /\b(december|dec|12)\b/i,
  };
  if (MONTH_SYNONYMS[target]) {
    const mMatch = options.find((o) => MONTH_SYNONYMS[target].test(`${o.label} ${o.value}`));
    if (mMatch) return mMatch;
  }

  // 4c. Pronouns matching (e.g. "He/Him" <-> "He / Him / His")
  if (target.includes('he/him')) {
    const pMatch = options.find((o) => /\bhe\s*\/\s*him/i.test(o.label));
    if (pMatch) return pMatch;
  }
  if (target.includes('she/her')) {
    const pMatch = options.find((o) => /\bshe\s*\/\s*her/i.test(o.label));
    if (pMatch) return pMatch;
  }

  // 5. Substring containment
  const substringMatch = options.find(
    (o) =>
      o.label.toLowerCase().includes(target) ||
      target.includes(o.label.toLowerCase()) ||
      o.value.toLowerCase().includes(target)
  );
  if (substringMatch) return substringMatch;

  // 6. Token overlap scoring
  const targetTokens = target.split(/[^a-z0-9+]+/).filter((t) => t.length >= 2);
  let bestOpt = options[0];
  let bestScore = -1;
  for (const opt of options) {
    const optLower = `${opt.label} ${opt.value}`.toLowerCase();
    let score = 0;
    for (const tok of targetTokens) {
      if (optLower.includes(tok)) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestOpt = opt;
    }
  }

  if (bestScore > 0) return bestOpt;
  void questionText;
  return options[0];
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function extractMonthNameFromDateStr(rawDate: string | undefined, fallbackMonth = 'May'): string {
  if (!rawDate) return fallbackMonth;
  const match = rawDate.trim().match(/^(\d{4})-(\d{1,2})/);
  if (match && match[2]) {
    const idx = Math.max(0, Math.min(11, parseInt(match[2], 10) - 1));
    return MONTH_NAMES[idx] || fallbackMonth;
  }
  return fallbackMonth;
}

function extractYearFromDateStr(rawDate: string | undefined, fallbackYear = '2026'): string {
  if (!rawDate) return fallbackYear;
  if (/present|current|now/i.test(rawDate)) return String(new Date().getFullYear());
  const match = rawDate.trim().match(/(\d{4})/);
  return match ? match[1] : fallbackYear;
}

function derivePronounsFromProfile(profile: UserProfileSchema): string {
  const g = (profile.application_metadata?.gender || '').trim().toLowerCase();
  if (g.startsWith('f') || g.includes('woman') || g.includes('female')) return 'She/Her';
  if (g.startsWith('m') || g.includes('man') || g.includes('male')) return 'He/Him';
  if (g.includes('non') || g.includes('they')) return 'They/Them';
  return 'He/Him';
}

/**
 * Estimates total years of experience from the candidate's work_experience array.
 */
export function estimateYearsOfExperience(profile: UserProfileSchema): number {
  if (!profile.work_experience || profile.work_experience.length === 0) return 1;
  let totalMonths = 0;
  for (const exp of profile.work_experience) {
    const startMatch = (exp.start_date || '').match(/^(\d{4})(?:-(\d{1,2}))?/);
    const endMatch = (exp.end_date || '').match(/^(\d{4})(?:-(\d{1,2}))?/);
    if (startMatch) {
      const sYear = Number(startMatch[1]);
      const sMonth = Number(startMatch[2] || 1);
      const now = new Date();
      const eYear = exp.is_current || !endMatch ? now.getFullYear() : Number(endMatch[1]);
      const eMonth = exp.is_current || !endMatch ? now.getMonth() + 1 : Number(endMatch[2] || 6);
      const months = Math.max(1, (eYear - sYear) * 12 + (eMonth - sMonth));
      totalMonths += months;
    } else {
      totalMonths += 6;
    }
  }
  const years = Number((totalMonths / 12).toFixed(1));
  return years > 0 ? years : 1;
}

/**
 * Universal AI Agent Question-Answering Reasoner.
 * Given ANY form question (with its QuestionControlType, options, date_format) and the candidate's
 * UserProfileSchema, generates the tailored answer, matches dropdown/radio options, or formats DT pickers.
 */
export function reasonAnswerForQuestions(
  questions: DetectedFormQuestion[],
  profile: UserProfileSchema,
  jobDescriptionText = 'Software Engineer — Autonomous Agent Systems',
  cachedResumeFileName?: string
): AgentQuestionAnswer[] {
  const answers: AgentQuestionAnswer[] = [];
  const p = profile.personal_info;
  const edu = profile.education[0] || {
    institution: 'Delhi Technological University',
    degree: 'B.Tech',
    major: 'Computer Science & Engineering',
    gpa: 8.8,
    start_date: '2021-08',
    end_date: '2025-05',
    is_current: false,
  };
  const meta = profile.application_metadata;

  // Counters for repeating work experience sections
  let companyIdx = 0;
  let roleIdx = 0;
  let startDateIdx = 0;
  let endDateIdx = 0;
  let currentWorkIdx = 0;
  let respIdx = 0;

  for (const q of questions) {
    const key = `${q.question_text} ${q.placeholder || ''} ${q.section_context || ''}`.toLowerCase();

    let rawAnswer = '';
    let profileSource = 'personal_info';
    let reasoning = '';

    // 1. FILE UPLOAD
    if (q.question_type === 'FILE_UPLOAD') {
      const fileName =
        cachedResumeFileName ||
        `${p.first_name}_${p.last_name}_Resume.pdf`.replace(/\s+/g, '_');
      answers.push({
        question_id: q.question_id,
        agent_ids: q.agent_ids,
        question_text: q.question_text,
        question_type: q.question_type,
        question_type_label: q.question_type_label,
        answer: fileName,
        confidence: 0.99,
        profile_source: 'Cached PDF Resume Blob',
        reasoning: `Detected File Upload input. Attaching cached resume "${fileName}" via DataTransfer API.`,
      });
      continue;
    }

    // 2. DT PICKER (Date / Month / Calendar inputs)
    if (q.question_type === 'DT_PICKER') {
      const fmt = q.date_format || 'YYYY-MM-DD';
      if (/start\s*date|from\s*date/i.test(key)) {
        const exp = profile.work_experience[startDateIdx] || profile.work_experience[0];
        startDateIdx++;
        const rawDate = exp?.start_date || edu.start_date || '2024-05';
        rawAnswer = formatProfileDateForPicker(rawDate, fmt);
        profileSource = `work_experience[${Math.max(0, startDateIdx - 1)}].start_date`;
        reasoning = `Detected DT Picker (${fmt}). Formatted start date "${rawDate}" -> "${rawAnswer}".`;
      } else if (/end\s*date|to\s*date|graduation\s*date/i.test(key)) {
        const exp = profile.work_experience[endDateIdx] || profile.work_experience[0];
        endDateIdx++;
        const rawDate = /graduation|degree|education/i.test(key)
          ? edu.end_date
          : exp?.end_date || edu.end_date || '2025-05';
        rawAnswer = formatProfileDateForPicker(rawDate, fmt);
        profileSource = `work_experience[${Math.max(0, endDateIdx - 1)}].end_date`;
        reasoning = `Detected DT Picker (${fmt}). Formatted end date "${rawDate}" -> "${rawAnswer}".`;
      } else if (/joining|available|earliest|start\s*work/i.test(key)) {
        rawAnswer = formatProfileDateForPicker(meta.earliest_joining_date || '2026-11-15', fmt);
        profileSource = 'application_metadata.earliest_joining_date';
        reasoning = `Detected DT Picker (${fmt}) for availability. Formatted earliest_joining_date -> "${rawAnswer}".`;
      } else if (/birth|dob/i.test(key)) {
        rawAnswer = formatProfileDateForPicker('2003-04-15', fmt);
        profileSource = 'personal_info (DOB)';
        reasoning = `Detected DT Picker (${fmt}) for Date of Birth.`;
      } else {
        rawAnswer = formatProfileDateForPicker(
          profile.work_experience[0]?.start_date || edu.end_date,
          fmt
        );
        profileSource = 'profile timeline';
        reasoning = `Formatted profile date for DT Picker (${fmt}).`;
      }

      answers.push({
        question_id: q.question_id,
        agent_ids: q.agent_ids,
        question_text: q.question_text,
        question_type: q.question_type,
        question_type_label: q.question_type_label,
        answer: rawAnswer,
        confidence: 0.96,
        profile_source: profileSource,
        reasoning,
      });
      continue;
    }

    // 3. OPTION SELECTION (Radio groups & Checkboxes)
    if (q.question_type === 'OPTION_SELECTION') {
      if (q.raw_input_type === 'checkbox') {
        if (/currently\s*work|present|current\s*role/i.test(key)) {
          const exp = profile.work_experience[currentWorkIdx] || profile.work_experience[0];
          currentWorkIdx++;
          const isCurr = Boolean(exp?.is_current);
          rawAnswer = isCurr ? 'Checked (Yes)' : 'Unchecked (No)';
          profileSource = `work_experience[${Math.max(0, currentWorkIdx - 1)}].is_current`;
          reasoning = `Synced checkbox state (${isCurr}) with work_experience.is_current.`;
          answers.push({
            question_id: q.question_id,
            agent_ids: q.agent_ids,
            question_text: q.question_text,
            question_type: q.question_type,
            question_type_label: q.question_type_label,
            answer: rawAnswer,
            selected_option_value: String(isCurr),
            confidence: 0.98,
            profile_source: profileSource,
            reasoning,
          });
          continue;
        }
        // Terms / Consent / Ack checkboxes
        rawAnswer = 'Checked (Yes)';
        profileSource = 'application_metadata (Consent)';
        reasoning = 'Checked mandatory acknowledgment / consent option.';
        answers.push({
          question_id: q.question_id,
          agent_ids: q.agent_ids,
          question_text: q.question_text,
          question_type: q.question_type,
          question_type_label: q.question_type_label,
          answer: rawAnswer,
          selected_option_value: 'true',
          confidence: 0.97,
          profile_source: profileSource,
          reasoning,
        });
        continue;
      }

      // Radio button group
      let desiredChoice = 'Yes';
      if (/sponsorship|notice\s*period.*30|require\s*visa/i.test(key)) {
        const needsYes = Boolean(meta.requires_sponsorship || meta.notice_period_days > 30);
        desiredChoice = needsYes ? 'Yes' : 'No';
        profileSource = 'application_metadata.requires_sponsorship & notice_period_days';
      } else if (/offer\s*deadline|recruiting.*deadline|competing\s*offer|previously\s*worked|ever\s*been\s*employed|former\s*employee|non-?compete|relative|government\s*official/i.test(key)) {
        desiredChoice = 'No';
        profileSource = 'application_metadata (Compliance / Recruiting)';
      } else if (/authorized|legally\s*eligible|work\s*authorization/i.test(key)) {
        desiredChoice = meta.work_authorization !== false ? 'Yes' : 'No';
        profileSource = 'application_metadata.work_authorization';
      } else if (/relocate|hybrid|remote|on-?site/i.test(key)) {
        desiredChoice = 'Yes';
        profileSource = 'application_metadata (Work Preference)';
      } else if (/pronoun/i.test(key)) {
        desiredChoice = derivePronounsFromProfile(profile);
        profileSource = 'application_metadata.gender -> pronouns';
      } else if (/gender/i.test(key)) {
        desiredChoice = meta.gender || 'Male';
        profileSource = 'application_metadata.gender';
      } else if (/disability/i.test(key)) {
        desiredChoice = meta.disability_status || 'No';
        profileSource = 'application_metadata.disability_status';
      } else if (/veteran/i.test(key)) {
        desiredChoice = meta.veteran_status || 'No';
        profileSource = 'application_metadata.veteran_status';
      }

      const matchedOpt = matchBestOption(q.options, desiredChoice, q.question_text);
      answers.push({
        question_id: q.question_id,
        agent_ids: q.agent_ids,
        question_text: q.question_text,
        question_type: q.question_type,
        question_type_label: q.question_type_label,
        answer: matchedOpt ? matchedOpt.label : desiredChoice,
        selected_option_agent_id: matchedOpt?.agent_id || q.agent_ids[0],
        selected_option_value: matchedOpt?.value || desiredChoice,
        confidence: 0.96,
        profile_source: profileSource,
        reasoning: `Evaluated ${q.options.length || 2} radio options against ${profileSource} -> selected "${matchedOpt ? matchedOpt.label : desiredChoice}".`,
      });
      continue;
    }

    // 4. Determine underlying profile answer for DROPDOWN, NUMBER_INPUT, SHORT_TEXT, LONG_ESSAY
    if (/preferred\s*name|chosen\s*name|nick\s*name|preferred\s*first\s*name|what\s*should\s*we\s*call\s*you/i.test(key)) {
      rawAnswer = p.first_name;
      profileSource = 'personal_info.first_name (Preferred Name)';
    } else if (/middle\s*name|middle\s*initial/i.test(key)) {
      rawAnswer = '';
      profileSource = 'personal_info (Middle Name optional)';
    } else if (/pronoun/i.test(key)) {
      rawAnswer = derivePronounsFromProfile(profile);
      profileSource = 'application_metadata.gender -> pronouns';
    } else if (/full\s*name|candidate\s*name|your\s*name|applicant\s*name|legal\s*name|signature|print\s*name/i.test(key)) {
      rawAnswer = `${p.first_name} ${p.last_name}`.trim();
      profileSource = 'personal_info.first_name + last_name';
    } else if (/first\s*name|given\s*name|fname/i.test(key)) {
      rawAnswer = p.first_name;
      profileSource = 'personal_info.first_name';
    } else if (/last\s*name|surname|family\s*name|lname/i.test(key)) {
      rawAnswer = p.last_name;
      profileSource = 'personal_info.last_name';
    } else if (/e-?mail/i.test(key)) {
      rawAnswer = p.email;
      profileSource = 'personal_info.email';
    } else if (/country\s*code|phone\s*code|dial\s*code/i.test(key)) {
      rawAnswer = p.phone.country_code || '+91';
      profileSource = 'personal_info.phone.country_code';
    } else if (/\bcountry\b/i.test(key) && !/phone\s*number/i.test(key)) {
      rawAnswer = p.location.country || 'India';
      profileSource = 'personal_info.location.country';
    } else if (/phone|mobile|contact\s*number|whatsapp|tel/i.test(key)) {
      rawAnswer = p.phone.number;
      profileSource = 'personal_info.phone.number';
    } else if (/linkedin/i.test(key)) {
      rawAnswer = p.links.linkedin || p.links.github || p.links.portfolio || `https://linkedin.com/in/${p.first_name.toLowerCase()}-${p.last_name.toLowerCase()}`;
      profileSource = 'personal_info.links.linkedin';
    } else if (/github/i.test(key)) {
      rawAnswer = p.links.github || p.links.portfolio || p.links.linkedin || `https://github.com/${p.first_name.toLowerCase()}${p.last_name.toLowerCase()}`;
      profileSource = 'personal_info.links.github';
    } else if (/portfolio|website|personal\s*url|blog/i.test(key)) {
      rawAnswer = p.links.portfolio || p.links.github || p.links.linkedin;
      profileSource = 'personal_info.links.portfolio';
    } else if (/offer\s*deadline|recruiting[- ]process\s*deadline|recruiting\s*deadline|competing\s*offer|other\s*deadline|decision\s*deadline/i.test(key)) {
      rawAnswer =
        q.question_type === 'SHORT_TEXT' || q.question_type === 'DROPDOWN'
          ? 'No'
          : 'No, I do not have any active offer deadlines or competing recruiting-process deadlines at this time, and I am flexible with your interview timeline.';
      profileSource = 'application_metadata (Recruiting Timeline & Deadlines)';
    } else if (/\b(end|to|graduation|passing|completion|expected)\s*(?:date\s*)?year\b|\bgraduation\s*year\b|\bpassing\s*year\b|\bbatch\b/i.test(key)) {
      rawAnswer = extractYearFromDateStr(edu.end_date, '2026');
      profileSource = 'education[0].end_date (Year)';
    } else if (/\b(start|from|enrollment)\s*(?:date\s*)?year\b/i.test(key)) {
      rawAnswer = extractYearFromDateStr(edu.start_date, '2022');
      profileSource = 'education[0].start_date (Year)';
    } else if (/\b(end|to|graduation|completion|expected)\s*(?:date\s*)?month\b/i.test(key)) {
      rawAnswer = extractMonthNameFromDateStr(edu.end_date, 'May');
      profileSource = 'education[0].end_date (Month)';
    } else if (/\b(start|from|enrollment)\s*(?:date\s*)?month\b/i.test(key)) {
      rawAnswer = extractMonthNameFromDateStr(edu.start_date, 'August');
      profileSource = 'education[0].start_date (Month)';
    } else if (/pincode|postal\s*code|zip\s*code/i.test(key)) {
      rawAnswer = p.location.pincode || '110001';
      profileSource = 'personal_info.location.pincode';
    } else if (/current\s*location|city|location|preferred\s*office|which\s*office/i.test(key) && !/company/i.test(key)) {
      rawAnswer = [p.location.city, p.location.state, p.location.country]
        .filter(Boolean)
        .join(', ');
      profileSource = 'personal_info.location';
    } else if (/address|street/i.test(key)) {
      rawAnswer = p.location.address || `${p.location.city}, ${p.location.state}`;
      profileSource = 'personal_info.location.address';
    } else if (/state|province/i.test(key)) {
      rawAnswer = p.location.state || p.location.city;
      profileSource = 'personal_info.location.state';
    } else if (/university|college|institution|school|alma\s*mater|^education\s*\*?$/i.test(key.trim())) {
      rawAnswer = edu.institution;
      profileSource = 'education[0].institution';
    } else if (/degree|qualification|highest\s*education/i.test(key)) {
      rawAnswer =
        q.question_type === 'DROPDOWN' ? edu.degree : `${edu.degree} — ${edu.major}`;
      profileSource = 'education[0].degree & major';
    } else if (/major|branch|specialization|field\s*of\s*study|discipline/i.test(key)) {
      rawAnswer = edu.major;
      profileSource = 'education[0].major';
    } else if (/cgpa|gpa|cpi|grade|percentage/i.test(key)) {
      rawAnswer = String(edu.gpa);
      profileSource = 'education[0].gpa';
    } else if (/previously\s*worked|ever\s*been\s*employed|former\s*employee|previously\s*interned|worked\s*at\s*stripe/i.test(key)) {
      rawAnswer =
        q.question_type === 'LONG_ESSAY'
          ? 'No, I have not previously been employed by or interned with the company.'
          : 'No';
      profileSource = 'work_experience (Prior Employment Check)';
    } else if (/how\s*did\s*you\s*hear|where\s*did\s*you\s*hear|source\s*of\s*application/i.test(key)) {
      rawAnswer = 'Company Careers Page & LinkedIn';
      profileSource = 'application_metadata (Source)';
    } else if (/referred\s*by|employee\s*referral|referrer|who\s*referred/i.test(key)) {
      rawAnswer = /name|email|who/i.test(key) ? 'N/A' : 'No';
      profileSource = 'application_metadata (Referral)';
    } else if (/non-?compete|restrictive\s*covenant|bound\s*by\s*any\s*agreement/i.test(key)) {
      rawAnswer =
        q.question_type === 'LONG_ESSAY'
          ? 'No, I am not bound by any non-compete agreements or restrictive covenants.'
          : 'No';
      profileSource = 'application_metadata (Legal / Compliance)';
    } else if (/relocate|willing\s*to\s*relocate|work\s*from\s*office|hybrid|in-?office|onsite/i.test(key)) {
      rawAnswer =
        q.question_type === 'LONG_ESSAY'
          ? `Yes, I am open to relocating and working onsite or hybrid as required.`
          : 'Yes';
      profileSource = 'application_metadata (Relocation & Work Arrangement)';
    } else if (/company\s*name|employer|current\s*company|organization/i.test(key)) {
      const exp = profile.work_experience[companyIdx] || profile.work_experience[0];
      companyIdx++;
      rawAnswer = exp?.company || (profile.projects[0]?.title ? `${profile.projects[0].title} (Project)` : 'Independent');
      profileSource = `work_experience[${Math.max(0, companyIdx - 1)}].company`;
    } else if (/job\s*title|role\s*title|designation|current\s*role|position/i.test(key)) {
      const exp = profile.work_experience[roleIdx] || profile.work_experience[0];
      roleIdx++;
      rawAnswer = exp?.role || 'Software Engineer';
      profileSource = `work_experience[${Math.max(0, roleIdx - 1)}].role`;
    } else if (/responsibilit|achievements|work\s*description|role\s*summary/i.test(key)) {
      const exp = profile.work_experience[respIdx] || profile.work_experience[0];
      respIdx++;
      rawAnswer = (exp?.description_bullets || []).join(' • ');
      profileSource = `work_experience[${Math.max(0, respIdx - 1)}].description_bullets`;
    } else if (/years\s*of\s*experience|how\s*many\s*years|total\s*experience|yoe/i.test(key)) {
      const yoe = estimateYearsOfExperience(profile);
      rawAnswer = q.question_type === 'NUMBER_INPUT' ? String(yoe) : `${yoe} years`;
      profileSource = 'Calculated from work_experience dates';
    } else if (/notice\s*period|earliest\s*joining|when\s*can\s*you\s*start|availability/i.test(key)) {
      if (q.question_type === 'NUMBER_INPUT') {
        rawAnswer = String(meta.notice_period_days ?? 30);
      } else {
        rawAnswer = `${meta.notice_period_days} days notice period — Earliest joining date: ${meta.earliest_joining_date} (Negotiable to 15 days via buyout)`;
      }
      profileSource = 'application_metadata.notice_period_days & earliest_joining_date';
    } else if (/expected\s*ctc|expected\s*salary|desired\s*compensation|desired\s*salary/i.test(key)) {
      rawAnswer =
        q.question_type === 'NUMBER_INPUT'
          ? String(meta.expected_ctc_lpa ?? 24)
          : `${meta.expected_ctc_lpa ?? 24} LPA`;
      profileSource = 'application_metadata.expected_ctc_lpa';
    } else if (/current\s*ctc|current\s*salary|present\s*compensation/i.test(key)) {
      rawAnswer =
        q.question_type === 'NUMBER_INPUT'
          ? String(meta.current_ctc_lpa ?? 15)
          : `${meta.current_ctc_lpa ?? 15} LPA`;
      profileSource = 'application_metadata.current_ctc_lpa';
    } else if (/gender|sex/i.test(key)) {
      rawAnswer = meta.gender || 'Male';
      profileSource = 'application_metadata.gender';
    } else if (/disability/i.test(key)) {
      rawAnswer = meta.disability_status || 'No, I do not have a disability';
      profileSource = 'application_metadata.disability_status';
    } else if (/veteran/i.test(key)) {
      rawAnswer = meta.veteran_status || 'I am not a protected veteran';
      profileSource = 'application_metadata.veteran_status';
    } else if (/authorized|work\s*authorization|legally\s*eligible|right\s*to\s*work/i.test(key)) {
      rawAnswer =
        q.question_type === 'LONG_ESSAY'
          ? `Yes, I am legally authorized to work in ${p.location.country || 'India'} without restrictions.`
          : meta.work_authorization !== false
          ? 'Yes'
          : 'No';
      profileSource = 'application_metadata.work_authorization';
    } else if (/sponsorship|require\s*visa|need\s*visa/i.test(key)) {
      rawAnswer =
        q.question_type === 'LONG_ESSAY'
          ? meta.requires_sponsorship
            ? 'Yes, I will require visa sponsorship.'
            : 'No, I do not require visa sponsorship now or in the future.'
          : meta.requires_sponsorship
          ? 'Yes'
          : 'No';
      profileSource = 'application_metadata.requires_sponsorship';
    } else if (/citizenship|nationality/i.test(key)) {
      rawAnswer = p.location.country || 'India';
      profileSource = 'personal_info.location.country (Citizenship)';
    } else if (/skills|technologies|tech\s*stack|programming\s*languages/i.test(key)) {
      rawAnswer = (profile.skills || []).join(', ');
      profileSource = 'skills[]';
    } else if (q.question_type === 'SHORT_TEXT' || q.question_type === 'NUMBER_INPUT') {
      // CRITICAL GUARD: Never dump a multi-sentence biography into a SHORT_TEXT or NUMBER_INPUT field!
      if (q.question_type === 'NUMBER_INPUT' || /\byear\b/i.test(key)) {
        rawAnswer = extractYearFromDateStr(edu.end_date, '2026');
        profileSource = 'education[0].end_date (Year)';
      } else if (/\bmonth\b/i.test(key)) {
        rawAnswer = extractMonthNameFromDateStr(edu.end_date, 'May');
        profileSource = 'education[0].end_date (Month)';
      } else if (/^(do|are|have|will|can|would|is|did|were)\b/i.test(q.question_text.trim())) {
        rawAnswer = /deadline|conflict|compete|sponsorship|former|previously/i.test(key) ? 'No' : 'Yes';
        profileSource = 'application_metadata (Concise Yes/No)';
      } else {
        rawAnswer = `${edu.degree} (${edu.major}) — ${edu.institution}`;
        profileSource = 'education[0] (Concise Summary)';
      }
    } else {
      // Open-ended / Custom Question Answering from Profile Knowledge Base (for LONG_ESSAY)
      rawAnswer = synthesizeAnswerForAnyQuestion(q.question_text, profile, jobDescriptionText);
      profileSource = 'AI Profile Synthesis (work_experience + projects + skills + education)';
    }

    // 5. If this is a DROPDOWN with explicit options, match the closest option from the dropdown
    if (q.question_type === 'DROPDOWN' && q.options.length > 0) {
      const matchedOpt = matchBestOption(q.options, rawAnswer, q.question_text);
      const selectedVal = matchedOpt ? matchedOpt.value : rawAnswer;
      const selectedLabel = matchedOpt ? matchedOpt.label : rawAnswer;
      answers.push({
        question_id: q.question_id,
        agent_ids: q.agent_ids,
        question_text: q.question_text,
        question_type: q.question_type,
        question_type_label: q.question_type_label,
        answer: selectedLabel,
        selected_option_value: selectedVal,
        confidence: 0.96,
        profile_source: profileSource,
        reasoning: `Detected Dropdown with ${q.options.length} options. Matched profile value "${rawAnswer}" -> option "${selectedLabel}".`,
      });
      continue;
    }

    answers.push({
      question_id: q.question_id,
      agent_ids: q.agent_ids,
      question_text: q.question_text,
      question_type: q.question_type,
      question_type_label: q.question_type_label,
      answer: rawAnswer,
      confidence: 0.95,
      profile_source: profileSource,
      reasoning: `Fetched question (${q.question_type_label}) and generated answer from ${profileSource}.`,
    });
  }

  return answers;
}

/**
 * Synthesizes a tailored answer for ANY open-ended or custom question using the candidate's
 * full profile (education, work experience, projects, skills, and application metadata).
 */
export function synthesizeAnswerForAnyQuestion(
  questionText: string,
  profile: UserProfileSchema,
  jobDescriptionText = 'Software Engineer — Autonomous Agent Systems'
): string {
  const lower = questionText.toLowerCase();
  const p = profile.personal_info;
  const meta = profile.application_metadata;
  const edu = profile.education[0] || {
    institution: 'Delhi Technological University',
    degree: 'B.Tech',
    major: 'Computer Science',
    gpa: 8.8,
    end_date: '2026-05',
  };
  const exp0 = profile.work_experience[0] || {
    company: 'Atlassian',
    role: 'Software Engineering Intern',
    description_bullets: ['Engineered low-latency backend services and scalable production systems.'],
  };
  const proj0 = profile.projects[0] || {
    title: 'AutoApply AI',
    tech_stack: ['TypeScript', 'Python', 'FastAPI', 'React'],
    description: 'Autonomous hybrid-agentic workflow engine.',
  };
  const proj1 = profile.projects[1];
  const topSkills = (profile.skills || []).slice(0, 8).join(', ');

  // 1. Logistical / Recruiting / Compliance questions rendered inside <textarea>
  if (/offer\s*deadline|recruiting[- ]process\s*deadline|recruiting\s*deadline|competing\s*offer|other\s*deadline|decision\s*deadline/i.test(lower)) {
    return 'No, I do not have any active offer deadlines or competing recruiting-process deadlines at this time, and I have full flexibility with your interview timeline.';
  }
  if (/accommodation|accessibility\s*need/i.test(lower)) {
    return 'No special accommodations are required at this time, thank you.';
  }
  if (/non-?compete|restrictive\s*covenant|bound\s*by\s*any\s*agreement|conflict\s*of\s*interest/i.test(lower)) {
    return 'No, I am not bound by any non-compete agreements, restrictive covenants, or conflicts of interest.';
  }
  if (/previously\s*worked|ever\s*been\s*employed|former\s*employee|previously\s*interned/i.test(lower)) {
    return 'No, I have not previously been employed by or interned with the company.';
  }
  if (/sponsorship|require\s*visa|need\s*visa/i.test(lower)) {
    return meta?.requires_sponsorship
      ? 'Yes, I will require visa sponsorship.'
      : 'No, I do not require visa sponsorship now or in the future, and I am fully authorized to work.';
  }
  if (/when\s*can\s*you\s*start|earliest\s*start|availability|notice\s*period/i.test(lower)) {
    return `I am available to start from ${meta?.earliest_joining_date || '2026-06-01'} (notice period: ${meta?.notice_period_days ?? 0} days) and can align with your preferred onboarding schedule.`;
  }

  // 2. Technical / Project / Behavioral Essay Questions
  if (lower.includes('project') || lower.includes('architecture') || lower.includes('complex') || lower.includes('built')) {
    const secondProjSentence = proj1
      ? ` Additionally, I built ${proj1.title} (${(proj1.tech_stack || []).join(', ')}), where ${proj1.description}`
      : '';
    return `My most complex engineering project is ${proj0.title}, built using ${(proj0.tech_stack || []).join(', ')}. ${proj0.description}${secondProjSentence} Combined with my experience as ${exp0.role} at ${exp0.company} and strong proficiency in ${topSkills}, I design resilient, production-grade architectures with measurable latency and throughput gains.`;
  }

  if (lower.includes('strong fit') || lower.includes('why') || lower.includes('hire') || lower.includes('join') || lower.includes('motivation') || lower.includes('interest')) {
    return `During my tenure as ${exp0.role} at ${exp0.company} and my ${edu.degree} in ${edu.major} at ${edu.institution} (CGPA ${edu.gpa}), I specialized in building production software systems using ${topSkills}. At ${exp0.company}, ${(exp0.description_bullets && exp0.description_bullets[0]) || 'I delivered high-impact engineering features in production.'} My hands-on experience shipping ${proj0.title} directly aligns with ${jobDescriptionText.slice(0, 65).trim()} and allows me to contribute immediately.`;
  }

  if (lower.includes('strength') || lower.includes('superpower') || lower.includes('proud') || lower.includes('achievement')) {
    return `My core engineering strength is translating complex system requirements into reliable, low-latency production software using ${topSkills}. As ${exp0.role} at ${exp0.company}, ${(exp0.description_bullets && exp0.description_bullets[0]) || 'I improved system reliability and performance,'} while maintaining a ${edu.gpa} CGPA in ${edu.major} at ${edu.institution}.`;
  }

  if (lower.includes('challenge') || lower.includes('bug') || lower.includes('difficult') || lower.includes('conflict') || lower.includes('obstacle')) {
    return `While working as ${exp0.role} at ${exp0.company} and building ${proj0.title} (${(proj0.tech_stack || []).join(', ')}), I resolved high-concurrency bottlenecks and edge-case state synchronization issues. Specifically, ${(exp0.description_bullets && exp0.description_bullets[0]) || proj0.description} By profiling execution paths and adding automated verification, I ensured deterministic reliability in production.`;
  }

  return `I am ${p.first_name} ${p.last_name}, a ${edu.degree} (${edu.major}, CGPA ${edu.gpa}) candidate from ${edu.institution} with experience as ${exp0.role} at ${exp0.company}. My technical stack spans ${topSkills}, and I have built production systems including ${proj0.title} (${(proj0.tech_stack || []).slice(0, 4).join(', ')}). At ${exp0.company}, ${(exp0.description_bullets && exp0.description_bullets[0]) || 'I engineered scalable full-stack and backend solutions.'}`;
}

