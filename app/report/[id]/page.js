'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AuthGate, { useAuth } from '@/components/AuthGate';
import ReportView from '@/components/ReportView';
import { supabase } from '@/lib/supabase';
import { getReport, syncReport } from '@/lib/local';

export default function Page(){ return <AuthGate><Report /></AuthGate>; }

function Report(){
  const { id } = useParams();
  const { user } = useAuth();
  const [st, setSt] = useState({ loading: true });
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    (async () => {
      // The full report (answers and per-question feedback) only exists in the browser where the interview was taken.
      const local = getReport(id);
      const { data: interview } = await supabase.from('interviews').select('*').eq('id', id).maybeSingle();
      if(!interview && !local) return setSt({ error: 'This report doesn\'t exist or you don\'t have access to it.' });
      const iv = local || interview;
      const mine = iv.user_id === user.id;
      let studentName = '';
      if(!mine){
        const { data } = await supabase.from('profiles').select('full_name,email,sap_id').eq('id', iv.user_id).maybeSingle();
        studentName = [data?.full_name || data?.email, data?.sap_id && `(${data.sap_id})`].filter(Boolean).join(' ');
      }
      setSt({ interview: iv, local, details: local?.items ? { items: local.items } : null, studentName, mine, unsynced: !!local && !local.synced && !interview });
    })();
  }, [id, user.id]);

  async function retrySync(){
    setSyncing(true);
    const ok = await syncReport(st.local);
    setSyncing(false);
    if(ok) setSt(s => ({ ...s, unsynced: false }));
  }

  if(st.loading) return <div className="working"><span className="spin" />Loading report…</div>;
  if(st.error) return <p className="err">{st.error}</p>;
  return (
    <>
      {st.unsynced && (
        <p className="hint inner noprint">Couldn't sync to your record. Your full report is safe on this laptop. <button className="link" onClick={retrySync} disabled={syncing}>{syncing ? 'Retrying…' : 'Retry'}</button></p>
      )}
      <ReportView interview={st.interview} details={st.details} studentName={st.studentName} />
      <div className="actions inner">
        {st.mine ? <Link href="/interview" className="button primary">Start another interview</Link> : <Link href="/admin" className="button">Back to committee view</Link>}
        <button onClick={() => { document.querySelectorAll('details.qa').forEach(d => { d.open = true; }); window.print(); }}>Save as PDF</button>
      </div>
    </>
  );
}
