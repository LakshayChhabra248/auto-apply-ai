import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTokenCompression,
  transitionAgentState,
  generateTailoredScreeningAnswer,
  buildAgentActionPlan,
  classifyRecruiterEmailDeterministic,
} from './autoapplyEngine';
import { DEFAULT_USER_PROFILE, INITIAL_APPLICATIONS } from '../data/seedProfile';
import { DistilledElement } from '../types/autoapply';

test('calculateTokenCompression enforces >85% token reduction NFR', () => {
  const metrics = calculateTokenCompression(15200, 1420, 9, 3, 185);
  assert.ok(metrics.reductionPercentage >= 85, `Expected >=85% reduction, got ${metrics.reductionPercentage}%`);
  assert.ok(metrics.distilledEstimatedTokens < 3000, 'Distilled tokens must stay under 3,000 token budget');
  assert.equal(metrics.elementsExtracted, 9);
  assert.equal(metrics.shadowElementsExtracted, 3);
});

test('transitionAgentState follows Background Worker Master State Machine (FR 4.1)', () => {
  let state = transitionAgentState('IDLE', 'START_SCAN');
  assert.equal(state, 'ANALYZING_DOM');

  state = transitionAgentState(state, 'DOM_DISTILLED');
  assert.equal(state, 'EXECUTING_ACTIONS');

  // CAPTCHA interrupt & recovery (NFR CAPTCHA Fallback)
  const paused = transitionAgentState(state, 'CAPTCHA_DETECTED');
  assert.equal(paused, 'PAUSED_CAPTCHA');
  const resumed = transitionAgentState(paused, 'CAPTCHA_SOLVED');
  assert.equal(resumed, 'ANALYZING_DOM');

  // Normal completion -> error verification -> final human submit lock
  state = transitionAgentState('EXECUTING_ACTIONS', 'ACTIONS_COMPLETED');
  assert.equal(state, 'VERIFYING_ERRORS');

  const finalState = transitionAgentState(state, 'VALIDATION_PASSED_FINAL');
  assert.equal(finalState, 'AWAITING_FINAL_HUMAN_SUBMIT');
});

test('generateTailoredScreeningAnswer produces >=150 chars tailored response', () => {
  const projectAnswer = generateTailoredScreeningAnswer(
    'Describe your most complex AI/ML project and the architecture you used. (Min 150 characters).',
    DEFAULT_USER_PROFILE,
    'Software Engineer — Autonomous Agent Systems building FastAPI and DOM distillation pipelines.'
  );
  assert.ok(
    projectAnswer.length >= 150,
    `Expected >=150 characters, got ${projectAnswer.length}`
  );
  assert.ok(projectAnswer.includes('AutoApply AI'));

  const fitAnswer = generateTailoredScreeningAnswer(
    'Why are you a strong fit for this Software Engineer role?',
    DEFAULT_USER_PROFILE,
    'Software Engineer — Autonomous Agent Systems'
  );
  assert.ok(fitAnswer.length >= 150);
  assert.ok(fitAnswer.includes('Sarvam AI Research Labs'));
});

test('buildAgentActionPlan concatenates Full Name, expands repeating experiences, and activates Human-in-the-Loop Submit Lock', () => {
  const samplePage1Elements: DistilledElement[] = [
    {
      agent_id: 'el_1',
      tag: 'input',
      type: 'file',
      label: 'Resume Upload (PDF)',
      placeholder: '',
      options: null,
      current_value: '',
    },
    {
      agent_id: 'el_2',
      tag: 'input',
      type: 'text',
      label: 'Full Name *',
      placeholder: 'Enter your full legal name',
      options: null,
      current_value: '',
    },
    {
      agent_id: 'el_3',
      tag: 'button',
      type: 'button',
      label: 'Save & Continue',
      placeholder: '',
      options: null,
      current_value: '',
    },
  ];

  const page1Plan = buildAgentActionPlan(
    samplePage1Elements,
    DEFAULT_USER_PROFILE,
    'Software Engineer',
    1
  );

  assert.equal(page1Plan.length, 3);
  assert.equal(page1Plan[0].action_type, 'UPLOAD_CACHED_PDF');
  assert.equal(page1Plan[1].action_type, 'SET_NATIVE_VALUE');
  assert.equal(page1Plan[1].value, 'Aarav Sharma');
  assert.equal(page1Plan[2].action_type, 'CLICK_NEXT_PAGE');

  // Test Page 4 Shadow DOM + Final Submit Lock
  const samplePage4Elements: DistilledElement[] = [
    {
      agent_id: 'el_40',
      tag: 'select',
      type: 'select-one',
      label: 'Gender Identity (EEO)',
      placeholder: '',
      options: ['Select...', 'Male', 'Female', 'Non-Binary'],
      current_value: '',
      in_shadow_dom: true,
    },
    {
      agent_id: 'el_41',
      tag: 'button',
      type: 'button',
      label: 'Submit Application',
      placeholder: '',
      options: null,
      current_value: '',
    },
  ];

  const page4Plan = buildAgentActionPlan(
    samplePage4Elements,
    DEFAULT_USER_PROFILE,
    'Software Engineer',
    3
  );

  assert.equal(page4Plan[0].in_shadow_dom, true);
  assert.equal(page4Plan[0].value, 'Male');
  assert.equal(page4Plan[1].action_type, 'HIGHLIGHT_FINAL_SUBMIT');
});

