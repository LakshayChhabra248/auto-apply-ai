import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, ThinkingLevel, GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import { getDocumentProxy, extractText } from 'unpdf';
import {
  generateTailoredScreeningAnswer,
  classifyRecruiterEmailDeterministic,
} from './src/utils/autoapplyEngine.ts';
import { parseResumeTextToProfile, normalizeResumeText } from './src/utils/resumeParser.ts';
import {
  convertDistilledElementsToQuestions,
  reasonAnswerForQuestions,
  matchBestOption,
  formatProfileDateForPicker,
  DetectedFormQuestion,
} from './src/utils/questionAgent.ts';
import { DEFAULT_USER_PROFILE } from './src/data/seedProfile.ts';

dotenv.config();

function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY' || key.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Extracts a JSON object from an LLM text response, stripping optional markdown code fences.
 */
function parseJsonFromLlmText(raw: string): Record<string, any> | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

/**
 * Calls Gemini 3 (`gemini-3-flash-preview` -> `gemini-3.1-flash-lite-preview`)
 * with `ThinkingLevel.MINIMAL` so structured JSON extraction finishes in ~1.4-2.5s.
 */
async function generateWithFastModelCascade(
  ai: GoogleGenAI,
  params: Omit<GenerateContentParameters, 'model'>,
  perModelTimeoutMs = 6500
): Promise<{ response: GenerateContentResponse; modelUsed: string }> {
  const modelsToTry = ['gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview'];
  let lastErr: unknown = null;

  for (const modelName of modelsToTry) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          ...params,
          model: modelName,
          config: {
            ...(params.config || {}),
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.MINIMAL,
            },
          },
        }),
        perModelTimeoutMs,
        modelName
      );
      if (response && response.text) {
        return { response, modelUsed: modelName };
      }
    } catch (err) {
      lastErr = err;
      console.warn(`Model ${modelName} attempt skipped:`, (err as Error)?.message);
    }
  }
  throw lastErr || new Error('All Gemini model attempts failed');
}

/**
 * Layout-preserving PDF text extractor using unpdf's getDocumentProxy.
 * Reconstructs visual lines by sorting text items top-to-bottom (Y) and left-to-right (X)
 * so multi-column, LaTeX, Overleaf, Word, and Canva resumes retain their exact line & section structure.
 */
