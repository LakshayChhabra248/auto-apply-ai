import React, { useState, useEffect, useCallback } from 'react';
import {
  DEFAULT_USER_PROFILE,
  DEFAULT_CACHED_RESUME,
  INITIAL_APPLICATIONS,
  INITIAL_SIMULATED_EMAILS,
  MOCK_ATS_JOB_DESCRIPTION,
} from './data/seedProfile';
import {
  UserProfileSchema,
  CachedResumeFile,
  DistilledElement,
  AgentActionStep,
  AgentState,
  TokenTelemetry,
  ApplicationRecord,
  SimulatedEmail,
} from './types/autoapply';
import {
  buildAgentActionPlan,
  transitionAgentState,
  generateTailoredScreeningAnswer,
} from './utils/autoapplyEngine';
import {
  distillLiveDom,
  findElementByAgentId,
  setNativeValue,
  setNativeChecked,
  injectCachedPdfFile,
} from './utils/domDistiller';
import {
  MockAtsSandbox,
  MockAtsFormState,
  INITIAL_ATS_FORM_STATE,
} from './components/MockAtsSandbox';
import { ExtensionSidePanel } from './components/ExtensionSidePanel';
import { ProfileVaultView } from './components/ProfileVaultView';
import { EmailTrackerView } from './components/EmailTrackerView';
import { ChromeExtensionExportView } from './components/ChromeExtensionExportView';

type WorkspaceView = 'sandbox' | 'profile' | 'tracker' | 'architecture';