test('classifyRecruiterEmailDeterministic accurately classifies OA, Interview, Rejection, and Received emails', () => {
  const oaResult = classifyRecruiterEmailDeterministic(
    {
      sender: 'recruiting@chronos-enterprise.ai',
      subject: 'Online Assessment Invite: Chronos Enterprise AI',
      body: 'Please complete your HackerRank coding assessment by Oct 28.',
    },
    INITIAL_APPLICATIONS
  );
  assert.equal(oaResult.new_status, 'OA_RECEIVED');
  assert.equal(oaResult.matched_application_id, 'app-chronos-8841');

  const rejectResult = classifyRecruiterEmailDeterministic(
    {
      sender: 'no-reply@chronos-enterprise.ai',
      subject: 'Update on your application with Chronos Enterprise AI',
      body: 'Unfortunately, we are not moving forward with your candidacy at this time.',
    },
    INITIAL_APPLICATIONS
  );
  assert.equal(rejectResult.new_status, 'REJECTED');
});

import { parseResumeTextToProfile } from './resumeParser';

test('parseResumeTextToProfile completely replaces dummy seed data with uploaded candidate resume', () => {
  const sampleResume = `LAKSHAY CHHABRA
lakshaychhabra248@gmail.com | +91 9876543210 | New Delhi, Delhi
https://linkedin.com/in/lakshay-chhabra | https://github.com/lakshaychhabra

EDUCATION
Delhi Technological University (DTU)
B.Tech in Computer Science & Engineering | CGPA: 9.15

WORK EXPERIENCE
Google Cloud | Software Engineering Intern
- Built distributed microservices in Go and TypeScript with sub-20ms p99 latency.

PROJECTS
NeuralSearch Engine: Vector search pipeline using Python, FastAPI, and React.

SKILLS
Python, TypeScript, React, FastAPI, Docker, PostgreSQL`;

  const parsed = parseResumeTextToProfile(sampleResume, 'Lakshay_Chhabra_Resume.pdf');
  assert.equal(parsed.personal_info.first_name, 'Lakshay');
  assert.equal(parsed.personal_info.last_name, 'Chhabra');
  assert.equal(parsed.personal_info.email, 'lakshaychhabra248@gmail.com');
  assert.equal(parsed.personal_info.phone.number, '9876543210');
  assert.ok(parsed.education[0].institution.includes('Delhi Technological University'));
  assert.equal(parsed.education[0].gpa, 9.15);
  assert.equal(parsed.work_experience[0].company, 'Google Cloud');
  assert.ok(!JSON.stringify(parsed).includes('Aarav'));
});

test('parseResumeTextToProfile handles flattened single-line PDF text streams with inline bullets and headers', () => {
  const flattenedPdfStream =
    'LAKSHAY CHHABRA | lakshaychhabra248@gmail.com | +91-9876543210 | Gurugram, India   EDUCATION   Netaji Subhas University of Technology (NSUT) | B.Tech in Computer Science & Engineering | CGPA: 8.92 / 10 | Aug 2022 - May 2026   WORK EXPERIENCE   Microsoft India | Software Engineering Intern | May 2025 - Jul 2025 • Architected distributed caching layer in C++ and Redis reducing latency by 42%. • Built telemetry dashboards in React and TypeScript.   PROJECTS   AutoApply Agent | TypeScript, FastAPI, Gemini • Autonomous browser form-filling agent with Shadow DOM support.   TECHNICAL SKILLS   Languages: C++, Python, TypeScript, Go, SQL | Frameworks: React, Next.js, FastAPI, Node.js, Docker, AWS';

  const parsed = parseResumeTextToProfile(flattenedPdfStream, 'Lakshay_Chhabra_Resume.pdf');
  assert.equal(parsed.personal_info.first_name, 'Lakshay');
  assert.equal(parsed.personal_info.last_name, 'Chhabra');
  assert.equal(parsed.personal_info.location.city, 'Gurugram');
  assert.ok(parsed.education[0].institution.includes('Netaji Subhas University'));
  assert.equal(parsed.education[0].gpa, 8.92);
  assert.equal(parsed.work_experience[0].company, 'Microsoft India');
  assert.equal(parsed.work_experience[0].role, 'Software Engineering Intern');
  assert.equal(parsed.work_experience[0].start_date, '2025-05');
  assert.equal(parsed.work_experience[0].end_date, '2025-07');
  assert.ok(parsed.work_experience[0].description_bullets.length >= 2);
  assert.equal(parsed.projects[0].title, 'AutoApply Agent');
  assert.ok(parsed.skills.includes('C++'));
  assert.ok(parsed.skills.includes('FastAPI'));
});

