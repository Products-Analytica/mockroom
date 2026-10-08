import { DIMS, DIM_LABEL, fmtDate, fmtSecs } from '@/lib/format';
import { DimBars } from './Charts';

export default function ReportView({ interview: iv, details, studentName }){
  const sm = iv.summary || {};
  const list = a => (a || []).map((x, i) => <li key={i}>{x}</li>);
  return (
    <section className="inner">
      <p className="eyebrow">Mock interview debrief - {fmtDate(iv.created_at)}{studentName ? ` - ${studentName}` : ''}</p>
      <h1>{iv.role_title}</h1>
      <p className="lede">{sm.summary}</p>
      <div className="stats">
        <div className="stat"><div className="n">{iv.score}</div><div className="l">Score / 100</div></div>
        <div className="stat"><div className="n small">{iv.verdict}</div><div className="l">Verdict</div></div>
        <div className="stat"><div className="n">{iv.answered}</div><div className="l">Answered</div></div>
        <div className="stat"><div className="n">{fmtSecs(iv.avg_seconds)}</div><div className="l">Avg answer time</div></div>
        {iv.wpm ? <div className="stat"><div className="n">{iv.wpm}</div><div className="l">Words / min</div></div> : null}
      </div>
      {iv.wpm ? <p className="hint">A comfortable interview pace is roughly 120 to 160 words per minute.</p> : null}

      <h2>By dimension</h2>
      <DimBars dims={iv.dims} />

      <div className="cols">
        <div><h2>What went well</h2><ul>{list(sm.top_strengths)}</ul></div>
        <div><h2>Fix these first</h2><ul>{list(sm.priority_improvements)}</ul></div>
      </div>
      <h2>Practice plan</h2><ul>{list(sm.practice_plan)}</ul>

      <h2>Answer by answer</h2>
      {!details && <p className="panel-note">Answer-by-answer feedback is only available on the device where the interview was taken.</p>}
      {details && details.items.map((it, i) => (
        <details className="qa" key={i}>
          <summary>
            <span><span className="cat">{it.category}{it.followup ? ', follow-up' : ''}</span><br /><span className="q">{it.question}</span></span>
            <span className="s">{it.skipped ? 'Skipped' : it.score}</span>
          </summary>
          {!it.skipped && (
            <>
              <div className="dims">
                {DIMS.map(d => (
                  <div key={d} style={{ display: 'contents' }}>
                    <span>{DIM_LABEL(d)}</span>
                    <div className="bar"><div style={{ width: `${it.eval.scores[d] * 20}%` }} /></div>
                    <span>{it.eval.scores[d]}</span>
                  </div>
                ))}
              </div>
              <p><strong>Your answer{it.spoken ? ' (as transcribed)' : ''}</strong></p>
              <div className="your">{it.answer}</div>
              {it.eval.strengths?.length ? <><p><strong>Strengths</strong></p><ul>{list(it.eval.strengths)}</ul></> : null}
            </>
          )}
          <p><strong>Improve</strong></p><ul>{list(it.eval.improvements)}</ul>
          {it.eval.better_answer ? <><p><strong>A stronger answer would</strong></p><p>{it.eval.better_answer}</p></> : null}
        </details>
      ))}
    </section>
  );
}