const PROFILE_STORAGE_KEY = 'autoapply_user_profile_v2';
const RESUME_STORAGE_KEY = 'autoapply_cached_resume_v2';

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('sandbox');

  // Feature 1: User Profile Schema & Base64 Cached Resume (persisted in localStorage like chrome.storage.local)
  const [profile, setProfile] = useState<UserProfileSchema>(() => {
    try {
      const saved = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore storage errors
    }
    return DEFAULT_USER_PROFILE;
  });

  const [cachedResume, setCachedResume] = useState<CachedResumeFile>(() => {
    try {
      const saved = window.localStorage.getItem(RESUME_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore storage errors
    }
    return DEFAULT_CACHED_RESUME;
  });

  const [isUploadingResume, setIsUploadingResume] = useState<boolean>(false);
  const [resumeParseBanner, setResumeParseBanner] = useState<string | null>(null);

  // Sync profile and cachedResume to localStorage whenever updated
  useEffect(() => {
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // ignore quota errors
    }
  }, [profile]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(cachedResume));
    } catch {
      // ignore quota errors
    }
  }, [cachedResume]);

  // Part 2: 4-Page MockATS Torture-Chamber State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [formState, setFormState] = useState<MockAtsFormState>(INITIAL_ATS_FORM_STATE);
  const [captchaActive, setCaptchaActive] = useState<boolean>(false);

  // Feature 2, 3, 4: Chrome Extension SidePanel & Background Worker State Machine
  const [agentState, setAgentState] = useState<AgentState>('IDLE');
  const [distilledElements, setDistilledElements] = useState<DistilledElement[]>([]);
  const [actionPlan, setActionPlan] = useState<AgentActionStep[]>([]);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<TokenTelemetry>({
    rawHtmlBytes: 214500,
    rawEstimatedTokens: 53625,
    distilledJsonBytes: 1840,
    distilledEstimatedTokens: 460,
    reductionPercentage: 99.1,
    elementsExtracted: 0,
    shadowElementsExtracted: 0,
    latencyMs: 18,
  });

  // Feature 5: Automated Email Application Tracker
  const [applications, setApplications] = useState<ApplicationRecord[]>(INITIAL_APPLICATIONS);
  const [emails, setEmails] = useState<SimulatedEmail[]>(INITIAL_SIMULATED_EMAILS);
  const [sendingEmailType, setSendingEmailType] = useState<string | null>(null);
  const [lastEmailToast, setLastEmailToast] = useState<string | null>(null);

  // Unified handler: When user uploads a PDF or TXT resume anywhere in the app,
  // cache the Base64 blob AND immediately extract the structured profile via /api/resume/parse
  const handleUploadAndParseResumeFile = async (file: File) => {
    setIsUploadingResume(true);
    setResumeParseBanner(null);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;

      let plainTextContent = '';
      if (file.name.toLowerCase().endsWith('.txt') || file.type === 'text/plain') {
        plainTextContent = await file.text();
      }

      const response = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfBase64: base64Data,
          rawText: plainTextContent,
          fileName: file.name,
          currentProfile: profile,
        }),
      });

      const data = await response.json();
      if (data.profile) {
        const extractedProfile: UserProfileSchema = data.profile;
        setProfile(extractedProfile);
        setCachedResume({
          fileName: file.name,
          fileSizeBytes: file.size,
          base64Data,
          uploadedAt: new Date().toISOString(),
          rawExtractedText:
            data.extractedText ||
            plainTextContent ||
            `${extractedProfile.personal_info.first_name} ${extractedProfile.personal_info.last_name}\n${extractedProfile.personal_info.email}`,
        });

        // Also populate Page 1 fields with the newly parsed resume profile so the user sees their info immediately
        const fullName =
          `${extractedProfile.personal_info.first_name} ${extractedProfile.personal_info.last_name}`.trim();
        const locString = `${extractedProfile.personal_info.location.city}, ${extractedProfile.personal_info.location.state}, ${extractedProfile.personal_info.location.country}`;

        setFormState((prev) => ({
          ...prev,
          resumeFileName: file.name,
          resumeFileSize: file.size,
          fullName,
          email: extractedProfile.personal_info.email,
          countryCode: extractedProfile.personal_info.phone.country_code || '+91',
          phone: extractedProfile.personal_info.phone.number,
          location: locString,
          rawValueTampered: false,
        }));

        setResumeParseBanner(
          `Extracted profile for ${fullName} (${extractedProfile.personal_info.email}) from ${file.name} via ${data.engine || 'Resume Parser'}.`
        );
      }
    } catch (err) {
      console.error('Resume upload & parse error:', err);
      setResumeParseBanner(`Uploaded ${file.name}, but encountered an error extracting schema.`);
    } finally {
      setIsUploadingResume(false);
    }
  };

  const handleResetToDemoProfile = () => {
    setProfile(DEFAULT_USER_PROFILE);
    setCachedResume(DEFAULT_CACHED_RESUME);
    setResumeParseBanner('Reset Profile Vault to default demo candidate profile.');
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    window.localStorage.removeItem(RESUME_STORAGE_KEY);
  };

  // Run live DOM distillation whenever MockATS page changes
  const runLiveDistillation = useCallback(() => {
    const result = distillLiveDom('#mock-ats-form-container');
    setDistilledElements(result.elements);
    setTelemetry(result.telemetry);
    return result;
  }, []);

  useEffect(() => {
    if (activeView === 'sandbox') {
      const timer = window.setTimeout(() => {
        runLiveDistillation();
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [
    currentPage,
    activeView,
    formState.experiences.length,
    formState.sponsorshipOrNoticeRadio,
    runLiveDistillation,
  ]);

  // Handle CAPTCHA toggle (NFR CAPTCHA Fallback)
  const handleToggleCaptcha = (active: boolean) => {
    setCaptchaActive(active);
    if (active) {
      setAgentState((s) => transitionAgentState(s, 'CAPTCHA_DETECTED'));
    } else {
      setAgentState((s) => transitionAgentState(s, 'CAPTCHA_SOLVED'));
    }
  };

  // Executes AutoApply AI on a specific MockATS page (1, 2, 3, or 4)
  const executeAgentOnPage = async (
    targetPage: number,
    advanceWhenDone: boolean
  ): Promise<boolean> => {
    if (captchaActive) {
      setAgentState('PAUSED_CAPTCHA');
      return false;
    }

    setAgentState('ANALYZING_DOM');
    const distilled = distillLiveDom('#mock-ats-form-container');
    setDistilledElements(distilled.elements);
    setTelemetry(distilled.telemetry);

    const jdContext = `${MOCK_ATS_JOB_DESCRIPTION.role} at ${MOCK_ATS_JOB_DESCRIPTION.company}: ${MOCK_ATS_JOB_DESCRIPTION.summary}`;
    const initialPlan = buildAgentActionPlan(
      distilled.elements,
      profile,
      jdContext,
      formState.experiences.length,
      cachedResume.fileName
    );

    setAgentState('EXECUTING_ACTIONS');
    const completedPlan = initialPlan.map((step) => ({
      ...step,
      status: 'completed' as const,
    }));
    setActionPlan(completedPlan);

    // Execute live DOM synthetic events + state synchronization per page
    for (const step of initialPlan) {
      const liveEl = findElementByAgentId(document, step.agent_id);
      if (liveEl) {
        if (step.action_type === 'UPLOAD_CACHED_PDF' && liveEl instanceof HTMLInputElement) {
          injectCachedPdfFile(liveEl, cachedResume.base64Data, cachedResume.fileName);
        } else if (
          step.action_type === 'SET_NATIVE_VALUE' ||
          step.action_type === 'TYPEAHEAD_SELECT'
        ) {
          setNativeValue(liveEl, step.value);
        } else if (
          (step.action_type === 'SET_CHECKBOX' || step.action_type === 'CLICK_RADIO') &&
          liveEl instanceof HTMLInputElement
        ) {
          setNativeChecked(liveEl, step.value !== 'false');
        }
      }
    }

    // Ensure deterministic state sync across all 4 pages of the MockATS Torture-Chamber
    if (targetPage === 1) {
      const fullName =
        `${profile.personal_info.first_name} ${profile.personal_info.last_name}`.trim();
      const targetLocation = `${profile.personal_info.location.city}, ${profile.personal_info.location.state}, ${profile.personal_info.location.country}`;
      setFormState((prev) => ({
        ...prev,
        resumeFileName: cachedResume.fileName,
        resumeFileSize: cachedResume.fileSizeBytes,
        fullName,
        email: profile.personal_info.email,
        countryCode: profile.personal_info.phone.country_code,
        phone: profile.personal_info.phone.number,
        location: targetLocation,
        rawValueTampered: false,
      }));
    } else if (targetPage === 2) {
      const edu = profile.education[0] || DEFAULT_USER_PROFILE.education[0];
      const mappedExperiences = profile.work_experience.map((exp, idx) => ({
        id: `exp-auto-${idx + 1}`,
        company: exp.company,
        role: exp.role,
        startDate: exp.start_date.length === 7 ? `${exp.start_date}-15` : exp.start_date,
        endDate: exp.is_current
          ? 'Present'
          : exp.end_date.length === 7
          ? `${exp.end_date}-15`
          : exp.end_date,
        isCurrent: exp.is_current,
        responsibilities: exp.description_bullets.join(' • '),
      }));
      setFormState((prev) => ({
        ...prev,
        university: edu.institution,
        degree: `${edu.degree} — ${edu.major}`,
        cgpa: String(edu.gpa),
        experiences: mappedExperiences,
      }));
    } else if (targetPage === 3) {
      const needsYes =
        profile.application_metadata.requires_sponsorship ||
        profile.application_metadata.notice_period_days > 30;
      const noticeText = `${profile.application_metadata.notice_period_days} days notice period — Earliest joining date: ${profile.application_metadata.earliest_joining_date} (Negotiable to 15 days via buyout)`;
      const projectEssay = generateTailoredScreeningAnswer(
        'Describe your most complex AI/ML project and the architecture you used.',
        profile,
        jdContext
      );
      const fitEssay = generateTailoredScreeningAnswer(
        'Why are you a strong fit for this Software Engineer role?',
        profile,
        jdContext
      );
      setFormState((prev) => ({
        ...prev,
        sponsorshipOrNoticeRadio: needsYes ? 'Yes' : 'No',
        noticePeriodDetails: needsYes ? noticeText : '',
        complexProjectEssay: projectEssay,
        roleFitEssay: fitEssay,
      }));
    } else if (targetPage === 4) {
      setFormState((prev) => ({
        ...prev,
        eeoGender: profile.application_metadata.gender,
        eeoDisability: profile.application_metadata.disability_status,
        eeoTermsAccepted: true,
      }));
    }

    setAgentState('VERIFYING_ERRORS');

    if (targetPage === 4) {
      // FR 4.3 Human-in-the-Loop Safety Lock on final page
      setAgentState('AWAITING_FINAL_HUMAN_SUBMIT');
      return true;
    }

    if (advanceWhenDone && targetPage < 4) {
      setAgentState('NAVIGATING_NEXT_PAGE');
      setCurrentPage(targetPage + 1);
    } else {
      setAgentState('IDLE');
    }

    return true;
  };

  const handleRunCurrentPageAgent = async () => {
    setIsExecuting(true);
    try {
      await executeAgentOnPage(currentPage, false);
      setTimeout(() => runLiveDistillation(), 80);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRunFullAutopilot = async () => {
    setActiveView('sandbox');
    setIsExecuting(true);
    try {
      for (let page = 1; page <= 4; page++) {
        if (captchaActive) {
          setAgentState('PAUSED_CAPTCHA');
          break;
        }
        setCurrentPage(page);
        await new Promise((r) => setTimeout(r, 120));
        await executeAgentOnPage(page, page < 4);
      }
      setTimeout(() => runLiveDistillation(), 100);
    } finally {
      setIsExecuting(false);
    }
  };

  // FR 5.1: Auto-Logging on Apply when reaching final submission
  const handleApplicationSubmitted = () => {
    setAgentState('IDLE');
    setApplications((prev) => {
      const existingIdx = prev.findIndex((a) => a.id === 'app-chronos-8841');
      const updatedRecord: ApplicationRecord = {
        id: 'app-chronos-8841',
        company: MOCK_ATS_JOB_DESCRIPTION.company.split(' (')[0],
        role: MOCK_ATS_JOB_DESCRIPTION.role,
        portal_url: 'https://careers.chronos-enterprise.ai/jobs/req-2026-8841',
        applied_at: new Date().toISOString(),
        status: 'APPLIED',
        action_required: 'Application submitted via AutoApply AI — awaiting recruiter response',
        confidence_score: 0.99,
      };
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = updatedRecord;
        return copy;
      }
      return [updatedRecord, ...prev];
    });
  };

  // Part 2 Page 4 & Feature 5: Dispatch simulated recruiter email and classify via LLM
  const handleSendRecruiterEmail = async (
    templateType: 'application_received' | 'oa_invite' | 'rejection'
  ) => {
    setSendingEmailType(templateType);
    setLastEmailToast(null);
    try {
      const response = await fetch('/api/mock-ats/send-recruiter-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateType,
          candidateEmail: profile.personal_info.email,
          candidateName: profile.personal_info.first_name,
          companyName: 'Chronos Enterprise AI',
          roleTitle: MOCK_ATS_JOB_DESCRIPTION.role,
          applications,
        }),
      });
      const data = await response.json();
      if (data.email && data.classification) {
        setEmails((prev) => [data.email, ...prev]);
        setApplications((prev) =>
          prev.map((app) =>
            app.id === data.classification.matched_application_id
              ? {
                  ...app,
                  status: data.classification.new_status,
                  action_required: data.classification.action_required,
                  confidence_score: data.classification.confidence_score,
                  last_email_subject: data.email.subject,
                }
              : app
          )
        );
        setLastEmailToast(
          `Status Updated → ${data.classification.new_status} (${Math.round(
            data.classification.confidence_score * 100
          )}% conf)`
        );
      }
    } catch (err) {
      console.error('Failed to dispatch recruiter email:', err);
    } finally {
      setSendingEmailType(null);
    }
  };

  const handleClassifyCustomEmail = async (customEmail: {
    sender: string;
    subject: string;
    body: string;
  }) => {
    const response = await fetch('/api/email/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: customEmail,
        applications,
      }),
    });
    const data = await response.json();
    if (data.classification) {
      const newEmailEntry: SimulatedEmail = {
        id: `msg-${Date.now()}`,
        sender: customEmail.sender,
        recipient: profile.personal_info.email,
        subject: customEmail.subject,
        body: customEmail.body,
        received_at: new Date().toISOString(),
        classification: data.classification,
      };
      setEmails((prev) => [newEmailEntry, ...prev]);
      setApplications((prev) =>
        prev.map((app) =>
          app.id === data.classification.matched_application_id
            ? {
                ...app,
                status: data.classification.new_status,
                action_required: data.classification.action_required,
                confidence_score: data.classification.confidence_score,
                last_email_subject: customEmail.subject,
              }
            : app
        )
      );
    }
  };

  const handleResetSandbox = () => {
    setFormState(INITIAL_ATS_FORM_STATE);
    setCurrentPage(1);
    setAgentState('IDLE');
    setActionPlan([]);
    setCaptchaActive(false);
    setLastEmailToast(null);
  };

  const activeCandidateName =
    `${profile.personal_info.first_name} ${profile.personal_info.last_name}`.trim();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-slate-200">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('sandbox');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          AutoApply AI
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav
          aria-label="Primary Workspace Navigation"
          className="flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <button
            type="button"
            onClick={() => setActiveView('sandbox')}
            className={`hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeView === 'sandbox'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent'
            }`}
          >
            MockATS Sandbox
          </button>
          <button
            type="button"
            onClick={() => setActiveView('profile')}
            className={`hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeView === 'profile'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent'
            }`}
          >
            Profile Vault ({profile.personal_info.first_name})
          </button>
          <button
            type="button"
            onClick={() => setActiveView('tracker')}
            className={`hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeView === 'tracker'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent'
            }`}
          >
            Email Tracker ({applications.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveView('architecture')}
            className={`hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeView === 'architecture'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent'
            }`}
          >
            Chrome Extension
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            disabled={isExecuting}
            onClick={handleRunFullAutopilot}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Run 4-Page Autopilot
          </button>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6">
        {activeView === 'sandbox' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Columns: Part 2 "MockATS Torture-Chamber" 4-Page Web App */}
            <div className="lg:col-span-7">
              <MockAtsSandbox
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                formState={formState}
                setFormState={setFormState}
                agentState={agentState}
                captchaActive={captchaActive}
                onToggleCaptcha={handleToggleCaptcha}
                onApplicationSubmitted={handleApplicationSubmitted}
                onSendRecruiterEmail={handleSendRecruiterEmail}
                sendingEmailType={sendingEmailType}
                lastEmailToast={lastEmailToast}
                onResetSandbox={handleResetSandbox}
                onUploadResumeFile={handleUploadAndParseResumeFile}
                isUploadingResume={isUploadingResume}
                resumeParseBanner={resumeParseBanner}
                activeCandidateName={activeCandidateName}
                activeCandidateEmail={profile.personal_info.email}
                onOpenProfileVault={() => setActiveView('profile')}
              />
            </div>

            {/* Right 5 Columns: Part 1 "AutoApply AI" Chrome Extension SidePanel Simulator */}
            <div className="lg:col-span-5">
              <ExtensionSidePanel
                agentState={agentState}
                currentPage={currentPage}
                distilledElements={distilledElements}
                actionPlan={actionPlan}
                telemetry={telemetry}
                isExecuting={isExecuting}
                onDistillOnly={runLiveDistillation}
                onRunCurrentPageAgent={handleRunCurrentPageAgent}
                onRunFullAutopilot={handleRunFullAutopilot}
              />
            </div>
          </div>
        )}

        {activeView === 'profile' && (
          <ProfileVaultView
            profile={profile}
            setProfile={setProfile}
            cachedResume={cachedResume}
            setCachedResume={setCachedResume}
            onUploadResumeFile={handleUploadAndParseResumeFile}
            isUploadingResume={isUploadingResume}
            resumeParseBanner={resumeParseBanner}
            onResetToDemoProfile={handleResetToDemoProfile}
          />
        )}

        {activeView === 'tracker' && (
          <EmailTrackerView
            applications={applications}
            emails={emails}
            onSendSimulatedRecruiterEmail={handleSendRecruiterEmail}
            onClassifyCustomEmail={handleClassifyCustomEmail}
            sendingEmailType={sendingEmailType}
          />
        )}

        {activeView === 'architecture' && <ChromeExtensionExportView />}
      </main>
    </div>
  );
}
