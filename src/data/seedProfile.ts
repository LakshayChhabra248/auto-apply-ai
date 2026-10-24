import {
  UserProfileSchema,
  CachedResumeFile,
  ApplicationRecord,
  SimulatedEmail,
} from '../types/autoapply';

export const DEFAULT_USER_PROFILE: UserProfileSchema = {
  personal_info: {
    first_name: 'Aarav',
    last_name: 'Sharma',
    email: 'aarav.sharma.ai@iitb.ac.in',
    phone: {
      country_code: '+91',
      number: '9845012390',
    },
    location: {
      address: '42 Indiranagar 100 Feet Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
      country: 'India',
    },
    links: {
      linkedin: 'https://linkedin.com/in/aarav-sharma-ai',
      github: 'https://github.com/aarav-agentic',
      portfolio: 'https://aaravsharma.dev',
    },
  },
  education: [
    {
      institution: 'Indian Institute of Technology (IIT) Bombay',
      degree: 'B.Tech',
      major: 'Computer Science & Engineering (AI & ML)',
      gpa: 9.42,
      start_date: '2022-08',
      end_date: '2026-05',
      is_current: true,
    },
  ],
  work_experience: [
    {
      company: 'Sarvam AI Research Labs',
      role: 'AI Systems Engineering Intern',
      location: 'Bengaluru, Karnataka, India',
      start_date: '2025-05',
      end_date: '2025-08',
      is_current: false,
      description_bullets: [
        'Architected a low-latency DOM distillation and structured tool-calling pipeline using Gemini 2.5 Flash, cutting input token overhead by 89.4%.',
        'Built deterministic browser state recovery guards with MutationObserver for asynchronous multi-step workflows.',
      ],
    },
    {
      company: 'Razorpay Cloud Infrastructure',
      role: 'Software Engineering Intern (Backend & ML)',
      location: 'Bengaluru, Karnataka, India',
      start_date: '2024-05',
      end_date: '2024-07',
      is_current: false,
      description_bullets: [
        'Designed high-throughput webhook classification microservices in Python FastAPI and PostgreSQL handling 14,000 req/sec.',
        'Reduced false-positive anomaly alerts by 34% via fine-tuned embedding retrieval.',
      ],
    },
    {
      company: 'Hasura GraphQL Engine',
      role: 'Open Source Fellow',
      location: 'Remote',
      start_date: '2023-12',
      end_date: '2024-03',
      is_current: false,
      description_bullets: [
        'Implemented schema introspection caching and automated AST query validation in TypeScript and Rust.',
      ],
    },
  ],
  projects: [
    {
      title: 'AutoApply AI — Hybrid-Agentic Browser Automation Ecosystem',
      tech_stack: ['TypeScript', 'Manifest V3', 'FastAPI', 'Gemini Structured Outputs', 'Shadow DOM'],
      description:
        'Autonomous Chrome Extension and FastAPI engine that distills noisy 50k-token ATS pages into compact JSON schemas, injects React synthetic events, resolves custom calendar popovers via Observe-Act-Observe loops, and tracks outcomes via Gmail OAuth.',
      url: 'https://github.com/aarav-agentic/autoapply-ai',
    },
    {
      title: 'VectorFlow Distributed RAG Orchestrator',
      tech_stack: ['Python', 'PyMuPDF', 'Supabase pgvector', 'LangGraph'],
      description:
        'Multi-agent document ingestion pipeline with layout-aware PDF chunking and sub-80ms hybrid semantic retrieval.',
      url: 'https://github.com/aarav-agentic/vectorflow-rag',
    },
  ],
  skills: [
    'TypeScript',
    'Python',
    'React 19',
    'FastAPI',
    'Gemini API',
    'LangGraph',
    'PydanticAI',
    'PostgreSQL',
    'DOM Distillation',
    'Chrome Extensions (MV3)',
  ],
  application_metadata: {
    work_authorization: true,
    requires_sponsorship: false,
    notice_period_days: 45,
    earliest_joining_date: '2026-12-10',
    expected_ctc_lpa: 28.5,
    current_ctc_lpa: 18.0,
    gender: 'Male',
    disability_status: 'No, I do not have a disability',
    veteran_status: 'I am not a protected veteran',
  },
};

// Minimal valid PDF header encoded in Base64 for FR 1.4 File Blob Caching
export const DEFAULT_CACHED_RESUME: CachedResumeFile = {
  fileName: 'Aarav_Sharma_IITB_AI_Resume_2026.pdf',
  fileSizeBytes: 148290,
  base64Data:
    'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSA+PgplbmRvYmoKdHJhaWxlcgo8PCAvUm9vdCAxIDAgUiA+PgplbmRUcmFpbGVyCiUlRU9GCg==',
  uploadedAt: '2026-10-24T01:45:00Z',
  rawExtractedText: `AARAV SHARMA
Email: aarav.sharma.ai@iitb.ac.in | Phone: +91 9845012390 | Location: Bengaluru, Karnataka, India
LinkedIn: https://linkedin.com/in/aarav-sharma-ai | GitHub: https://github.com/aarav-agentic

EDUCATION
Indian Institute of Technology (IIT) Bombay — B.Tech in Computer Science & Engineering (AI & ML)
CGPA: 9.42 / 10.0 | Aug 2022 - May 2026

WORK EXPERIENCE
1. Sarvam AI Research Labs | AI Systems Engineering Intern | May 2025 - Aug 2025
- Architected low-latency DOM distillation and structured tool-calling pipeline using Gemini Flash, cutting input token overhead by 89.4%.
- Built deterministic browser state recovery guards with MutationObserver for asynchronous multi-step workflows.

2. Razorpay Cloud Infrastructure | Software Engineering Intern (Backend & ML) | May 2024 - Jul 2024
- Designed high-throughput webhook classification microservices in Python FastAPI and PostgreSQL handling 14,000 req/sec.

3. Hasura GraphQL Engine | Open Source Fellow | Dec 2023 - Mar 2024
- Implemented schema introspection caching and automated AST query validation in TypeScript and Rust.

PROJECTS
- AutoApply AI: Hybrid-Agentic Browser Automation Ecosystem (TypeScript, Manifest V3, FastAPI, Gemini Structured Outputs, Shadow DOM)
- VectorFlow Distributed RAG Orchestrator (Python, PyMuPDF, Supabase pgvector, LangGraph)

SKILLS
TypeScript, Python, React 19, FastAPI, Gemini API, LangGraph, PydanticAI, PostgreSQL, DOM Distillation`,
};

