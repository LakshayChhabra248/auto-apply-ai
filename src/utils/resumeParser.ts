import { UserProfileSchema } from '../types/autoapply';

const KNOWN_CITIES: Array<{ city: string; state: string; country: string }> = [
  { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
  { city: 'Bangalore', state: 'Karnataka', country: 'India' },
  { city: 'Mumbai', state: 'Maharashtra', country: 'India' },
  { city: 'New Delhi', state: 'Delhi', country: 'India' },
  { city: 'Delhi', state: 'Delhi', country: 'India' },
  { city: 'Noida', state: 'Uttar Pradesh', country: 'India' },
  { city: 'Greater Noida', state: 'Uttar Pradesh', country: 'India' },
  { city: 'Gurugram', state: 'Haryana', country: 'India' },
  { city: 'Gurgaon', state: 'Haryana', country: 'India' },
  { city: 'Faridabad', state: 'Haryana', country: 'India' },
  { city: 'Ghaziabad', state: 'Uttar Pradesh', country: 'India' },
  { city: 'Hyderabad', state: 'Telangana', country: 'India' },
  { city: 'Pune', state: 'Maharashtra', country: 'India' },
  { city: 'Chennai', state: 'Tamil Nadu', country: 'India' },
  { city: 'Kolkata', state: 'West Bengal', country: 'India' },
  { city: 'Chandigarh', state: 'Chandigarh', country: 'India' },
  { city: 'Jaipur', state: 'Rajasthan', country: 'India' },
  { city: 'Ahmedabad', state: 'Gujarat', country: 'India' },
  { city: 'Indore', state: 'Madhya Pradesh', country: 'India' },
  { city: 'Bhopal', state: 'Madhya Pradesh', country: 'India' },
  { city: 'Lucknow', state: 'Uttar Pradesh', country: 'India' },
  { city: 'Kanpur', state: 'Uttar Pradesh', country: 'India' },
  { city: 'Patna', state: 'Bihar', country: 'India' },
  { city: 'Kochi', state: 'Kerala', country: 'India' },
  { city: 'Coimbatore', state: 'Tamil Nadu', country: 'India' },
  { city: 'Roorkee', state: 'Uttarakhand', country: 'India' },
  { city: 'Kharagpur', state: 'West Bengal', country: 'India' },
  { city: 'Guwahati', state: 'Assam', country: 'India' },
  { city: 'Varanasi', state: 'Uttar Pradesh', country: 'India' },
  { city: 'Pilani', state: 'Rajasthan', country: 'India' },
  { city: 'Vellore', state: 'Tamil Nadu', country: 'India' },
  { city: 'Manipal', state: 'Karnataka', country: 'India' },
  { city: 'Patiala', state: 'Punjab', country: 'India' },
  { city: 'Jalandhar', state: 'Punjab', country: 'India' },
  { city: 'Amritsar', state: 'Punjab', country: 'India' },
  { city: 'Ludhiana', state: 'Punjab', country: 'India' },
  { city: 'Surat', state: 'Gujarat', country: 'India' },
  { city: 'Nagpur', state: 'Maharashtra', country: 'India' },
  { city: 'San Francisco', state: 'CA', country: 'USA' },
  { city: 'New York', state: 'NY', country: 'USA' },
  { city: 'Seattle', state: 'WA', country: 'USA' },
  { city: 'London', state: 'England', country: 'UK' },
  { city: 'Singapore', state: 'Singapore', country: 'Singapore' },
];

const KNOWN_SKILLS_DICTIONARY = [
  'Python',
  'TypeScript',
  'JavaScript',
  'C++',
  'C',
  'Java',
  'Go',
  'Golang',
  'Rust',
  'SQL',
  'HTML',
  'CSS',
  'Bash',
  'R',
  'Kotlin',
  'Swift',
  'PHP',
  'Ruby',
  'Scala',
  'React',
  'React.js',
  'Next.js',
  'Node.js',
  'Express.js',
  'FastAPI',
  'Flask',
  'Django',
  'Spring Boot',
  'Tailwind CSS',
  'Redux',
  'GraphQL',
  'REST API',
  'gRPC',
  'WebSockets',
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'Redis',
  'Supabase',
  'Firebase',
  'SQLite',
  'DynamoDB',
  'Cassandra',
  'Prisma',
  'Docker',
  'Kubernetes',
  'AWS',
  'GCP',
  'Google Cloud',
  'Azure',
  'Linux',
  'Git',
  'GitHub Actions',
  'CI/CD',
  'Terraform',
  'Nginx',
  'Kafka',
  'RabbitMQ',
  'Machine Learning',
  'Deep Learning',
  'NLP',
  'Computer Vision',
  'Generative AI',
  'LLMs',
  'RAG',
  'LangChain',
  'LangGraph',
  'LlamaIndex',
  'PyTorch',
  'TensorFlow',
  'Scikit-learn',
  'Keras',
  'OpenCV',
  'Hugging Face',
  'Pandas',
  'NumPy',
  'Matplotlib',
  'Spark',
  'Playwright',
  'Selenium',
  'Jest',
  'Cypress',
  'Figma',
];

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

/**
 * Normalizes raw PDF text by ensuring section headers and bullet symbols start on their own lines,
 * even if the PDF extractor flattened multiple lines together.
 */
export function normalizeResumeText(rawText: string): string {
  let text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Replace common PDF bullet glyphs with newline + bullet
  text = text.replace(/\s*[•●▪❖➢◦∙]\s*/g, '\n- ');

  // Ensure standalone section headers are on their own lines if flattened
  const sectionHeaders = [
    'EDUCATION',
    'ACADEMIC BACKGROUND',
    'ACADEMIC QUALIFICATIONS',
    'WORK EXPERIENCE',
    'PROFESSIONAL EXPERIENCE',
    'EXPERIENCE',
    'INTERNSHIPS',
    'EMPLOYMENT HISTORY',
    'PROJECTS',
    'KEY PROJECTS',
    'PERSONAL PROJECTS',
    'ACADEMIC PROJECTS',
    'TECHNICAL SKILLS',
    'SKILLS & INTERESTS',
    'SKILLS',
    'CORE COMPETENCIES',
    'TECHNOLOGIES',
    'ACHIEVEMENTS',
    'CERTIFICATIONS',
    'POSITIONS OF RESPONSIBILITY',
    'EXTRACURRICULAR',
  ];

  for (const header of sectionHeaders) {
    // Match header preceded by newline or 2+ spaces/pipes and followed by newline/colon/pipe
    const regex = new RegExp(`(?:^|\\n|\\s{2,}|\\|\\s*)(${header})(?:\\s*[:|]?\\s*)(?=\\n|[A-Z0-9])`, 'gi');
    text = text.replace(regex, '\n$1\n');
  }

  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Parses a date range string like "May 2024 - Aug 2024", "Jan '23 – Present", "2022 - 2026"
 */
export function parseDateRange(text: string): {
  start_date: string;
  end_date: string;
  is_current: boolean;
  matchedSubstring: string;
} | null {
  const monthPattern =
    '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  const dateToken = `(?:${monthPattern}[\\s',.-]*\\d{2,4}|\\d{1,2}\\/\\d{4}|(?:19|20)\\d{2})`;
  const endToken = `(?:Present|Current|Ongoing|Now|${dateToken})`;
  const rangeRegex = new RegExp(`(${dateToken})\\s*(?:[-–—]|to)\\s*(${endToken})`, 'i');

  const match = text.match(rangeRegex);
  if (!match) return null;

  const parseSingleDate = (token: string, defaultMonth: string): string => {
    const clean = token.trim().toLowerCase();
    if (/present|current|ongoing|now/i.test(clean)) {
      return '2026-05';
    }
    const slashMatch = clean.match(/^(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      return `${slashMatch[2]}-${slashMatch[1].padStart(2, '0')}`;
    }
    const yearMatch = clean.match(/(20\d{2}|19\d{2})/);
    const shortYearMatch = !yearMatch ? clean.match(/['\s-](\d{2})$/) : null;
    const year = yearMatch
      ? yearMatch[1]
      : shortYearMatch
      ? `20${shortYearMatch[1]}`
      : '2025';

    for (const [mKey, mNum] of Object.entries(MONTH_MAP)) {
      if (new RegExp(`\\b${mKey}\\b`, 'i').test(clean)) {
        return `${year}-${mNum}`;
      }
    }
    return `${year}-${defaultMonth}`;
  };

  const is_current = /present|current|ongoing|now/i.test(match[2]);
  return {
    start_date: parseSingleDate(match[1], '05'),
    end_date: parseSingleDate(match[2], '08'),
    is_current,
    matchedSubstring: match[0],
  };
}

/**
 * Extracts a clean candidate name from the top lines of resume text or the filename.
 */
export function extractNameFromTextOrFilename(
  rawText: string,
  fileName?: string
): { first_name: string; last_name: string } {
  const normalized = normalizeResumeText(rawText);
  const lines = normalized.split('\n').filter(Boolean);

  const bannedWords = new Set([
    'resume',
    'curriculum',
    'vitae',
    'cv',
    'education',
    'experience',
    'projects',
    'skills',
    'summary',
    'objective',
    'profile',
    'contact',
    'india',
    'btech',
    'mtech',
    'dtu',
    'iit',
    'nit',
    'iiit',
    'bits',
    'university',
    'institute',
    'college',
    'engineering',
    'engineer',
    'developer',
    'software',
  ]);

  for (const line of lines.slice(0, 8)) {
    const firstSegment = line.split(/[|•·]/)[0].trim();
    if (
      firstSegment.includes('@') ||
      firstSegment.includes('http') ||
      firstSegment.includes('linkedin') ||
      firstSegment.includes('github') ||
      /\d{4,}/.test(firstSegment)
    ) {
      continue;
    }

    const cleanWords = firstSegment
      .replace(/[^a-zA-Z\s.-]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 2);

    if (
      cleanWords.length >= 1 &&
      cleanWords.length <= 4 &&
      !cleanWords.some((w) => bannedWords.has(w.toLowerCase()))
    ) {
      if (cleanWords.length === 1 && cleanWords[0].length <= 3 && fileName) {
        continue;
      }
      const formatToken = (w: string) =>
        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      return {
        first_name: formatToken(cleanWords[0]),
        last_name: cleanWords.slice(1).map(formatToken).join(' ') || '',
      };
    }
  }

  if (fileName) {
    const baseName = fileName
      .replace(/\.[^.]+$/, '')
      .replace(/resume|cv|updated|final|202\d/gi, ' ')
      .replace(/[_\-.]+/g, ' ')
      .trim();
    const parts = baseName
      .split(/\s+/)
      .filter((p) => /^[a-zA-Z]{2,}$/.test(p) && !bannedWords.has(p.toLowerCase()));
    if (parts.length >= 1) {
      const formatToken = (w: string) =>
        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      return {
        first_name: formatToken(parts[0]),
        last_name: parts.slice(1).map(formatToken).join(' ') || '',
      };
    }
  }

  return { first_name: 'Candidate', last_name: '' };
}

const ACTION_VERB_START_REGEX =
  /^(?:Built|Developed|Engineered|Designed|Implemented|Created|Architected|Automated|Reduced|Improved|Optimized|Integrated|Deployed|Trained|Fine-tuned|Constructed|Led|Collaborated|Utilized|Leveraged|Spearheaded|Maintained|Refactored|Migrated|Authored|Researched|Analyzed|Tested|Delivered|Configured|Established|Scaled)\b/i;

/**
 * Parses unstructured resume text into a complete, rich UserProfileSchema.
 */
export function parseResumeTextToProfile(
  rawText: string,
  fileName?: string,
  existingMetadata?: UserProfileSchema['application_metadata']
): UserProfileSchema {
  const normalizedText = normalizeResumeText(rawText);
  const { first_name, last_name } = extractNameFromTextOrFilename(normalizedText, fileName);

  // Email
  const emailMatch = normalizedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0].toLowerCase() : '';

  // Phone
  const phoneMatch = normalizedText.match(
    /(?:\(?(\+?\d{1,3})\)?[-.\s]?)?(\d{10}|\d{5}[-.\s]\d{5}|\d{3}[-.\s]\d{3}[-.\s]\d{4})/
  );
  const country_code = phoneMatch?.[1] ? `+${phoneMatch[1].replace(/^\+/, '')}` : '+91';
  const phoneNumber = phoneMatch?.[2] ? phoneMatch[2].replace(/\D/g, '') : '';

  // Links
  const linkedinMatch = normalizedText.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i
  );
  const githubMatch = normalizedText.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i
  );
  const portfolioMatch = normalizedText.match(
    /https?:\/\/(?!(?:www\.)?(?:linkedin|github)\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s,)]*)?/i
  );

  // Location: check contact header lines (first 3 lines) by earliest position in text
  const allLines = normalizedText.split('\n').filter(Boolean);
  const headerText = allLines.slice(0, 3).join('\n');
  const pincodeMatch = headerText.match(/\b([1-8]\d{5})\b/) || normalizedText.match(/\b([1-8]\d{5})\b/);
  let detectedLocation = {
    address: '',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: pincodeMatch ? pincodeMatch[1] : '',
    country: 'India',
  };

  const findEarliestCity = (searchText: string) => {
    let bestLoc: (typeof KNOWN_CITIES)[0] | null = null;
    let bestIdx = Infinity;
    for (const loc of KNOWN_CITIES) {
      const m = new RegExp(`\\b${loc.city}\\b`, 'i').exec(searchText);
      if (m && m.index < bestIdx) {
        bestIdx = m.index;
        bestLoc = loc;
      }
    }
    return bestLoc;
  };

  const matchedLoc = findEarliestCity(headerText) || findEarliestCity(normalizedText);
  if (matchedLoc) {
    detectedLocation = {
      address: matchedLoc.city,
      city: matchedLoc.city === 'Bangalore' ? 'Bengaluru' : matchedLoc.city,
      state: matchedLoc.state,
      pincode: pincodeMatch ? pincodeMatch[1] : '',
      country: matchedLoc.country,
    };
  }

  // Split lines into sections
  const lines = allLines;
  type SectionKey = 'header' | 'education' | 'experience' | 'projects' | 'skills' | 'other';
  let currentSection: SectionKey = 'header';
  const sections: Record<SectionKey, string[]> = {
    header: [],
    education: [],
    experience: [],
    projects: [],
    skills: [],
    other: [],
  };

  for (const line of lines) {
    const cleanHeader = line
      .replace(/^[-•*▪#]+\s*/, '')
      .replace(/[:|—–-]+$/, '')
      .trim()
      .toUpperCase();

    if (
      /^(EDUCATION|ACADEMIC BACKGROUND|ACADEMIC QUALIFICATIONS|ACADEMICS|SCHOLASTIC|EDUCATION & QUALIFICATIONS)$/i.test(
        cleanHeader
      )
    ) {
      currentSection = 'education';
      continue;
    }
    if (
      /^(EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|INTERNSHIPS|EMPLOYMENT|EMPLOYMENT HISTORY|INDUSTRIAL EXPERIENCE|EXPERIENCE & INTERNSHIPS|WORK HISTORY)$/i.test(
        cleanHeader
      )
    ) {
      currentSection = 'experience';
      continue;
    }
    if (
      /^(PROJECTS|KEY PROJECTS|ACADEMIC PROJECTS|PERSONAL PROJECTS|TECHNICAL PROJECTS|SELECTED PROJECTS|PROJECTS & RESEARCH)$/i.test(
        cleanHeader
      )
    ) {
      currentSection = 'projects';
      continue;
    }
    if (
      /^(SKILLS|TECHNICAL SKILLS|SKILLS & INTERESTS|CORE COMPETENCIES|TECHNOLOGIES|PROGRAMMING SKILLS|TECH STACK|SKILLS & TOOLS|TECHNICAL PROFICIENCY)$/i.test(
        cleanHeader
      )
    ) {
      currentSection = 'skills';
      continue;
    }
    if (
      /^(ACHIEVEMENTS|AWARDS|CERTIFICATIONS|POSITIONS OF RESPONSIBILITY|EXTRACURRICULAR|PUBLICATIONS|HONORS & AWARDS)$/i.test(
        cleanHeader
      )
    ) {
      currentSection = 'other';
      continue;
    }

    sections[currentSection].push(line);
  }

  // 1. Parse Education
  const education: UserProfileSchema['education'] = [];
  const eduSourceLines = sections.education.length > 0 ? sections.education : lines;
  const instRegex =
    /\b(University|Institute|College|School|Vidyalaya|Academy|IIT|NIT|IIIT|BITS|DTU|NSUT|VIT|SRM|Thapar|Manipal|IIITD|PEC|Jadavpur|Amity|LPU|UPES)\b/i;
  const degreeRegex =
    /\b(B\.?\s*Tech|M\.?\s*Tech|B\.?\s*E\.?|M\.?\s*E\.?|B\.?\s*S\.?|M\.?\s*S\.?|B\.?\s*Sc|M\.?\s*Sc|BCA|MCA|BBA|MBA|Ph\.?\s*D|Bachelor of Technology|Bachelor of Engineering|Master of Technology|Master of Science|Class XII|Class X)\b/i;
  const majorRegex =
    /\b((?:Computer Science(?:\s*(?:&|and)\s*Engineering)?|Information Technology|Artificial Intelligence(?:\s*(?:&|and)\s*(?:Machine Learning|Data Science))?|Data Science(?:\s*(?:&|and)\s*Engineering)?|Mathematics\s*(?:&|and)\s*Computing|Electronics(?:\s*(?:&|and)\s*Communication(?:\s*Engineering)?)?|Electrical(?:\s*(?:&|and)\s*Electronics(?:\s*Engineering)?)?|Mechanical Engineering|Software Engineering|Civil Engineering|Chemical Engineering)(?:\s*\([^)]+\))?)/i;

  for (let i = 0; i < eduSourceLines.length; i++) {
    const line = eduSourceLines[i];
    const hasInst = instRegex.test(line);
    const hasDeg = degreeRegex.test(line);

    if (hasInst || (sections.education.length > 0 && hasDeg)) {
      const nextLine = eduSourceLines[i + 1] || '';
      const nextHasInst = instRegex.test(nextLine);
      const nextHasDeg = degreeRegex.test(nextLine);
      const nextHasGpa = /(?:CGPA|GPA|CPI|Percentage|%)/i.test(nextLine);

      // Combine with nextLine if nextLine is the companion degree/GPA line (or companion institution line)
      const shouldMergeNext =
        Boolean(nextLine) &&
        ((hasInst && !hasDeg && (nextHasDeg || nextHasGpa)) ||
          (!hasInst && hasDeg && nextHasInst) ||
          (hasInst && nextHasGpa && !nextHasInst));

      const combined = shouldMergeNext ? `${line} | ${nextLine}` : line;

      const degMatch = combined.match(degreeRegex);
      const majorMatch = combined.match(majorRegex);
      const gpaMatch =
        combined.match(/(?:CGPA|GPA|CPI|Score)[:\s-]*([0-9]+\.[0-9]+|[0-9]+)(?:\s*\/\s*10)?/i) ||
        combined.match(/\b([6-9]\.\d{1,2})\s*\/\s*10(?:\.0)?\b/) ||
        combined.match(/\b([7-9]\d(?:\.\d+)?)\s*%/);
      const dateRange = parseDateRange(combined);

      // Pick the segment that actually contains the institution name
      const instSourceLine = !hasInst && nextHasInst ? nextLine : line;
      const instSegments = instSourceLine
        .replace(dateRange?.matchedSubstring || '', '')
        .split(/[|—–]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const instClean =
        instSegments.find((s) => instRegex.test(s)) || instSegments[0] || instSourceLine.trim();

      if (instClean.length >= 3 && !education.some((e) => e.institution === instClean)) {
        let normalizedDegree = degMatch ? degMatch[1].trim() : 'B.Tech';
        if (/Bachelor of Technology/i.test(normalizedDegree)) normalizedDegree = 'B.Tech';
        if (/Bachelor of Engineering/i.test(normalizedDegree)) normalizedDegree = 'B.E.';

        education.push({
          institution: instClean,
          degree: normalizedDegree,
          major: majorMatch ? majorMatch[1].trim() : 'Computer Science & Engineering',
          gpa: gpaMatch ? parseFloat(gpaMatch[1]) : 8.5,
          start_date: dateRange?.start_date || '2022-08',
          end_date: dateRange?.end_date || '2026-05',
          is_current: dateRange?.is_current ?? false,
        });
      }

      if (shouldMergeNext) {
        i++; // Skip companion line so it isn't re-parsed as a second institution
      }
      if (education.length >= 3) break;
    }
  }

  if (education.length === 0) {
    const degMatch = normalizedText.match(degreeRegex);
    const majorMatch = normalizedText.match(majorRegex);
    const gpaMatch = normalizedText.match(/(?:CGPA|GPA|CPI)[:\s-]*([0-9]+\.[0-9]+|[0-9]+)/i);
    education.push({
      institution: sections.education[0] || 'Institute of Technology',
      degree: degMatch ? degMatch[1] : 'B.Tech',
      major: majorMatch ? majorMatch[1].trim() : 'Computer Science & Engineering',
      gpa: gpaMatch ? parseFloat(gpaMatch[1]) : 8.5,
      start_date: '2022-08',
      end_date: '2026-05',
      is_current: false,
    });
  }

  // 2. Parse Work Experience (supports 1-line headers AND 2-line Overleaf/LaTeX headers in either order)
  const work_experience: UserProfileSchema['work_experience'] = [];
  const roleRegex =
    /\b(Intern|Internship|Engineer|Developer|Analyst|Researcher|Fellow|Consultant|Architect|Lead|Associate|Scientist|Trainee|Member of Technical Staff|SDE|SWE|Mentee|Contributor)\b/i;

  if (sections.experience.length > 0) {
    let currentExp: UserProfileSchema['work_experience'][0] | null = null;

    for (const line of sections.experience) {
      const isBullet = /^[-•*▪]/.test(line);
      const startsWithActionVerb = ACTION_VERB_START_REGEX.test(line);
      const dateRange = parseDateRange(line);
      const hasRoleKeyword = roleRegex.test(line);

      // Check if this line is the 2nd line of a 2-line Experience Header (before any bullets)
      if (
        currentExp &&
        currentExp.description_bullets.length === 0 &&
        !isBullet &&
        !startsWithActionVerb &&
        line.length < 95 &&
        (!dateRange || currentExp.start_date === '2024-05')
      ) {
        const subLineWithoutDate = dateRange
          ? line.replace(dateRange.matchedSubstring, '').trim()
          : line;
        const subSegments = subLineWithoutDate
          .split(/[|—–,]/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 2);

        if (subSegments.length > 0) {
          if (!currentExp.company && subSegments[0]) {
            currentExp.company = subSegments[0];
            if (subSegments[1]) currentExp.location = subSegments.slice(1).join(', ');
            if (dateRange) {
              currentExp.start_date = dateRange.start_date;
              currentExp.end_date = dateRange.end_date;
              currentExp.is_current = dateRange.is_current;
            }
            continue;
          } else if (hasRoleKeyword && currentExp.role === 'Software Engineer') {
            const roleSeg = subSegments.find((s) => roleRegex.test(s)) || subSegments[0];
            const otherSegs = subSegments.filter((s) => s !== roleSeg);
            currentExp.role = roleSeg;
            if (otherSegs.length > 0) {
              currentExp.location = otherSegs.join(', ');
            }
            if (dateRange) {
              currentExp.start_date = dateRange.start_date;
              currentExp.end_date = dateRange.end_date;
              currentExp.is_current = dateRange.is_current;
            }
            continue;
          }
        }
      }

      if (
        !isBullet &&
        !startsWithActionVerb &&
        (dateRange || (hasRoleKeyword && line.length < 100))
      ) {
        if (currentExp) {
          if (!currentExp.company) currentExp.company = 'Technology Partner';
          work_experience.push(currentExp);
        }

        const lineWithoutDate = dateRange
          ? line.replace(dateRange.matchedSubstring, '').trim()
          : line;
        const segments = lineWithoutDate
          .replace(/^\d+\.\s*/, '')
          .split(/[|—–,-]/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 2);

        let company = '';
        let role = 'Software Engineer';
        let location = `${detectedLocation.city}, ${detectedLocation.state}`;

        if (segments.length === 1) {
          if (roleRegex.test(segments[0])) {
            role = segments[0];
            company = ''; // Will be filled by Line 2 if 2-line header
          } else {
            company = segments[0];
          }
        } else if (segments.length >= 2) {
          if (roleRegex.test(segments[0]) && !roleRegex.test(segments[1])) {
            role = segments[0];
            company = segments[1];
          } else {
            company = segments[0];
            role = segments[1];
          }
          if (segments[2]) {
            location = segments.slice(2).join(', ');
          }
        }

        currentExp = {
          company: company.slice(0, 80),
          role: role.slice(0, 80),
          location: location.slice(0, 60),
          start_date: dateRange?.start_date || '2024-05',
          end_date: dateRange?.end_date || '2024-08',
          is_current: dateRange?.is_current ?? false,
          description_bullets: [],
        };
      } else if (currentExp) {
        const cleanBullet = line.replace(/^[-•*▪]\s*/, '').trim();
        if (cleanBullet.length > 4) {
          currentExp.description_bullets.push(cleanBullet);
        }
      }
    }

    if (currentExp) {
      if (!currentExp.company) currentExp.company = 'Technology Partner';
      work_experience.push(currentExp);
    }
  }

  for (const exp of work_experience) {
    if (exp.description_bullets.length === 0) {
      exp.description_bullets.push(
        `Contributed to engineering architecture and product delivery as ${exp.role} at ${exp.company}.`
      );
    }
  }

  // 3. Parse Projects
  const projects: UserProfileSchema['projects'] = [];
  if (sections.projects.length > 0) {
    let currentProj: UserProfileSchema['projects'][0] | null = null;

    for (const line of sections.projects) {
      const isBullet = /^[-•*▪]/.test(line);
      const startsWithActionVerb = ACTION_VERB_START_REGEX.test(line);
      const dateRange = parseDateRange(line);
      const cleanNoDate = dateRange
        ? line.replace(dateRange.matchedSubstring, '').trim()
        : line;

      const isHeaderLine =
        !isBullet &&
        !startsWithActionVerb &&
        (cleanNoDate.includes('|') ||
          cleanNoDate.includes('—') ||
          (cleanNoDate.length < 75 && !cleanNoDate.endsWith('.')));

      if (isHeaderLine) {
        if (currentProj && (currentProj.description || currentProj.title)) {
          if (!currentProj.description) currentProj.description = currentProj.title;
          projects.push(currentProj);
        }
        const parts = cleanNoDate
          .split(/[|—–:]/)
          .map((p) => p.trim())
          .filter(Boolean);
        const title = (parts[0] || cleanNoDate).replace(/^\d+\.\s*/, '').trim();
        const extractedTech = KNOWN_SKILLS_DICTIONARY.filter((sk) =>
          new RegExp(`(?:^|[^a-zA-Z0-9])${sk.replace(/[.+]/g, '\\$&')}(?:$|[^a-zA-Z0-9])`, 'i').test(
            cleanNoDate
          )
        );
        // Keep only non-tech-list narrative parts for initial description
        const narrativeParts = parts.slice(1).filter((p) => {
          if (/^(github|live|link|demo|source|code|repo)$/i.test(p)) return false;
          const commaCount = (p.match(/,/g) || []).length;
          return commaCount === 0 && p.length > 25;
        });

        currentProj = {
          title: title.slice(0, 80),
          tech_stack:
            extractedTech.length > 0 ? extractedTech.slice(0, 7) : ['TypeScript', 'Python'],
          description: narrativeParts.join(' — '),
          url: githubMatch ? `https://${githubMatch[0].replace(/^https?:\/\//, '')}` : '',
        };
      } else if (currentProj) {
        const cleanBullet = line.replace(/^[-•*▪]\s*/, '').trim();
        currentProj.description = currentProj.description
          ? `${currentProj.description} ${cleanBullet}`
          : cleanBullet;
        const bulletTech = KNOWN_SKILLS_DICTIONARY.filter((sk) =>
          new RegExp(`(?:^|[^a-zA-Z0-9])${sk.replace(/[.+]/g, '\\$&')}(?:$|[^a-zA-Z0-9])`, 'i').test(
            cleanBullet
          )
        );
        if (bulletTech.length > 0) {
          currentProj.tech_stack = Array.from(
            new Set([...currentProj.tech_stack, ...bulletTech])
          ).slice(0, 8);
        }
      }
    }

    if (currentProj) {
      if (!currentProj.description) {
        currentProj.description = currentProj.title;
      }
      projects.push(currentProj);
    }
  }

  // If no explicit experience section was found, promote first project into work_experience so Page 2 has real candidate work
  if (work_experience.length === 0 && projects.length > 0) {
    work_experience.push({
      company: projects[0].title,
      role: 'Project Creator & Lead Developer',
      location: `${detectedLocation.city}, ${detectedLocation.state}`,
      start_date: '2024-08',
      end_date: '2025-05',
      is_current: false,
      description_bullets: [projects[0].description],
    });
  } else if (work_experience.length === 0) {
    work_experience.push({
      company: education[0]?.institution || 'Engineering Research Lab',
      role: 'Software Developer',
      location: `${detectedLocation.city}, ${detectedLocation.state}`,
      start_date: '2024-05',
      end_date: '2024-08',
      is_current: false,
      description_bullets: [
        lines.find((l) => l.length > 45 && !l.includes('@')) ||
          'Built full-stack and machine learning systems.',
      ],
    });
  }

  if (projects.length === 0 && work_experience.length > 0) {
    projects.push({
      title: `${work_experience[0].company} — ${work_experience[0].role}`,
      tech_stack: ['Python', 'TypeScript', 'React'],
      description: work_experience[0].description_bullets.join(' '),
      url: githubMatch ? `https://${githubMatch[0].replace(/^https?:\/\//, '')}` : '',
    });
  }

  // 4. Parse Skills
  const matchedDictionarySkills = KNOWN_SKILLS_DICTIONARY.filter((tech) =>
    new RegExp(`(?:^|[^a-zA-Z0-9])${tech.replace(/[.+]/g, '\\$&')}(?:$|[^a-zA-Z0-9])`, 'i').test(
      normalizedText
    )
  );

  let sectionSkills: string[] = [];
  if (sections.skills.length > 0) {
    sectionSkills = sections.skills
      .map((line) => line.replace(/^[A-Za-z\s&/]+:\s*/, '')) // Strip category prefix like "Languages: "
      .join(', ')
      .split(/[,|•·;/]/)
      .map((s) => s.replace(/[()]/g, '').trim())
      .filter((s) => s.length >= 2 && s.length <= 28 && !/^\d+$/.test(s));
  }

  const combinedSkills = Array.from(new Set([...sectionSkills, ...matchedDictionarySkills])).slice(
    0,
    20
  );

  return {
    personal_info: {
      first_name,
      last_name,
      email:
        email ||
        `${first_name.toLowerCase()}${
          last_name ? '.' + last_name.toLowerCase().replace(/\s+/g, '') : ''
        }@gmail.com`,
      phone: {
        country_code,
        number: phoneNumber || '9800000000',
      },
      location: detectedLocation,
      links: {
        linkedin: linkedinMatch
          ? `https://${linkedinMatch[0].replace(/^https?:\/\//, '')}`
          : '',
        github: githubMatch ? `https://${githubMatch[0].replace(/^https?:\/\//, '')}` : '',
        portfolio: portfolioMatch ? portfolioMatch[0] : '',
      },
    },
    education,
    work_experience,
    projects,
    skills:
      combinedSkills.length > 0
        ? combinedSkills
        : ['Python', 'TypeScript', 'React', 'Full-Stack Engineering'],
    application_metadata: existingMetadata || {
      work_authorization: true,
      requires_sponsorship: false,
      notice_period_days: 30,
      earliest_joining_date: '2026-11-15',
      expected_ctc_lpa: 24.0,
      current_ctc_lpa: 15.0,
      gender: 'Male',
      disability_status: 'No, I do not have a disability',
      veteran_status: 'I am not a protected veteran',
    },
  };
}