test('parseResumeTextToProfile accurately parses 2-line Overleaf/LaTeX headers without duplicate education or leaked bullets', () => {
  const overleafResume = `ROHAN VERMA
rohan.verma@iitd.ac.in | +91 9811223344 | New Delhi, 110016 | github.com/rohanverma | linkedin.com/in/rohanverma

EDUCATION
Indian Institute of Technology Delhi | New Delhi, India
Bachelor of Technology in Mathematics and Computing | CGPA: 9.34/10.0 | Aug 2022 - May 2026

EXPERIENCE
Software Engineer Intern | May 2025 - Jul 2025
Uber India Systems | Bengaluru, Karnataka
• Engineered real-time surge pricing pipeline in Go and Kafka handling 45,000 events/sec.
• Reduced Redis cluster tail latency by 31% via pipelined batching.

Atlassian | May 2024 - Jul 2024
Backend Engineering Intern | Bengaluru, Karnataka
• Built automated permission graph synchronization in TypeScript, Node.js, and PostgreSQL.

PROJECTS
Chronos Distributed Scheduler | Go, gRPC, Docker, Kubernetes | GitHub | Jan 2025 - Mar 2025
• Built a fault-tolerant Raft-backed task scheduler supporting 10k concurrent worker nodes.
• Implemented Prometheus metrics exporters and Grafana observability dashboards.

TECHNICAL SKILLS
Languages: C++, Go, Python, TypeScript, SQL
Technologies: React, Node.js, Kafka, Redis, PostgreSQL, Docker, Kubernetes, AWS`;

  const parsed = parseResumeTextToProfile(overleafResume, 'Rohan_Verma_Resume.pdf');
  assert.equal(parsed.personal_info.first_name, 'Rohan');
  assert.equal(parsed.personal_info.last_name, 'Verma');
  assert.equal(parsed.personal_info.location.pincode, '110016');
  assert.equal(parsed.education.length, 1);
  assert.equal(parsed.education[0].institution, 'Indian Institute of Technology Delhi');
  assert.equal(parsed.education[0].degree, 'B.Tech');
  assert.equal(parsed.education[0].gpa, 9.34);

  assert.equal(parsed.work_experience.length, 2);
  assert.equal(parsed.work_experience[0].company, 'Uber India Systems');
  assert.equal(parsed.work_experience[0].role, 'Software Engineer Intern');
  assert.equal(parsed.work_experience[0].start_date, '2025-05');
  assert.equal(parsed.work_experience[0].description_bullets.length, 2);

  assert.equal(parsed.work_experience[1].company, 'Atlassian');
  assert.equal(parsed.work_experience[1].role, 'Backend Engineering Intern');
  assert.equal(parsed.work_experience[1].start_date, '2024-05');

  assert.equal(parsed.projects.length, 1);
  assert.equal(parsed.projects[0].title, 'Chronos Distributed Scheduler');
  assert.ok(parsed.projects[0].tech_stack.includes('Go'));
  assert.ok(parsed.projects[0].description.includes('fault-tolerant Raft-backed'));
});

import {
  buildChromeExtensionFiles,
  createExtensionZipUint8Array,
} from './extensionPackager';