async function extractLayoutTextFromPdfBase64(pdfBase64: string): Promise<string> {
  const cleanBase64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
  const buffer = Buffer.from(cleanBase64, 'base64');
  const headerLatin = buffer.subarray(0, 8).toString('latin1');

  // If uploaded file is plain text rather than a %PDF binary, return UTF-8 directly
  if (!headerLatin.startsWith('%PDF-')) {
    return buffer.toString('utf-8').trim();
  }

  try {
    const uint8 = new Uint8Array(buffer);
    const pdf = await getDocumentProxy(uint8);
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      interface PositionedItem {
        str: string;
        x: number;
        y: number;
      }

      const items: PositionedItem[] = [];
      for (const rawItem of textContent.items as Array<Record<string, unknown>>) {
        const str = typeof rawItem.str === 'string' ? rawItem.str : '';
        if (!str.trim()) continue;
        const transform = Array.isArray(rawItem.transform) ? (rawItem.transform as number[]) : [1, 0, 0, 1, 0, 0];
        items.push({
          str,
          x: Number(transform[4] || 0),
          y: Number(transform[5] || 0),
        });
      }

      // Group items into visual lines (tolerance of 3.5 pts in Y coordinate)
      const lineBuckets: Array<{ y: number; items: PositionedItem[] }> = [];
      for (const item of items) {
        const existingBucket = lineBuckets.find((b) => Math.abs(b.y - item.y) <= 3.5);
        if (existingBucket) {
          existingBucket.items.push(item);
        } else {
          lineBuckets.push({ y: item.y, items: [item] });
        }
      }

      // Sort lines from top of page to bottom (descending Y in PDF coordinate space)
      lineBuckets.sort((a, b) => b.y - a.y);

      const reconstructedLines = lineBuckets.map((bucket) => {
        bucket.items.sort((a, b) => a.x - b.x);
        let lineStr = '';
        let lastX: number | null = null;
        let lastLen = 0;

        for (const it of bucket.items) {
          if (lastX !== null) {
            const estimatedPrevEnd = lastX + lastLen * 4.2;
            const gap = it.x - estimatedPrevEnd;
            if (gap > 35) {
              lineStr += ' | ';
            } else if (gap > 2 && !lineStr.endsWith(' ') && !it.str.startsWith(' ')) {
              lineStr += ' ';
            }
          }
          lineStr += it.str;
          lastX = it.x;
          lastLen = it.str.length;
        }
        return lineStr.trim();
      });

      pageTexts.push(reconstructedLines.filter(Boolean).join('\n'));
    }

    const finalLayoutText = pageTexts.join('\n\n').trim();
    if (finalLayoutText.length > 15) {
      return normalizeResumeText(finalLayoutText);
    }
  } catch (err) {
    console.warn('getDocumentProxy layout extraction fallback:', err);
  }

  try {
    const uint8 = new Uint8Array(buffer);
    const result = await extractText(uint8);
    const rawPages = result?.text;
    const combinedText = Array.isArray(rawPages)
      ? rawPages.join('\n')
      : typeof rawPages === 'string'
      ? rawPages
      : '';
    if (combinedText.trim().length > 10) {
      return normalizeResumeText(combinedText);
    }
  } catch (err) {
    console.warn('unpdf extractText fallback:', err);
  }

  return '';
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  // Allow requests from the unpacked Chrome Extension (chrome-extension://*) and external ATS tabs
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // FR 1.1 & FR 1.2: PDF Resume Ingestion + Full AI Structured Output Extraction
  app.post('/api/resume/parse', async (req, res) => {
    const { rawText, pdfBase64, fileName, currentProfile } = req.body || {};

    let extractedText = typeof rawText === 'string' ? rawText.trim() : '';
    let isRealPdf = false;
    let cleanBase64 = '';

    if (pdfBase64 && typeof pdfBase64 === 'string') {
      cleanBase64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
      const header = Buffer.from(cleanBase64.slice(0, 24), 'base64').toString('latin1');
      isRealPdf = header.startsWith('%PDF-');

      const pdfText = await extractLayoutTextFromPdfBase64(cleanBase64);
      if (pdfText && pdfText.length > extractedText.length) {
        extractedText = pdfText;
      }
    }

    if (!extractedText && !cleanBase64) {
      res.status(400).json({ error: 'Please provide either a PDF file or resume text to parse.' });
      return;
    }

    const existingMetadata =
      currentProfile?.application_metadata || DEFAULT_USER_PROFILE.application_metadata;

    // Pre-compute deterministic baseline from layout text so any missing sub-field has a real resume value
    const deterministicBaseline = parseResumeTextToProfile(
      extractedText,
      fileName,
      existingMetadata
    );

    const ai = getGeminiClient();
    if (ai) {
      try {
        const parts: Array<
          | { text: string }
          | { inlineData: { mimeType: string; data: string } }
        > = [];

        if (isRealPdf && cleanBase64 && extractedText.length < 120) {
          parts.push({
            inlineData: {
              mimeType: 'application/pdf',
              data: cleanBase64,
            },
          });
        }

        parts.push({
          text: `Return ONLY a valid JSON object (no markdown fences) extracted from this candidate's resume${
            fileName ? ` (${fileName})` : ''
          } with this exact structure:
{
  "personal_info": {
    "first_name": "string",
    "last_name": "string",
    "email": "string",
    "country_code": "+91",
    "phone_number": "10-digit string",
    "address": "string",
    "city": "string",
    "state": "string",
    "pincode": "string",
    "country": "string",
    "linkedin": "full URL",
    "github": "full URL",
    "portfolio": "full URL"
  },
  "education": [
    {
      "institution": "string",
      "degree": "B.Tech",
      "major": "string",
      "gpa": 9.0,
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "is_current": false
    }
  ],
  "work_experience": [
    {
      "company": "string",
      "role": "string",
      "location": "string",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "is_current": false,
      "description_bullets": ["string"]
    }
  ],
  "projects": [
    {
      "title": "string",
      "tech_stack": ["string"],
      "description": "string",
      "url": "string"
    }
  ],
  "skills": ["string"]
}

Resume Text:
${extractedText}`,
        });

        const { response, modelUsed } = await generateWithFastModelCascade(ai, {
          contents: { parts },
          config: {
            systemInstruction:
              'You are an expert technical recruiter and Resume Parser AI. Output ONLY valid JSON matching the requested schema. Never invent fake companies.',
          },
        });

        const parsedText = response.text;
        const extracted = parsedText ? parseJsonFromLlmText(parsedText) : null;
        if (extracted) {
          const pInfo = extracted.personal_info || {};
          const fullProfile = {
            personal_info: {
              first_name: pInfo.first_name || deterministicBaseline.personal_info.first_name,
              last_name: pInfo.last_name ?? deterministicBaseline.personal_info.last_name,
              email: pInfo.email || deterministicBaseline.personal_info.email,
              phone: {
                country_code:
                  pInfo.country_code || deterministicBaseline.personal_info.phone.country_code || '+91',
                number:
                  String(pInfo.phone_number || '').replace(/\D/g, '') ||
                  deterministicBaseline.personal_info.phone.number,
              },
              location: {
                address: pInfo.address || pInfo.city || deterministicBaseline.personal_info.location.address,
                city: pInfo.city || deterministicBaseline.personal_info.location.city,
                state: pInfo.state || deterministicBaseline.personal_info.location.state,
                pincode: pInfo.pincode || deterministicBaseline.personal_info.location.pincode,
                country: pInfo.country || deterministicBaseline.personal_info.location.country || 'India',
              },
              links: {
                linkedin: pInfo.linkedin || deterministicBaseline.personal_info.links.linkedin,
                github: pInfo.github || deterministicBaseline.personal_info.links.github,
                portfolio: pInfo.portfolio || deterministicBaseline.personal_info.links.portfolio,
              },
            },
            education:
              Array.isArray(extracted.education) && extracted.education.length > 0
                ? extracted.education.map((edu: Record<string, unknown>, idx: number) => {
                    const baseEdu = deterministicBaseline.education[idx] || deterministicBaseline.education[0];
                    return {
                      institution: String(edu.institution || baseEdu?.institution || ''),
                      degree: String(edu.degree || baseEdu?.degree || 'B.Tech'),
                      major: String(edu.major || baseEdu?.major || 'Computer Science'),
                      gpa: Number(edu.gpa) || baseEdu?.gpa || 8.5,
                      start_date: String(edu.start_date || baseEdu?.start_date || '2022-08'),
                      end_date: String(edu.end_date || baseEdu?.end_date || '2026-05'),
                      is_current: Boolean(edu.is_current ?? baseEdu?.is_current),
                    };
                  })
                : deterministicBaseline.education,
            work_experience:
              Array.isArray(extracted.work_experience) && extracted.work_experience.length > 0
                ? extracted.work_experience.map((exp: Record<string, unknown>, idx: number) => {
                    const baseExp = deterministicBaseline.work_experience[idx];
                    return {
                      company: String(exp.company || baseExp?.company || ''),
                      role: String(exp.role || baseExp?.role || ''),
                      location: String(exp.location || baseExp?.location || pInfo.city || 'India'),
                      start_date: String(exp.start_date || baseExp?.start_date || '2024-05'),
                      end_date: String(exp.end_date || baseExp?.end_date || '2024-08'),
                      is_current: Boolean(exp.is_current ?? baseExp?.is_current),
                      description_bullets:
                        Array.isArray(exp.description_bullets) && exp.description_bullets.length > 0
                          ? exp.description_bullets.map(String)
                          : baseExp?.description_bullets || ['Delivered key software engineering modules.'],
                    };
                  })
                : deterministicBaseline.work_experience,
            projects:
              Array.isArray(extracted.projects) && extracted.projects.length > 0
                ? extracted.projects.map((proj: Record<string, unknown>, idx: number) => {
                    const baseProj = deterministicBaseline.projects[idx];
                    return {
                      title: String(proj.title || baseProj?.title || ''),
                      tech_stack:
                        Array.isArray(proj.tech_stack) && proj.tech_stack.length > 0
                          ? proj.tech_stack.map(String)
                          : baseProj?.tech_stack || ['TypeScript', 'Python'],
                      description: String(proj.description || baseProj?.description || proj.title || ''),
                      url: String(proj.url || baseProj?.url || ''),
                    };
                  })
                : deterministicBaseline.projects,
            skills:
              Array.isArray(extracted.skills) && extracted.skills.length > 0
                ? Array.from(new Set([...extracted.skills.map(String), ...deterministicBaseline.skills])).slice(0, 24)
                : deterministicBaseline.skills,
            application_metadata: existingMetadata,
          };

          res.json({
            profile: fullProfile,
            extractedText: extractedText || '',
            engine: `${modelUsed} (Gemini AI + Layout PDF Parser)`,
          });
          return;
        }
      } catch (err) {
        console.warn('Gemini resume parse cascade fallback triggered:', err);
      }
    }

    res.json({
      profile: deterministicBaseline,
      extractedText:
        extractedText ||
        `Extracted from ${fileName || 'uploaded PDF'}: ${deterministicBaseline.personal_info.first_name} ${deterministicBaseline.personal_info.last_name}`,
      engine: 'layout-aware-pdf-parser',
    });
  });

  // FR 2.3 & FR 2.5: Full AI Agent Form Question & Type Analyzer + Answer Generator
  app.post('/api/agent/plan-form', async (req, res) => {
    const { questions, elements, profile, jobDescription, cachedResumeFileName } = req.body || {};
    const safeProfile = profile || DEFAULT_USER_PROFILE;
    const safeJd = jobDescription || 'Software Engineer — Autonomous Agent Systems';

    const detectedQuestions: DetectedFormQuestion[] = Array.isArray(questions)
      ? questions
      : Array.isArray(elements)
      ? convertDistilledElementsToQuestions(elements)
      : [];

    if (detectedQuestions.length === 0) {
      res.json({ questions: [], answers: [], engine: 'ai-form-agent' });
      return;
    }

    // 1. Compute instant baseline answers for every detected question & control type
    const baselineAnswers = reasonAnswerForQuestions(
      detectedQuestions,
      safeProfile,
      safeJd,
      cachedResumeFileName
    );

    // 2. Enhance with Gemini AI so any arbitrary/unseen question is answered from the candidate's profile
    const ai = getGeminiClient();
    if (ai) {
      try {
        const compactQuestions = detectedQuestions.map((q) => ({
          question_id: q.question_id,
          question_text: q.question_text,
          question_type: q.question_type,
          date_format: q.date_format || null,
          options: (q.options || []).slice(0, 20).map((o) => o.label),
        }));

        const { response, modelUsed } = await generateWithFastModelCascade(ai, {
          contents: `You are an autonomous Job Application AI Agent. Given the candidate's JSON profile and the form questions extracted from the webpage, generate the exact answer for EVERY question according to its question_type:
- DROPDOWN or OPTION_SELECTION: Pick the exact matching option string from the question's "options" list (or "Checked (Yes)" / "Unchecked (No)" for single checkboxes).
- DT_PICKER: Format the relevant date from the candidate's profile into the exact "date_format" (e.g. YYYY-MM-DD or YYYY-MM).
- NUMBER_INPUT: Output only the numeric value (e.g. GPA, notice period days, CTC, or years of experience).
- SHORT_TEXT: Output the concise factual value from the candidate's profile.
- LONG_ESSAY: Write a compelling first-person answer (at least 160 characters) citing specific companies, projects, tech stack, and metrics from the candidate's profile.

Return ONLY valid JSON (no markdown fences) in this format:
{
  "answers": [
    {
      "question_id": "q_1",
      "answer": "string",
      "profile_source": "which profile field was used",
      "reasoning": "1 short sentence explaining how the answer matches the question type and profile"
    }
  ]
}

Candidate Profile JSON:
${JSON.stringify(safeProfile)}

Target Job Context:
${safeJd}

Form Questions:
${JSON.stringify(compactQuestions)}`,
          config: {
            systemInstruction:
              'You are an autonomous AI Form-Filling Agent. Output ONLY valid JSON mapping every question_id to its profile-grounded answer.',
          },
        });

        const rawJson = response.text || '';
        const parsed = parseJsonFromLlmText(rawJson);
        if (parsed && Array.isArray(parsed.answers)) {
          const aiMap = new Map<
            string,
            { answer?: string; profile_source?: string; reasoning?: string }
          >();
          for (const item of parsed.answers) {
            if (item && item.question_id) {
              aiMap.set(String(item.question_id), item);
            }
          }

          const mergedAnswers = baselineAnswers.map((baseAns) => {
            const qObj = detectedQuestions.find((q) => q.question_id === baseAns.question_id);
            const aiItem = aiMap.get(baseAns.question_id);
            if (!aiItem || !aiItem.answer || !String(aiItem.answer).trim()) {
              return baseAns;
            }

            let finalAns = String(aiItem.answer).trim();
            let selectedOptAgentId = baseAns.selected_option_agent_id;
            let selectedOptVal = baseAns.selected_option_value;

            if (qObj && (qObj.question_type === 'DROPDOWN' || qObj.question_type === 'OPTION_SELECTION')) {
              if (qObj.options && qObj.options.length > 0) {
                const matched = matchBestOption(qObj.options, finalAns, qObj.question_text);
                if (matched) {
                  finalAns = matched.label;
                  selectedOptVal = matched.value;
                  if (matched.agent_id) selectedOptAgentId = matched.agent_id;
                }
              }
            } else if (qObj && qObj.question_type === 'DT_PICKER') {
              finalAns = formatProfileDateForPicker(
                finalAns,
                qObj.date_format || 'YYYY-MM-DD',
                baseAns.answer
              );
            }

            return {
              ...baseAns,
              answer: finalAns,
              selected_option_agent_id: selectedOptAgentId,
              selected_option_value: selectedOptVal,
              profile_source: aiItem.profile_source || baseAns.profile_source,
              reasoning: aiItem.reasoning || baseAns.reasoning,
            };
          });

          res.json({
            questions: detectedQuestions,
            answers: mergedAnswers,
            engine: `${modelUsed} (AI Form Question & Type Agent)`,
          });
          return;
        }
      } catch (err) {
        console.warn('Gemini plan-form fallback triggered:', err);
      }
    }

    res.json({
      questions: detectedQuestions,
      answers: baselineAnswers,
      engine: 'profile-question-type-agent',
    });
  });

  // FR 2.5: Open-Ended Question Generation
  app.post('/api/agent/generate-answer', async (req, res) => {
    const { questionLabel, profile, jobDescription } = req.body || {};
    const safeProfile = profile || DEFAULT_USER_PROFILE;
    const safeQuestion = questionLabel || 'Why are you a strong fit for this role?';
    const safeJd = jobDescription || 'Software Engineer — Autonomous Agent Systems';

    const ai = getGeminiClient();
    if (ai) {
      try {
        const { response, modelUsed } = await generateWithFastModelCascade(ai, {
          contents: `Candidate Profile JSON:\n${JSON.stringify(safeProfile)}\n\nTarget Job Description:\n${safeJd}\n\nScreening Question:\n${safeQuestion}\n\nWrite a concrete, first-person 90-to-120 word answer (minimum 160 characters) citing specific projects, metrics, and work experience from the candidate's profile.`,
          config: {
            systemInstruction:
              'You are an expert technical candidate answering an ATS screening question. Write a concise, authentic 100-word paragraph (at least 160 characters) with concrete engineering metrics.',
          },
        });
        const generated = response.text?.trim();
        if (generated && generated.length >= 150) {
          res.json({ answer: generated, engine: modelUsed });
          return;
        }
      } catch (err) {
        console.warn('Gemini screening question fallback triggered:', err);
      }
    }

    const fallbackAnswer = generateTailoredScreeningAnswer(safeQuestion, safeProfile, safeJd);
    res.json({ answer: fallbackAnswer, engine: 'contextual-profile-synthesizer' });
  });

  // FR 5.3: LLM Email Classification Pipeline
  app.post('/api/email/classify', async (req, res) => {
    const { email, applications } = req.body || {};
    if (!email || !email.subject) {
      res.status(400).json({ error: 'Email payload with subject and body is required.' });
      return;
    }

    const appList = Array.isArray(applications) ? applications : [];
    const ai = getGeminiClient();

    if (ai) {
      try {
        const { response, modelUsed } = await generateWithFastModelCascade(ai, {
          contents: `Active Applications:\n${JSON.stringify(appList)}\n\nIncoming Email:\nSender: ${email.sender}\nSubject: ${email.subject}\nBody: ${email.body}`,
          config: {
            systemInstruction:
              'Classify the incoming recruiter email against the user active job applications. Output strict JSON matching the schema.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                matched_application_id: { type: Type.STRING },
                company: { type: Type.STRING },
                new_status: {
                  type: Type.STRING,
                  description:
                    'One of: APPLIED, OA_RECEIVED, INTERVIEW_SCHEDULED, REJECTED, OFFER',
                },
                action_required: { type: Type.STRING },
                confidence_score: { type: Type.NUMBER },
              },
              required: [
                'matched_application_id',
                'company',
                'new_status',
                'action_required',
                'confidence_score',
              ],
            },
          },
        });

        const text = response.text;
        if (text) {
          const classification = JSON.parse(text);
          res.json({ classification, engine: modelUsed });
          return;
        }
      } catch (err) {
        console.warn('Gemini email classification fallback triggered:', err);
      }
    }

    const classification = classifyRecruiterEmailDeterministic(email, appList);
    res.json({ classification, engine: 'deterministic-classifier' });
  });

  // Part 2 Page 4: Simulate Recruiter Reply Trigger
  app.post('/api/mock-ats/send-recruiter-email', async (req, res) => {
    const { templateType, candidateEmail, candidateName, companyName, roleTitle, applications } =
      req.body || {};
    const company = companyName || 'Chronos Enterprise AI';
    const role = roleTitle || 'Software Engineer — Autonomous Agent Systems';
    const recipient = candidateEmail || 'lakshaychhabra248@gmail.com';
    const firstName = candidateName || 'Candidate';

    let subject = `Application Received: ${role} at ${company}`;
    let body = `Hi ${firstName}, Thank you for submitting your application for the ${role} position at ${company}. Our recruiting team has received your profile and will review your qualifications shortly.`;
    let sender = `talent-acquisition@${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.ai`;

    if (templateType === 'oa_invite') {
      subject = `Online Assessment Invite: ${company} — HackerRank Challenge`;
      body = `Hello ${firstName}, Your application for ${role} at ${company} stood out to our engineering committee. Please complete the mandatory 90-minute HackerRank Online Assessment by Oct 28 at 11:59 PM IST.`;
      sender = `assessments@${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.ai`;
    } else if (templateType === 'rejection') {
      subject = `Update on your application with ${company}`;
      body = `Dear ${firstName}, Thank you for taking the time to apply for ${role} at ${company}. While your background is impressive, we have decided not to move forward with your candidacy for this opening.`;
      sender = `no-reply@${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.ai`;
    } else if (templateType === 'interview_invite') {
      subject = `Interview Invitation: ${company} Final Systems Design Round`;
      body = `Hi ${firstName}, We were impressed by your assessment results for ${role} at ${company}! Please select a slot for a 60-minute Systems Architecture interview this Thursday.`;
    }

    const emailObj = {
      id: `msg-${Date.now()}`,
      sender,
      recipient,
      subject,
      body,
      received_at: new Date().toISOString(),
    };

    const classification = classifyRecruiterEmailDeterministic(
      emailObj,
      Array.isArray(applications) ? applications : []
    );

    res.json({
      email: {
        ...emailObj,
        classification,
      },
      classification,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AutoApply AI & MockATS Server running on http://localhost:${PORT}`);
  });
}

startServer();
