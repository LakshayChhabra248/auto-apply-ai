export interface UserProfileSchema {
  personal_info: {
    first_name: string;
    last_name: string;
    email: string;
    phone: {
      country_code: string;
      number: string;
    };
    location: {
      address: string;
      city: string;
      state: string;
      pincode: string;
      country: string;
    };
    links: {
      linkedin: string;
      github: string;
      portfolio: string;
    };
  };
  education: Array<{
    institution: string;
    degree: string;
    major: string;
    gpa: number;
    start_date: string;
    end_date: string;
    is_current: boolean;
  }>;
  work_experience: Array<{
    company: string;
    role: string;
    location: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
    description_bullets: string[];
  }>;
  projects: Array<{
    title: string;
    tech_stack: string[];
    description: string;
    url: string;
  }>;
  skills: string[];
  application_metadata: {
    work_authorization: boolean;
    requires_sponsorship: boolean;
    notice_period_days: number;
    earliest_joining_date: string;
    expected_ctc_lpa: number;
    current_ctc_lpa: number;
    gender: string;
    disability_status: string;
    veteran_status: string;
  };
}

export interface CachedResumeFile {
  fileName: string;
  fileSizeBytes: number;
  base64Data: string;
  uploadedAt: string;
  rawExtractedText: string;
}

export interface DistilledElement {
  agent_id: string;
  tag: string;
  type: string;
  name?: string;
  label: string;
  placeholder: string;
  options: string[] | null;
  current_value: string;
  checked?: boolean;
  is_readonly?: boolean;
  in_shadow_dom?: boolean;
  aria_invalid?: boolean;
  aria_expanded?: string | null;
  role?: string | null;
}

export type AgentState =
  | 'IDLE'
  | 'ANALYZING_DOM'
  | 'EXECUTING_ACTIONS'
  | 'VERIFYING_ERRORS'
  | 'NAVIGATING_NEXT_PAGE'
  | 'AWAITING_FINAL_HUMAN_SUBMIT'
  | 'PAUSED_CAPTCHA';

export type AgentActionType =
  | 'SET_NATIVE_VALUE'
  | 'UPLOAD_CACHED_PDF'
  | 'TYPEAHEAD_SELECT'
  | 'OPEN_DATEPICKER_AND_SELECT'
  | 'CLICK_ADD_SECTION'
  | 'CLICK_RADIO'
  | 'SET_CHECKBOX'
  | 'CLICK_NEXT_PAGE'
  | 'HIGHLIGHT_FINAL_SUBMIT';

export interface AgentActionStep {
  id: string;
  agent_id: string;
  action_type: AgentActionType;
  target_label: string;
  value: string;
  reasoning: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
  sub_steps?: string[];
  in_shadow_dom?: boolean;
}

export interface TokenTelemetry {
  rawHtmlBytes: number;
  rawEstimatedTokens: number;
  distilledJsonBytes: number;
  distilledEstimatedTokens: number;
  reductionPercentage: number;
  elementsExtracted: number;
  shadowElementsExtracted: number;
  latencyMs: number;
}

export type ApplicationStatus =
  | 'APPLIED'
  | 'OA_RECEIVED'
  | 'INTERVIEW_SCHEDULED'
  | 'REJECTED'
  | 'OFFER';

export interface ApplicationRecord {
  id: string;
  company: string;
  role: string;
  portal_url: string;
  applied_at: string;
  status: ApplicationStatus;
  action_required: string;
  confidence_score: number;
  last_email_subject?: string;
}

export interface SimulatedEmail {
  id: string;
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  received_at: string;
  classification?: EmailClassificationResult;
}

export interface EmailClassificationResult {
  matched_application_id: string;
  company: string;
  new_status: ApplicationStatus;
  action_required: string;
  confidence_score: number;
}
