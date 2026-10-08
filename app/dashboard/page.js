'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGate, { useAuth } from '@/components/AuthGate';
import { ScoreTrend, DimBars, avgDims } from '@/components/Charts';
import { deleteReport, listReports } from '@/lib/local';
import { fmtDate, weakest, DIM_LABEL } from '@/lib/format';

export default function Page(){ return <AuthGate needsKey><Dashboard /></AuthGate>; }

function Dashboard(){
  const { user, profile } = useAuth();
  const [rows, setRows] = useState(null);

  // Only this student's reports, in case several students share a laptop.
  const load = () => setRows(listReports().filter(r => r.user_id === user.id));
  useEffect(() => { load(); }, [user.id]);

  function remove(id){
    if(!window.confirm('Delete this interview and its report?')) return;
    deleteReport(id);
    load();
  }

  const first = (profile.full_name || '').split(' ')[0];
  if(!rows) return <div className="working"><span className="spin" />Loading your interviews…</div>;

  const scores = rows.map(r => r.score);
  const dims = avgDims(rows);
  const weak = weakest(dims);

  return (
    <section className="inner">
      <p className="eyebrow">Your practice record</p>
      <h1>{first ? `Hi ${first}.` : 'Welcome.'} {rows.length ? 'Ready for another round?' : 'Let\'s run your first interview.'}</h1>
      <div className="actions" style={{ marginTop: 0 }}><Link href="/interview" className="button primary">Start a mock interview</Link></div>
      <p className="hint">Your interview history is saved in this browser only.</p>

      {rows.length === 0 ? (
        <p className="lede" style={{ marginTop: 30 }}>An interview takes about 15 minutes. Have the job description ready and headphones on.</p>
      ) : (
        <>
          <div className="stats">
            <div className="stat"><div className="n">{rows.length}</div><div className="l">Interviews</div></div>
            <div className="stat"><div className="n">{scores[0]}</div><div className="l">Latest score</div></div>
            <div className="stat"><div className="n">{Math.max(...scores)}</div><div className="l">Best</div></div>
            <div className="stat"><div className="n">{Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}</div><div className="l">Average</div></div>
          </div>

          {rows.length >= 2 && <><h2>Score over time</h2><ScoreTrend points={[...rows].reverse().map(r => ({ date: r.created_at, score: r.score }))} /></>}

          <h2>Where you stand</h2>
          <DimBars dims={dims} />
          {weak && <p className="hint">Your weakest area so far is <strong>{DIM_LABEL(weak).toLowerCase()}</strong>. Focus on it in your next interview.</p>}

          <h2>Past interviews</h2>
          {rows.map(r => (
            <div className="list-row" key={r.id}>
              <Link href={`/report/${r.id}`}><strong>{r.role_title}</strong><br /><span className="when">{fmtDate(r.created_at)}, {r.verdict}</span></Link>
              <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}><span className="sc">{r.score}</span><button className="link" onClick={() => remove(r.id)}>Delete</button></span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
