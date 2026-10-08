'use client';
import { memo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AuthGate, { useAuth } from '@/components/AuthGate';
import { toRows } from '@/lib/format';
import { getDraft, saveDraft, saveReport, syncReport } from '@/lib/local';

export default function Page(){ return <AuthGate needsKey><Interview /></AuthGate>; }

function Interview(){
  const { user } = useAuth();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if(started.current) return;
    started.current = true;
    let destroy = null, cancelled = false;
    (async () => {
      const draft = getDraft();
      const { mountInterview } = await import('@/lib/interview-engine');
      if(cancelled) return;
      destroy = mountInterview({
        resume: draft.resume || '',
        jd: draft.jd || '',
        // The resume and JD stay in this browser only.
        onStart: ({ jd, resume }) => saveDraft(resume, jd),
        onComplete: async session => {
          // The full report (answers and per-question feedback) is kept only on this device.
          // Only the summary row goes to the database; if that fails the report page offers a retry.
          const { row, items } = toRows(session, user.id);
          const report = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString(), items, synced: false };
          saveReport(report);
          await syncReport(report);
          router.push(`/report/${report.id}`);
        },
        onKeyRejected: () => router.push('/settings?key=rejected')
      });
    })();
    return () => { cancelled = true; destroy && destroy(); };
  }, [user.id, router]);

  return <Markup />;
}

// Static markup driven by the interview engine through element ids. It never re-renders.
const Markup = memo(function Markup(){
  return (
    <>
      <section id="setup" className="inner">
        <p className="eyebrow">New mock interview</p>
        <h1>Set up your interview.</h1>
        <p className="lede">Paste the job description you're preparing for. Your resume from last time is filled in below; update it if anything has changed.</p>

        <label htmlFor="jd">Job description</label>
        <textarea id="jd" placeholder="Paste the full JD here (up to 6,000 characters)" />

        <label htmlFor="resume">Your resume</label>
        <div className="file-line"><span>Upload PDF, DOCX or TXT:</span><input type="file" id="resumeFile" accept=".pdf,.docx,.txt" /></div>
        <textarea id="resume" placeholder="Or paste your resume text here (up to 6,000 characters)" />

        <h2>Interview room</h2>
        <div className="row two">
          <div><label htmlFor="mode">Format</label>
            <select id="mode" defaultValue="voice"><option value="voice">Spoken, like a real interview</option><option value="text">Typed answers</option></select></div>
          <div><label htmlFor="interviewer">Interviewer</label>
            <select id="interviewer" defaultValue="priya"><option value="priya">Priya (female voice)</option><option value="arjun">Arjun (male voice)</option></select></div>
        </div>
        <div className="row two" id="voiceOpts">
          <div><label htmlFor="showQ">Questions on screen</label>
            <select id="showQ" defaultValue="off"><option value="off">Hidden: listen only, like a real room</option><option value="on">Shown after they're asked</option></select></div>
          <div><label htmlFor="silence">Your answer ends after</label>
            <select id="silence" defaultValue="8000"><option value="5000">5 seconds of silence</option><option value="8000">8 seconds of silence</option><option value="0">Only when I click Done</option></select></div>
        </div>
        <div className="row">
          <div><label htmlFor="count">Questions</label>
            <select id="count" defaultValue="8"><option>5</option><option>8</option><option>10</option><option>12</option></select></div>
          <div><label htmlFor="focus">Focus</label>
            <select id="focus" defaultValue="balanced"><option value="balanced">Balanced</option><option value="resume">Resume deep-dive</option><option value="technical">Technical / domain</option><option value="hr">HR / behavioral</option></select></div>
          <div><label htmlFor="diff">Difficulty</label>
            <select id="diff" defaultValue="standard"><option value="easy">Fresher-friendly</option><option value="standard">Standard</option><option value="tough">Tough</option></select></div>
        </div>
        <label htmlFor="followups">Follow-up questions</label>
        <select id="followups" defaultValue="on"><option value="on">On: the interviewer probes your answers</option><option value="off">Off (faster)</option></select>
        <p className="hint">Use headphones in spoken mode so the microphone doesn't pick up the interviewer. Speech-to-text uses your browser's service (Google in Chrome, Microsoft in Edge).</p>

        <div className="actions">
          <button className="primary" id="start">Start interview</button>
          <span className="working hidden" id="genWorking"><span className="spin" /><span id="genText">Preparing your interview…</span></span>
        </div>
        <p className="err" id="setupErr" />
      </section>

      <section id="interview" className="hidden">
        <div className="bar"><div id="prog" /></div>
        <div className="meta"><span id="qMeta" /><span id="timer">0:00</span></div>
        <div className="room">
          <div className="orb-wrap"><div className="orb" id="orb"><span id="initial">P</span></div></div>
          <div className="who-iv"><div className="name" id="ivName" /><div className="title" id="ivTitle" /></div>
          <div className="state" id="roomState" />
        </div>
        <p className="question" id="qText" />
        <div className="live" id="live" />
        <textarea id="ans" className="hidden" placeholder="Type your answer the way you'd say it in the room." />
        <div className="actions">
          <button className="primary" id="done">I'm done answering</button>
          <button id="repeat">Repeat the question</button>
          <button id="skip">Skip</button>
          <button className="link" id="endEarly">End interview</button>
        </div>
      </section>

      <section id="evaluating" className="inner hidden">
        <p className="eyebrow">Debrief in progress</p>
        <h1>Scoring your answers.</h1>
        <p className="lede">Keep this tab open. Your laptop is reviewing each answer one by one.</p>
        <div className="bar" style={{ margin: '28px 0 16px' }}><div id="evalProg" /></div>
        <div className="working"><span className="spin" /><span id="evalText" /></div>
        <p className="err" id="evalErr" />
      </section>
    </>
  );
});
