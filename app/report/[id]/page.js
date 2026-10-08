'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AuthGate, { useAuth } from '@/components/AuthGate';
import ReportView from '@/components/ReportView';
import { getReport } from '@/lib/local';

export default function Page(){ return <AuthGate><Report /></AuthGate>; }

function Report(){
  const { id } = useParams();
  const { user } = useAuth();
  const [st, setSt] = useState({ loading: true });

  useEffect(() => {
    // Reports live only in the browser where the interview was taken.
    const report = getReport(id);
    setSt(report && report.user_id === user.id ? { report } : { missing: true });
  }, [id, user.id]);

  if(st.loading) return <div className="working"><span className="spin" />Loading report…</div>;
  if(st.missing) return (
    <section className="inner">
      <p className="lede">This report isn't on this device.</p>
      <div className="actions"><Link href="/dashboard" className="button">Back to my interviews</Link></div>
    </section>
  );
  return (
    <>
      <ReportView interview={st.report} items={st.report.items || []} />
      <div className="actions inner">
        <Link href="/interview" className="button primary">Start another interview</Link>
        <button onClick={() => { document.querySelectorAll('details.qa').forEach(d => { d.open = true; }); window.print(); }}>Save as PDF</button>
      </div>
    </>
  );
}