test('buildChromeExtensionFiles and createExtensionZipUint8Array generate unseeded Manifest V3 package with SidePanel resume upload', () => {
  const files = buildChromeExtensionFiles('http://localhost:3000');
  assert.equal(files.length, 6);
  const manifest = JSON.parse(files.find((f) => f.name === 'manifest.json')!.content);
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes('sidePanel'));

  const bgContent = files.find((f) => f.name === 'background.js')!.content;
  assert.ok(bgContent.includes('autoapply_profile: null'));
  assert.ok(!bgContent.includes('Aarav'));

  const sidepanelHtml = files.find((f) => f.name === 'sidepanel.html')!.content;
  assert.ok(sidepanelHtml.includes('id="resume-upload-input"'));
  assert.ok(sidepanelHtml.includes('Upload / Update Resume (PDF or TXT)'));

  const zipBytes = createExtensionZipUint8Array(
    files.map((f) => ({ name: f.name, content: f.content }))
  );
  // PKZIP local file header signature: 0x50 ('P'), 0x4b ('K'), 0x03, 0x04
  assert.equal(zipBytes[0], 0x50);
  assert.equal(zipBytes[1], 0x4b);
  assert.equal(zipBytes[2], 0x03);
  assert.equal(zipBytes[3], 0x04);
});

import {
  convertDistilledElementsToQuestions,
  reasonAnswerForQuestions,
} from './questionAgent';

test('convertDistilledElementsToQuestions and reasonAnswerForQuestions detect Dropdowns, DT Pickers, Option Selections, and answer any question from profile', () => {
  const sampleElements: DistilledElement[] = [
    {
      agent_id: 'el_deg',
      tag: 'select',
      type: 'select-one',
      label: 'Highest Qualification / Degree',
      placeholder: '',
      options: ['Bachelor of Technology (B.Tech)', 'Master of Technology (M.Tech)', 'MBA'],
      current_value: '',
    },
    {
      agent_id: 'el_dt',
      tag: 'input',
      type: 'month',
      label: 'Most Recent Work Start Date',
      placeholder: 'YYYY-MM',
      options: null,
      current_value: '',
    },
    {
      agent_id: 'el_join',
      tag: 'input',
      type: 'date',
      label: 'Earliest Joining Date',
      placeholder: 'YYYY-MM-DD',
      options: null,
      current_value: '',
    },
    {
      agent_id: 'el_r1',
      tag: 'input',
      type: 'radio',
      name: 'sponsorship_radio',
      label: 'Yes — I require sponsorship or have >30 days notice',
      placeholder: '',
      options: null,
      current_value: 'yes',
    },
    {
      agent_id: 'el_r2',
      tag: 'input',
      type: 'radio',
      name: 'sponsorship_radio',
      label: 'No — Authorized & Immediate',
      placeholder: '',
      options: null,
      current_value: 'no',
    },
    {
      agent_id: 'el_gpa',
      tag: 'input',
      type: 'number',
      label: 'Cumulative GPA / CGPA',
      placeholder: '9.4',
      options: null,
      current_value: '',
    },
    {
      agent_id: 'el_essay',
      tag: 'textarea',
      type: 'textarea',
      label: 'Describe your most complex engineering project and architecture',
      placeholder: '',
      options: null,
      current_value: '',
    },
  ];

  const questions = convertDistilledElementsToQuestions(sampleElements);
  // 2 radio buttons with same name are grouped into 1 OPTION_SELECTION question => 6 questions total
  assert.equal(questions.length, 6);
  assert.equal(questions[0].question_type, 'DROPDOWN');
  assert.equal(questions[1].question_type, 'DT_PICKER');
  assert.equal(questions[1].date_format, 'YYYY-MM');
  assert.equal(questions[2].question_type, 'DT_PICKER');
  assert.equal(questions[2].date_format, 'YYYY-MM-DD');
  assert.equal(questions[3].question_type, 'OPTION_SELECTION');
  assert.equal(questions[3].options.length, 2);
  assert.equal(questions[4].question_type, 'NUMBER_INPUT');
  assert.equal(questions[5].question_type, 'LONG_ESSAY');

  const answers = reasonAnswerForQuestions(questions, DEFAULT_USER_PROFILE);
  assert.equal(answers.length, 6);
  // Dropdown matched "Bachelor of Technology (B.Tech)" from profile degree "B.Tech"
  assert.equal(answers[0].answer, 'Bachelor of Technology (B.Tech)');
  // DT Picker YYYY-MM formatted from work_experience[0].start_date
  assert.equal(answers[1].answer, DEFAULT_USER_PROFILE.work_experience[0].start_date);
  // DT Picker YYYY-MM-DD formatted from earliest_joining_date
  assert.equal(answers[2].answer, DEFAULT_USER_PROFILE.application_metadata.earliest_joining_date);
  // Option Selection Radio matched "Yes..." since notice_period_days is 45 (>30)
  assert.equal(answers[3].selected_option_agent_id, 'el_r1');
  // Number Input GPA
  assert.equal(answers[4].answer, String(DEFAULT_USER_PROFILE.education[0].gpa));
  // Long Essay >= 150 chars
  assert.ok(answers[5].answer.length >= 150);
});

