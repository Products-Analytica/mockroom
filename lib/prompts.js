// Every prompt the interviewer uses. JSON calls describe their schema in the system prompt,
// since the Gemini OpenAI-compatible endpoint only takes response_format { type: 'json_object' }.
import { DIMS } from './format';

export const MAX_CHARS = 6000;
const clip = s => s.length > MAX_CHARS ? s.slice(0, MAX_CHARS) + '\n[truncated]' : s;

export const CATEGORIES = ['Introduction', 'Resume', 'Role fit', 'Technical/Domain', 'Behavioral', 'Situational', 'Motivation'];
const QSCHEMA = { type: 'object', properties: {
  role_title: { type: 'string' }, key_requirements: { type: 'array', items: { type: 'string' } },
  questions: { type: 'array', items: { type: 'object', properties: { category: { type: 'string', enum: CATEGORIES }, question: { type: 'string' }, looks_for: { type: 'string' } }, required: ['category', 'question', 'looks_for'] } }
}, required: ['role_title', 'key_requirements', 'questions'] };
const ESCHEMA = { type: 'object', properties: {
  scores: { type: 'object', properties: { relevance: { type: 'integer' }, depth: { type: 'integer' }, structure: { type: 'integer' }, evidence: { type: 'integer' }, communication: { type: 'integer' } }, required: DIMS },
  strengths: { type: 'array', items: { type: 'string' } }, improvements: { type: 'array', items: { type: 'string' } }, better_answer: { type: 'string' }
}, required: ['scores', 'strengths', 'improvements', 'better_answer'] };
const SSCHEMA = { type: 'object', properties: {
  summary: { type: 'string' }, top_strengths: { type: 'array', items: { type: 'string' } }, priority_improvements: { type: 'array', items: { type: 'string' } }, practice_plan: { type: 'array', items: { type: 'string' } }
}, required: ['summary', 'top_strengths', 'priority_improvements', 'practice_plan'] };
const withSchema = schema => `Respond only with a single JSON object, no code fences or commentary, that matches this JSON schema:\n${JSON.stringify(schema)}`;

const FOCUS = {
  balanced: 'A balanced mix: one introduction, resume questions, role-fit and domain questions, one or two behavioral questions, and a closing motivation question.',
  resume: 'Mostly deep-dive questions on specific projects, internships, achievements and choices in the resume, probing for the candidate\'s own contribution and results.',
  technical: 'Mostly technical and domain questions drawn from the skills and tools the JD requires, pitched at the level the role needs.',
  hr: 'Mostly HR and behavioral questions (teamwork, conflict, failure, leadership, pressure, career goals), tied to the resume where possible.'
};
const DIFF = { easy: 'Fresher-friendly: clear, approachable questions.', standard: 'Standard campus placement level.', tough: 'Tough: probing, specific and demanding, like a final-round interviewer.' };

const GEN_SYS = `You are a senior interviewer running a campus placement interview. Design a realistic interview tailored to this exact job description and this candidate's resume.
Rules:
- Reference real items from the resume (named projects, internships, skills, numbers) and real requirements from the JD. Never ask generic questions that could apply to anyone.
- Questions will be spoken aloud, so phrase them conversationally, the way a person talks across a table. Under 40 words, one question each, no lists, no brackets, no abbreviations like "e.g.".
- "looks_for" states in one short sentence what a strong answer would contain.
- key_requirements lists the 4-6 most important requirements in the JD.
${withSchema(QSCHEMA)}`;

const EVAL_SYS = `You are a strict but fair interview evaluator for campus placements. Score the candidate's answer.
Rubric, each scored 1-5:
- relevance: directly answers the question asked
- depth: specific and insightful, goes beyond the surface
- structure: logical flow (STAR for behavioral questions)
- evidence: concrete examples, numbers, outcomes
- communication: clear, concise, professional
1 = very poor, 3 = acceptable, 5 = excellent. Do not inflate. Very short, vague or off-topic answers score 1-2.
strengths: up to 2 points. improvements: up to 3 points. Each must refer to what the candidate actually said or left out.
better_answer: 2-4 sentences outlining how a strong candidate would answer, using the candidate's own background.
${withSchema(ESCHEMA)}`;

