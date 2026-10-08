'use client';
import { useEffect, useMemo, useState } from 'react';
import AuthGate from '@/components/AuthGate';
import { supabase, fetchAll } from '@/lib/supabase';
import { fmtDate } from '@/lib/format';

export default function Page(){ return <AuthGate adminOnly><Approvals /></AuthGate>; }

const TABS = [{ key: 'pending', label: 'Pending' }, { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }];
const SAP = /^\d{11}$/;
const changed = () => window.dispatchEvent(new Event('mr:approvals-changed'));

function Approvals(){
  const [profiles, setProfiles] = useState(null);
  const [roster, setRoster] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('pending');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  async function loadRoster(){ setRoster(new Set((await fetchAll('roster', 'sap_id')).map(r => r.sap_id))); }
  useEffect(() => {
    Promise.all([
      fetchAll('profiles', 'id,email,full_name,sap_id,status,review_note,reviewed_at,created_at'),
      loadRoster()
    ]).then(([p]) => setProfiles(p)).catch(e => setErr(e.message));
  }, []);

  // Profiles without a SAP ID haven't submitted their details yet, so there's nothing to review.
  const submitted = useMemo(() => (profiles || []).filter(p => p.sap_id), [profiles]);
  const counts = useMemo(() => Object.fromEntries(TABS.map(t => [t.key, submitted.filter(p => p.status === t.key).length])), [submitted]);

  if(err) return <p className="err">{err}</p>;
  if(!profiles || !roster) return <div className="working"><span className="spin" />Loading sign-ups…</div>;

  const t = q.trim().toLowerCase();
  const rows = submitted
    .filter(p => p.status === tab)
    .filter(p => !t || (p.full_name || '').toLowerCase().includes(t) || p.sap_id.includes(t) || p.email.toLowerCase().includes(t))
    .sort((a, b) => tab === 'pending' ? new Date(a.created_at) - new Date(b.created_at) : new Date(b.reviewed_at || b.created_at) - new Date(a.reviewed_at || a.created_at));
  const notSubmitted = profiles.length - submitted.length;
  const pendingOnRoster = submitted.filter(p => p.status === 'pending' && roster.has(p.sap_id));

  function merge(updated){
    const byId = new Map(updated.map(u => [u.id, u]));
    setProfiles(ps => ps.map(p => byId.get(p.id) || p));
    setSelected(new Set());
    changed();
  }

  async function setStatus(ids, status, note = null){
    if(!ids.length) return;
    setBusy(true); setErr('');
    const updated = [];
    // In batches, so a large selection doesn't overflow the request URL.
    for(let i = 0; i < ids.length; i += 100){
      const { data, error } = await supabase.from('profiles').update({ status, review_note: note }).in('id', ids.slice(i, i + 100)).select();
      if(error){ setErr(error.message); break; }
      updated.push(...data);
    }
    setBusy(false);
    if(updated.length) merge(updated);
  }

  function reject(p, revoke = false){
    const note = window.prompt(`${revoke ? 'Revoke access for' : 'Reject'} ${p.full_name}? Add an optional note the student will see:`, p.review_note || '');
    if(note === null) return;
    setStatus([p.id], 'rejected', note.trim() || null);
  }

  async function saveEdit(){
    const n = editing.full_name.trim().replace(/\s+/g, ' '), s = editing.sap_id.trim();
    if(n.length < 2 || n.length > 80) return setErr('Names must be 2 to 80 characters.');
    if(!SAP.test(s)) return setErr('SAP IDs are exactly 11 digits.');
    setBusy(true); setErr('');
    const { data, error } = await supabase.from('profiles').update({ full_name: n, sap_id: s }).eq('id', editing.id).select();
    setBusy(false);
    if(error) return setErr(error.code === '23505' ? 'Another student already has that SAP ID.' : error.message);
    merge(data);
    setEditing(null);
  }

  const toggle = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every(r => selected.has(r.id));

  return (
    <section>
      <p className="eyebrow">Analytica committee view</p>
      <h1>Approvals.</h1>
      <p className="lede">Check each student's name and SAP ID before they can start interviews.</p>

      <div className="tabs">
        {TABS.map(x => (
          <button key={x.key} className={tab === x.key ? 'on' : ''} onClick={() => { setTab(x.key); setSelected(new Set()); setEditing(null); }}>
            {x.label}{x.key === 'pending' && counts.pending > 0 ? <span className="badge">{counts.pending}</span> : ` (${counts[x.key]})`}
          </button>
        ))}
      </div>
      <div className="tools">
        <input placeholder="Search name, SAP ID or email" value={q} onChange={e => setQ(e.target.value)} />
        {tab === 'pending' && <button className="primary" disabled={busy || !selected.size} onClick={() => setStatus([...selected], 'approved')}>Approve selected{selected.size ? ` (${selected.size})` : ''}</button>}
      </div>
      {err && <p className="err">{err}</p>}

      <div className="table-wrap">
        <table>
          <thead><tr>
            {tab === 'pending' && <th className="check"><input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(rows.map(r => r.id)))} /></th>}
            <th>Name</th><th>SAP ID</th><th>Google email</th><th>Signed up</th><th />
          </tr></thead>
          <tbody>
            {rows.map(p => editing?.id === p.id ? (
              <tr key={p.id}>
                {tab === 'pending' && <td className="check" />}
                <td><input value={editing.full_name} maxLength={80} onChange={e => setEditing(x => ({ ...x, full_name: e.target.value }))} /></td>
                <td><input value={editing.sap_id} maxLength={11} inputMode="numeric" onChange={e => setEditing(x => ({ ...x, sap_id: e.target.value.replace(/\D/g, '') }))} /></td>
                <td>{p.email}</td>
                <td>{fmtDate(p.created_at)}</td>
                <td><div className="row-actions"><button className="primary" disabled={busy} onClick={saveEdit}>Save</button><button className="link" onClick={() => setEditing(null)}>Cancel</button></div></td>
              </tr>
            ) : (
              <tr key={p.id}>
                {tab === 'pending' && <td className="check"><input type="checkbox" aria-label={`Select ${p.full_name}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} /></td>}
                <td><strong>{p.full_name || '-'}</strong>{p.status === 'rejected' && p.review_note && <div className="sub">Note: {p.review_note}</div>}</td>
                <td>{p.sap_id}{roster.has(p.sap_id) && <div className="sub">On batch list</div>}</td>
                <td>{p.email}</td>
                <td>{fmtDate(p.created_at)}</td>
                <td>
                  <div className="row-actions">
                    {p.status !== 'approved' && <button className="primary" disabled={busy} onClick={() => setStatus([p.id], 'approved')}>Approve</button>}
                    {p.status === 'pending' && <button disabled={busy} onClick={() => reject(p)}>Reject</button>}
                    {p.status === 'approved' && <button disabled={busy} onClick={() => reject(p, true)}>Revoke</button>}
                    <button className="link" onClick={() => { setErr(''); setEditing({ id: p.id, full_name: p.full_name || '', sap_id: p.sap_id }); }}>Edit</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="hint">{t ? 'No one matches.' : tab === 'pending' ? 'No one is waiting for approval.' : `No ${tab} students.`}</p>}
      {tab === 'pending' && notSubmitted > 0 && <p className="hint">{notSubmitted} {notSubmitted === 1 ? 'person has' : 'people have'} signed in but not submitted their name and SAP ID yet.</p>}

      <BatchList roster={roster} reload={loadRoster} pendingOnRoster={pendingOnRoster} onApprove={ids => setStatus(ids, 'approved')} busy={busy} />
    </section>
  );
}

// Minimal CSV parser: handles quoted fields, escaped quotes and CRLF line endings.
function parseCSV(text){
  const rows = []; let row = [], field = '', quoted = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(quoted){
      if(c === '"' && text[i + 1] === '"'){ field += '"'; i++; }
      else if(c === '"') quoted = false;
      else field += c;
    }else if(c === '"') quoted = true;
    else if(c === ',') { row.push(field); field = ''; }
    else if(c === '\n' || c === '\r'){
      if(c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    }else field += c;
  }
  if(field || row.length){ row.push(field); rows.push(row); }
  return rows;
}

function BatchList({ roster, reload, pendingOnRoster, onApprove, busy }){
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  async function upload(e){
    const f = e.target.files[0]; e.target.value = '';
    if(!f) return;
    setWorking(true); setErr(''); setResult(null);
    try{
      const lines = parseCSV((await f.text()).replace(/^﻿/, ''));
      let sapCol = 0, nameCol = 1, start = 0;
      const head = (lines[0] || []).map(h => h.trim().toLowerCase());
      if(head.includes('sap_id')){ sapCol = head.indexOf('sap_id'); nameCol = head.indexOf('full_name'); start = 1; }
      const valid = new Map(), invalid = [];
      let repeats = 0;
      for(let i = start; i < lines.length; i++){
        const cells = lines[i];
        if(cells.every(c => !c.trim())) continue;
        const sap = (cells[sapCol] || '').trim();
        const name = nameCol >= 0 ? (cells[nameCol] || '').trim() : '';
        if(!SAP.test(sap)){ invalid.push({ line: i + 1, text: cells.join(',') }); continue; }
        if(valid.has(sap)){ repeats++; continue; }
        valid.set(sap, { sap_id: sap, full_name: name || null });
      }
      const all = [...valid.values()];
      let added = 0;
      for(let i = 0; i < all.length; i += 500){
        const { data, error } = await supabase.from('roster').upsert(all.slice(i, i + 500), { onConflict: 'sap_id', ignoreDuplicates: true }).select('sap_id');
        if(error) throw error;
        added += data.length;
      }
      setResult({ added, skipped: all.length - added + repeats, invalid });
      await reload();
    }catch(e){ setErr(e.message || 'Couldn\'t read that file.'); }
    setWorking(false);
  }

  async function clear(){
    if(!window.confirm(`Remove all ${roster.size} SAP IDs from the batch list? Students already approved stay approved.`)) return;
    setWorking(true); setErr(''); setResult(null);
    const { error } = await supabase.from('roster').delete().not('sap_id', 'is', null);
    if(error) setErr(error.message);
    await reload();
    setWorking(false);
  }

  return (
    <>
      <h2>Batch list</h2>
      <p className="hint" style={{ marginTop: 0 }}>Students whose SAP ID is on this list are approved automatically.</p>
      <p>Upload a CSV with the columns <code>sap_id,full_name</code>. SAP IDs already on the list are skipped.</p>
      <div className="tools">
        <div className="file-line" style={{ margin: 0 }}><span>CSV file:</span><input type="file" accept=".csv,text/csv" onChange={upload} disabled={working} /></div>
        <span className="sub">{roster.size} SAP {roster.size === 1 ? 'ID' : 'IDs'} on the list</span>
        {roster.size > 0 && <button className="link" onClick={clear} disabled={working}>Clear roster</button>}
        {working && <span className="working"><span className="spin" />Working…</span>}
      </div>
      {err && <p className="err">{err}</p>}
      {result && (
        <div className="panel-note">
          <strong>{result.added} {result.added === 1 ? 'row' : 'rows'} added.</strong>
          {result.skipped > 0 && ` ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} ignored.`}
          {result.invalid.length > 0 && (
            <>
              <p style={{ margin: '10px 0 4px' }}>{result.invalid.length} invalid {result.invalid.length === 1 ? 'row' : 'rows'} (SAP ID must be exactly 11 digits):</p>
              <ul>
                {result.invalid.slice(0, 20).map(r => <li key={r.line}><span className="sub">Line {r.line}:</span> <code>{r.text || '(empty SAP ID)'}</code></li>)}
                {result.invalid.length > 20 && <li>…and {result.invalid.length - 20} more</li>}
              </ul>
            </>
          )}
        </div>
      )}
      {pendingOnRoster.length > 0 && (
        <p className="hint">
          {pendingOnRoster.length} pending {pendingOnRoster.length === 1 ? 'student is' : 'students are'} already on the list (they signed up before it was uploaded).{' '}
          <button className="link" disabled={busy} onClick={() => onApprove(pendingOnRoster.map(p => p.id))}>Approve {pendingOnRoster.length === 1 ? 'them' : `all ${pendingOnRoster.length}`}</button>
        </p>
      )}
    </>
  );
}