export const MOCK_ATS_JOB_DESCRIPTION = {
  company: 'Chronos Enterprise AI (Workday/Greenhouse Sandbox)',
  role: 'Software Engineer — Autonomous Agent Systems',
  reqId: 'REQ-2026-8841',
  location: 'Bengaluru, Karnataka, India (Hybrid)',
  compensation: '₹24.0L – ₹32.0L PA + Equity',
  summary:
    'We are seeking an AI Systems & Full-Stack Software Engineer to architect reliable agentic workflows, high-throughput FastAPI microservices, and resilient browser automation pipelines.',
  requirements: [
    'Strong proficiency in TypeScript, React, and Python (FastAPI / Pydantic).',
    'Hands-on experience with LLM structured outputs, tool calling, and token optimization.',
    'Deep understanding of browser DOM internals, Shadow DOM encapsulation, and asynchronous state machines.',
  ],
};

export const INITIAL_APPLICATIONS: ApplicationRecord[] = [
  {
    id: 'app-chronos-8841',
    company: 'Chronos Enterprise AI',
    role: 'Software Engineer — Autonomous Agent Systems',
    portal_url: 'https://careers.chronos-enterprise.ai/jobs/req-2026-8841',
    applied_at: '2026-10-23T14:20:00Z',
    status: 'APPLIED',
    action_required: 'Awaiting initial recruiter triage',
    confidence_score: 0.99,
    last_email_subject: 'Application Confirmation: Software Engineer — Autonomous Agent Systems',
  },
  {
    id: 'app-linear-402',
    company: 'Linear Systems Corp',
    role: 'Frontend Infrastructure Engineer',
    portal_url: 'https://boards.greenhouse.io/linearsystems/jobs/402918',
    applied_at: '2026-10-21T09:15:00Z',
    status: 'INTERVIEW_SCHEDULED',
    action_required: 'Technical Architecture Round on Oct 29 at 4:00 PM IST',
    confidence_score: 0.97,
    last_email_subject: 'Invitation to Interview: Linear Systems Corp Technical Round',
  },
  {
    id: 'app-databricks-119',
    company: 'Databricks India',
    role: 'Software Engineer — AI Platform',
    portal_url: 'https://databricks.wd1.myworkdayjobs.com/External/job/Bengaluru/SWE-AI_119',
    applied_at: '2026-10-19T18:05:00Z',
    status: 'OA_RECEIVED',
    action_required: 'Complete HackerRank Assessment within 72 hours',
    confidence_score: 0.95,
    last_email_subject: 'Action Required: Databricks Online Coding Assessment',
  },
];

export const INITIAL_SIMULATED_EMAILS: SimulatedEmail[] = [
  {
    id: 'msg-001',
    sender: 'no-reply@greenhouse-mail.io (Linear Systems Recruiting)',
    recipient: 'aarav.sharma.ai@iitb.ac.in',
    subject: 'Invitation to Interview: Linear Systems Corp Technical Round',
    body: 'Hi Aarav, thank you for applying to the Frontend Infrastructure Engineer position at Linear Systems Corp. Our engineering team reviewed your background and would like to invite you to a 45-minute Technical Architecture Round on Oct 29 at 4:00 PM IST.',
    received_at: '2026-10-22T11:30:00Z',
    classification: {
      matched_application_id: 'app-linear-402',
      company: 'Linear Systems Corp',
      new_status: 'INTERVIEW_SCHEDULED',
      action_required: 'Technical Architecture Round on Oct 29 at 4:00 PM IST',
      confidence_score: 0.97,
    },
  },
  {
    id: 'msg-002',
    sender: 'assessments@databricks-careers.com',
    recipient: 'aarav.sharma.ai@iitb.ac.in',
    subject: 'Action Required: Databricks Online Coding Assessment',
    body: 'Hello Aarav, Congratulations on advancing to the next stage for Software Engineer — AI Platform at Databricks India! Please complete the attached 90-minute HackerRank assessment within 72 hours.',
    received_at: '2026-10-20T16:10:00Z',
    classification: {
      matched_application_id: 'app-databricks-119',
      company: 'Databricks India',
      new_status: 'OA_RECEIVED',
      action_required: 'Complete HackerRank Assessment within 72 hours',
      confidence_score: 0.95,
    },
  },
];