const SUM_SYS = `You are a placement coach writing a short debrief after a mock interview. Be direct, specific and encouraging without flattery.
summary: 2-3 sentences on overall performance. top_strengths: 2-3 points. priority_improvements: exactly 3 points, most important first. practice_plan: 3 concrete actions for the next few days.
${withSchema(SSCHEMA)}`;

const FU_SYS = 'You are the interviewer in a live spoken interview. React to the candidate\'s answer with ONE short, natural follow-up question (max 30 words) that probes a vague claim, a missing detail, or the reasoning behind it. Speak naturally, like a person. Keep every fact consistent with what the candidate said. Output only the question.';

export const questionsPrompt = ({ n, focus, difficulty, jd, resume }) => [
  { role: 'system', content: GEN_SYS },
  { role: 'user', content:
`Number of questions: ${n}
Focus: ${FOCUS[focus]}
Difficulty: ${DIFF[difficulty]}

JOB DESCRIPTION
"""
${clip(jd)}
"""

CANDIDATE RESUME
"""
${clip(resume)}
"""

Write exactly ${n} questions in the order they should be asked.` }
];

export const followupPrompt = ({ role, question, answer }) => [
  { role: 'system', content: FU_SYS },
  { role: 'user', content: `Role: ${role}\nQuestion: ${question}\nCandidate's answer: ${clip(answer)}` }
];

export const evalPrompt = ({ role, reqs, item: it }) => [
  { role: 'system', content: EVAL_SYS },
  { role: 'user', content:
`Role: ${role}
Key requirements: ${reqs.join('; ')}
Question type: ${it.category}${it.followup ? ' (follow-up)' : ''}
Question: ${it.question}
What a strong answer contains: ${it.looks_for}
${it.spoken ? 'Note: this answer was spoken and transcribed automatically. Ignore missing punctuation and obvious transcription errors.\n' : ''}Candidate's answer: """${clip(it.answer)}"""` }
];

export const summaryPrompt = ({ role, score, items }) => {
  const lines = items.map((it, i) => `${i + 1}. [${it.category}] ${it.question}\n   Score: ${it.score}/100${it.skipped ? ' (skipped)' : ''}\n   Gaps: ${(it.eval.improvements || []).join(' | ')}`).join('\n');
  return [
    { role: 'system', content: SUM_SYS },
    { role: 'user', content: `Role: ${role}\nOverall score: ${score}/100\n\nPer-question results:\n${lines}` }
  ];
};

// GD Topic Bank: match a JD to topics from the bank. The model only sees id, sector and title.
const GDSCHEMA = { type: 'object', properties: {
  role_summary: { type: 'string' },
  sectors: { type: 'array', items: { type: 'string' } },
  picks: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, reason: { type: 'string' } }, required: ['id', 'reason'] } }
}, required: ['role_summary', 'sectors', 'picks'] };

const GD_SYS = `You help MBA students prepare for group discussions (GDs) in placement interviews. Given a job description and a numbered list of GD topics, pick the topics a GD panel hiring for this role is most likely to use.
Rules:
- Only pick ids from the list provided. Never invent topics or ids.
- Pick 8 to 10 topics, ranked from most to least relevant.
- Each reason is one sentence that ties the topic to something specific in the JD (a responsibility, industry, skill or product it mentions).
- role_summary is one sentence describing the role.
- sectors lists up to 3 sector names from the list that fit this role best, spelled exactly as given.
${withSchema(GDSCHEMA)}`;

export const gdTopicsPrompt = ({ jd, topics }) => [
  { role: 'system', content: GD_SYS },
  { role: 'user', content:
`JOB DESCRIPTION
"""
${clip(jd)}
"""

GD TOPICS (id | sector | title)
${topics.map(t => `${t.id} | ${t.sector} | ${t.title}`).join('\n')}` }
];
