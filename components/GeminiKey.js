'use client';
import { useState } from 'react';
import { setKey, testKey } from '@/lib/gemini';

export const KEY_PRIVACY = 'Your key stays in this browser only. On Google\'s free tier, Google may use what you send to improve its products.';

// Paste a key, check it with a tiny request, and save it to localStorage only if it works.
export function KeyForm({ onSaved, button = 'Connect' }){
  const [key, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function connect(e){
    e.preventDefault();
    setBusy(true); setErr('');
    const ok = await testKey(key);
    setBusy(false);
    if(!ok){ setErr('That key didn\'t work. Check you copied all of it.'); return; }
    try{ setKey(key); }catch{ setErr('This browser blocked saving the key. Allow site data for this site and try again.'); return; }
    setValue('');
    onSaved && onSaved();
  }
  return (
    <form className="start-form" onSubmit={connect}>
      <label htmlFor="geminiKey">Gemini API key</label>
      <input id="geminiKey" type="password" autoComplete="off" spellCheck={false} placeholder="AIza…" value={key} onChange={e => setValue(e.target.value)} required />
      <div className="actions"><button className="primary" type="submit" disabled={busy || !key.trim()}>{busy ? 'Checking…' : button}</button></div>
      {err && <p className="err">{err}</p>}
      <p className="hint">{KEY_PRIVACY}</p>
    </form>
  );
}

export function KeySetup({ onDone }){
  return (
    <section className="inner">
      <p className="eyebrow">One-time setup</p>
      <h1>Connect your free Gemini key (one-time, 2 minutes)</h1>
      <ol className="steps">
        <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a> and sign in with any Google account</li>
        <li>Click "Create API key" and copy it</li>
        <li>Paste it here</li>
      </ol>
      <KeyForm onSaved={onDone} />
    </section>
  );
}
