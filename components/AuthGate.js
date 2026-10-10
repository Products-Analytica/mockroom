'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, configured } from '@/lib/supabase';
import Nav from './Nav';
import { KeySetup } from './GeminiKey';
import { getKey } from '@/lib/gemini';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function authErrorInUrl(){
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.slice(1));
  return q.get('error_description') || h.get('error_description');
}

// Wraps every signed-in page. Requires a session, then routes by profile status:
// no SAP ID -> complete profile; pending -> waiting; rejected -> fix and resubmit;
// approved -> the page (after Gemini key setup when needsKey). Committee members skip onboarding.
export default function AuthGate({ children, adminOnly = false, needsKey = false }){
  const router = useRouter();
  const [st, setSt] = useState({ loading: true });
  const [hasKey, setHasKey] = useState(true);

  const load = useCallback(async session => {
    if(!session){ router.replace('/'); return; }
    const user = session.user;
    const mail = (user.email || '').toLowerCase();
    const [{ data: profile }, { data: adm }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('admins').select('email')
    ]);
    setSt({ loading: false, user, profile, isAdmin: (adm || []).some(r => r.email.toLowerCase() === mail) });
  }, [router]);

  useEffect(() => { setHasKey(!!getKey()); }, []);

  useEffect(() => {
    if(!configured){ router.replace('/'); return; }
    const err = authErrorInUrl();
    if(err){ router.replace('/?error=' + encodeURIComponent(err)); return; }
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange(ev => { if(ev === 'SIGNED_OUT') router.replace('/'); });
    return () => sub.subscription.unsubscribe();
  }, [load, router]);

  if(st.loading) return <div className="working" style={{ marginTop: 80 }}><span className="spin" />Loading…</div>;

  const refresh = async () => load((await supabase.auth.getSession()).data.session);
  const ctx = { ...st, refresh };
  const p = st.profile;
  const approved = st.isAdmin || p?.status === 'approved';

  let body = children;
  if(!p){
    body = <p className="err">Your profile wasn't created. Sign out and sign in again, or contact the Analytica committee.</p>;
  }else if(!approved){
    body = <Onboarding profile={p} onDone={refresh} />;
  }else if(adminOnly && !st.isAdmin){
    body = <p className="lede">This page is only for Analytica committee members.</p>;
  }else if(needsKey && !hasKey){
    body = <KeySetup onDone={() => setHasKey(true)} />;
  }
  return <AuthCtx.Provider value={ctx}><Nav limited={!approved} />{body}</AuthCtx.Provider>;
}

function Onboarding({ profile: p, onDone }){
  const [editing, setEditing] = useState(false);
  if(!p.sap_id || editing || p.status === 'rejected'){
    return <ProfileForm profile={p} onDone={() => { setEditing(false); onDone(); }} onCancel={p.sap_id && p.status === 'pending' ? () => setEditing(false) : null} />;
  }
  return <Waiting profile={p} onCheck={onDone} onEdit={() => setEditing(true)} />;
}

function ProfileForm({ profile: p, onDone, onCancel }){
  const [name, setName] = useState(p.full_name || '');
  const [sap, setSap] = useState(p.sap_id || '');
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const rejected = p.status === 'rejected';

  async function save(e){
    e.preventDefault();
    setErr('');
    const n = name.trim().replace(/\s+/g, ' '), s = sap.trim();
    if(n.length < 2 || n.length > 80){ setErr('Enter your full name (2 to 80 characters).'); return; }
    if(!/^\d{11}$/.test(s)){ setErr('Your SAP ID is exactly 11 digits.'); return; }
    if(!agreed){ setErr('Please tick the box to agree to this use of your data.'); return; }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: n, sap_id: s, consent_at: new Date().toISOString() }).eq('id', p.id);
    setSaving(false);
    if(error){
      setErr(error.code === '23505' ? 'This SAP ID is already registered. If it\'s yours, contact the Analytica committee.' : error.message);
      return;
    }
    onDone();
  }

  return (
    <section className="inner">
      <p className="eyebrow">{rejected ? 'Details not approved' : 'Welcome'}</p>
      <h1>{rejected ? 'Please fix your details.' : 'Complete your profile'}</h1>
      {rejected && (
        <div className="panel-note">
          <strong>Note from the Analytica committee:</strong> {p.review_note || 'No note was left. Check your name and SAP ID, or contact the committee.'}
        </div>
      )}
      <form className="start-form" onSubmit={save}>
        <label htmlFor="fullName">Full name</label>
        <input id="fullName" autoComplete="name" value={name} onChange={e => setName(e.target.value)} maxLength={80} required />
        <label htmlFor="sapId">SAP ID</label>
        <input id="sapId" inputMode="numeric" placeholder="11 digits" value={sap} maxLength={11} onChange={e => setSap(e.target.value.replace(/\D/g, ''))} required />
        <p className="hint">We collect your name, email and SAP ID only to verify you're an NMIMS student. Your resume, answers and scores stay on your device. See our <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>
        <label className="check">
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} required />
          I agree to this use of my data.
        </label>
        <div className="actions">
          <button className="primary" type="submit" disabled={saving || !agreed}>{saving ? 'Saving…' : rejected ? 'Resubmit' : 'Submit'}</button>
          {onCancel && <button type="button" className="link" onClick={onCancel}>Cancel</button>}
        </div>
      </form>
      {err && <p className="err">{err}</p>}
    </section>
  );
}

function Waiting({ profile: p, onCheck, onEdit }){
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  async function check(){ setChecking(true); await onCheck(); setChecking(false); setChecked(true); }
  return (
    <section className="inner">
      <p className="eyebrow">Almost there</p>
      <h1>Waiting for approval</h1>
      <p className="lede">The Analytica committee will approve your account shortly. You'll be able to start interviews as soon as they do.</p>
      <div className="stats">
        <div className="stat"><div className="n small">{p.full_name}</div><div className="l">Name</div></div>
        <div className="stat"><div className="n small">{p.sap_id}</div><div className="l">SAP ID</div></div>
      </div>
      <div className="actions">
        <button className="primary" onClick={check} disabled={checking}>{checking ? 'Checking…' : 'Check again'}</button>
        <button className="link" onClick={onEdit}>Edit details</button>
      </div>
      {checked && <p className="hint">Not approved yet. Check again in a little while.</p>}
    </section>
  );
}
