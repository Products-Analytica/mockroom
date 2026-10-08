'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGate from '@/components/AuthGate';
import { DimBars, avgDims } from '@/components/Charts';
import { fetchAll } from '@/lib/supabase';
import { DIM_LABEL, fmtDate, weakest, downloadCSV } from '@/lib/format';

export default function Page(){ return <AuthGate adminOnly><Admin /></AuthGate>; }

const COLS = [
  { key: 'name', label: 'Student' },
  { key: 'sap', label: 'SAP ID' },
  { key: 'count', label: 'Interviews' },
  { key: 'latest', label: 'Latest' },
  { key: 'best', label: 'Best' },
  { key: 'avg', label: 'Average' },
  { key: 'weak', label: 'Weakest area' },
  { key: 'last', label: 'Last practiced' }
];

function Admin(){
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'last', dir: -1 });
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    Promise.all([
      // Approved students only; committee members without a SAP ID aren't students.
      fetchAll('profiles', 'id,email,full_name,sap_id,created_at', q => q.eq('status', 'approved').not('sap_id', 'is', null)),
      fetchAll('interviews', 'id,user_id,created_at,role_title,score,verdict,dims,answered')
    ]).then(([profiles, all]) => {
      const ids = new Set(profiles.map(p => p.id));
      setData({ profiles, interviews: all.filter(iv => ids.has(iv.user_id)) });
    }).catch(e => setErr(e.message));
  }, []);

  const students = useMemo(() => {
    if(!data) return [];
    const byUser = new Map();
    for(const iv of data.interviews){ if(!byUser.has(iv.user_id)) byUser.set(iv.user_id, []); byUser.get(iv.user_id).push(iv); }
    return data.profiles.map(p => {
      const ivs = (byUser.get(p.id) || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const scores = ivs.map(i => i.score);
      return {
        id: p.id, name: p.full_name || p.email, email: p.email, sap: p.sap_id, ivs, count: ivs.length,
        latest: ivs[0]?.score ?? null, best: scores.length ? Math.max(...scores) : null,
        avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        weak: weakest(avgDims(ivs)), last: ivs[0]?.created_at || null
      };
    });
  }, [data]);

  if(err) return <p className="err">{err}</p>;
  if(!data) return <div className="working"><span className="spin" />Loading batch data…</div>;

  const practiced = students.filter(s => s.count > 0);
  const batchDims = avgDims(data.interviews);
  const batchWeak = weakest(batchDims);
  const batchAvg = data.interviews.length ? Math.round(data.interviews.reduce((a, i) => a + i.score, 0) / data.interviews.length) : 0;
  const weakCount = batchWeak ? practiced.filter(s => s.weak === batchWeak).length : 0;

  let rows = students.filter(s => {
    if(filter === 'none' && s.count) return false;
    if(filter === 'low' && !(s.latest !== null && s.latest < 45)) return false;
    const t = q.trim().toLowerCase();
    return !t || s.name.toLowerCase().includes(t) || s.email.toLowerCase().includes(t) || s.sap.includes(t);
  });
  rows = rows.sort((a, b) => {
    const va = a[sort.key], vb = b[sort.key];
    if(va === null || va === undefined) return 1;
    if(vb === null || vb === undefined) return -1;
    return (sort.key === 'last' ? new Date(va) - new Date(vb) : va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
  });

  function exportCSV(){
    downloadCSV('mock-interviews-batch.csv', [
      ['Name', 'SAP ID', 'Email', 'Interviews', 'Latest score', 'Best', 'Average', 'Weakest area', 'Last practiced'],
      ...students.map(s => [s.name, s.sap, s.email, s.count, s.latest ?? '', s.best ?? '', s.avg ?? '', s.weak ? DIM_LABEL(s.weak) : '', s.last ? fmtDate(s.last) : ''])
    ]);
  }

  return (
    <section>
      <p className="eyebrow">Analytica committee view</p>
      <h1>How the batch is doing.</h1>
      <div className="stats">
        <div className="stat"><div className="n">{students.length}</div><div className="l">Approved students</div></div>
        <div className="stat"><div className="n">{practiced.length}</div><div className="l">Have practiced</div></div>
        <div className="stat"><div className="n">{data.interviews.length}</div><div className="l">Interviews</div></div>
        <div className="stat"><div className="n">{batchAvg}</div><div className="l">Batch average</div></div>
      </div>

      {batchDims && (
        <>
          <h2>Batch strengths and gaps</h2>
          <DimBars dims={batchDims} />
          <p className="hint"><strong>{DIM_LABEL(batchWeak)}</strong> is the batch's weakest area, and the weakest area for {weakCount} of {practiced.length} students who have practiced. A good topic for the next prep session.</p>
        </>
      )}

      <h2>Students</h2>
      <div className="tools">
        <input placeholder="Search name, email or SAP ID" value={q} onChange={e => setQ(e.target.value)} />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="all">Everyone</option>
          <option value="none">Haven't practiced yet</option>
          <option value="low">Latest score below 45</option>
        </select>
        <button onClick={exportCSV}>Export CSV</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>{COLS.map(c => (
            <th key={c.key} onClick={() => setSort(s => ({ key: c.key, dir: s.key === c.key ? -s.dir : (c.key === 'name' || c.key === 'sap' ? 1 : -1) }))}>
              {c.label}{sort.key === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
            </th>))}</tr></thead>
          <tbody>
            {rows.map(s => (
              <Fragment key={s.id}>
                <tr className={s.count ? 'clickable' : ''} onClick={() => s.count && setOpen(o => o === s.id ? null : s.id)}>
                  <td><strong>{s.name}</strong><div className="sub">{s.email}</div></td>
                  <td>{s.sap}</td>
                  <td>{s.count}</td>
                  <td className="num">{s.latest ?? '-'}</td>
                  <td className="num">{s.best ?? '-'}</td>
                  <td className="num">{s.avg ?? '-'}</td>
                  <td>{s.weak ? DIM_LABEL(s.weak) : '-'}</td>
                  <td>{s.last ? fmtDate(s.last) : 'Not yet'}</td>
                </tr>
                {open === s.id && (
                  <tr><td colSpan={COLS.length}>
                    {s.ivs.map(iv => (
                      <div className="list-row" key={iv.id}>
                        <Link href={`/report/${iv.id}`}><strong>{iv.role_title}</strong><br /><span className="when">{fmtDate(iv.created_at)}, {iv.verdict}</span></Link>
                        <span className="sc">{iv.score}</span>
                      </div>
                    ))}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="hint">No students match.</p>}
    </section>
  );
}
