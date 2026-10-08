'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, configured } from '@/lib/supabase';

export default function Landing(){
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('error');
    if(e) setError(e);
    if(configured) supabase.auth.getSession().then(({ data }) => { if(data.session) router.replace('/dashboard'); });
  }, [router]);

  async function signIn(){
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard`, queryParams: { prompt: 'select_account' } }
    });
    if(error){ setError(error.message); setBusy(false); }
  }

  return (
    <section>
      <div className="logos">
        <img src="/logo-nmims.png" alt="NMIMS" onError={e => { e.currentTarget.style.display = 'none'; }} />
        <img src="/logo-analytica.png" alt="Analytica" onError={e => { e.currentTarget.style.display = 'none'; }} />
      </div>
      <p className="eyebrow">Corporate Intelligence &amp; Knowledge Management - Mock Interview Room</p>
      <h1>Sit the interview <em>before</em> the interview.</h1>
      <p className="lede">An AI interviewer reads your resume and the job description, asks you questions out loud, follows up on your answers, and gives you a scored debrief. Free for the batch.</p>

      {!configured ? (
        <p className="err">This site isn't connected to its database yet. Add the Supabase keys to the environment variables (see README).</p>
      ) : (
        <div className="actions">
          <button className="google" onClick={signIn} disabled={busy}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            {busy ? 'Opening Google…' : 'Continue with Google'}
          </button>
        </div>
      )}
      {error && <p className="err">{error}</p>}
      <p className="hint">New here? After signing in, add your name and SAP ID. The Analytica committee approves each student once.</p>

      <ol className="how">
        <li><div className="n">1</div><div className="t">Add the JD and your resume</div><div className="d">Your resume is saved in this browser, so next time you only paste the JD.</div></li>
        <li><div className="n">2</div><div className="t">Talk to the interviewer</div><div className="d">Questions are asked out loud, tailored to your profile, with follow-ups.</div></li>
        <li><div className="n">3</div><div className="t">Get your debrief</div><div className="d">Scores on five dimensions, what to fix first, and a stronger answer for every question.</div></li>
      </ol>
      <p className="hint" style={{ marginTop: 40 }}>Works best in the latest Chrome or Edge on a laptop. Use headphones for spoken interviews. <Link href="/privacy">Privacy Policy</Link></p>
    </section>
  );
}
