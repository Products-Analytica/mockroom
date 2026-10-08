'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGate, { useAuth } from '@/components/AuthGate';
import { ScoreTrend, DimBars, avgDims } from '@/components/Charts';
import { supabase } from '@/lib/supabase';
import { deleteReport, listReports } from '@/lib/local';
import { fmtDate, weakest, DIM_LABEL } from '@/lib/format';

export default function Page(){ return <AuthGate needsKey><Dashboard /></AuthGate>; }

function Dashboard(){
  const { user, profile } = useAuth();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [unsynced, setUnsynced] = useState([]);

  useEffect(() => {
    supabase.from('interviews').select('id,created_at,role_title,score,verdict,dims,answered')
      .eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if(error) setErr(error.message);
        setRows(data || []);
        // Interviews finished on this laptop whose summary didn't reach the database.
        const ids = new Set((data || []).map(r => r.id));
        if(!error) setUnsynced(listReports().filter(r => !r.synced && r.user_id === user.id && !ids.has(r.id)));
      });
  }, [user.id]);

  async function remove(id){
    if(!window.confirm('Delete this interview and its report?')) return;
    const { error } = await supabase.from('interviews').delete().eq('id', id);
    if(error) return setErr(error.message);
    deleteReport(id);
    setRows(r => r.filter(x => x.id !== id));
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
      {err && <p className="err">{err}</p>}
      {unsynced.length > 0 && (
        <p className="hint">
          {unsynced.length === 1 ? 'One interview on this laptop hasn\'t' : `${unsynced.length} interviews on this laptop haven't`} synced to your record yet. Open {unsynced.length === 1 ? 'it' : 'each one'} to retry:{' '}
          {unsynced.map((r, i) => <span key={r.id}>{i ? ', ' : ''}<Link href={`/report/${r.id}`}>{r.role_title} ({fmtDate(r.created_at)})</Link></span>)}
        </p>
      )}

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
