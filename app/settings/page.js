'use client';
import { useEffect, useState } from 'react';
import AuthGate from '@/components/AuthGate';
import { KeyForm, KEY_PRIVACY } from '@/components/GeminiKey';
import { getKey, clearKey, maskKey, MODEL } from '@/lib/gemini';

export default function Page(){ return <AuthGate><Settings /></AuthGate>; }

function Settings(){
  const [key, setKeyState] = useState(null);
  const [rejected, setRejected] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setKeyState(getKey());
    setRejected(new URLSearchParams(window.location.search).get('key') === 'rejected');
  }, []);

  function remove(){
    if(!window.confirm('Remove your Gemini key from this browser? You\'ll need to paste one again before your next interview.')) return;
    clearKey(); setKeyState(''); setReplacing(false); setSaved(false);
  }
  function onSaved(){ setKeyState(getKey()); setReplacing(false); setRejected(false); setSaved(true); }

  if(key === null) return null;
  return (
    <section className="inner">
      <p className="eyebrow">Settings</p>
      <h1>Your Gemini key.</h1>
      {rejected && <p className="err">Google rejected your saved key. Paste a new one below, then start the interview again.</p>}
      {saved && <p className="hint">Key saved.</p>}

      {key && !replacing ? (
        <>
          <label>Saved key</label>
          <p style={{ fontFamily: 'var(--mono)', margin: 0 }}>{maskKey(key)}</p>
          <p className="hint">Model: {MODEL}. {KEY_PRIVACY}</p>
          <div className="actions">
            <button onClick={() => { setReplacing(true); setSaved(false); }}>Replace key</button>
            <button className="link" onClick={remove}>Remove key</button>
          </div>
        </>
      ) : (
        <>
          {!key && <p className="lede">Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>: sign in with any Google account, click "Create API key" and copy it.</p>}
          <KeyForm onSaved={onSaved} button={key ? 'Save new key' : 'Connect'} />
          {replacing && <div className="actions"><button className="link" onClick={() => setReplacing(false)}>Cancel</button></div>}
        </>
      )}
    </section>
  );
}
