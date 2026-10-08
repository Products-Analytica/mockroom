'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthGate';

// `limited` is for students who aren't approved yet: just the brand and Sign out.
export default function Nav({ limited = false }){
  const { profile, user, isAdmin } = useAuth();
  const path = usePathname();
  const [pending, setPending] = useState(0);
  const cls = p => path === p || (p !== '/admin' && path.startsWith(p)) ? 'active' : '';
  const who = profile?.full_name || user?.email;

  useEffect(() => {
    if(!isAdmin) return;
    const load = () => supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending').not('sap_id', 'is', null)
      .then(({ count }) => setPending(count || 0));
    load();
    // The Approvals page fires this after approving or rejecting, so the badge stays current.
    window.addEventListener('mr:approvals-changed', load);
    return () => window.removeEventListener('mr:approvals-changed', load);
  }, [isAdmin, path]);

  return (
    <nav className="nav">
      <Link href="/dashboard" className="brand">Mock Interview Room</Link>
      <div className="links">
        {!limited && (
          <>
            <Link href="/dashboard" className={cls('/dashboard')}>My interviews</Link>
            <Link href="/interview" className={cls('/interview')}>New interview</Link>
            <Link href="/settings" className={cls('/settings')}>Settings</Link>
            {isAdmin && <Link href="/admin" className={cls('/admin')}>Committee view</Link>}
            {isAdmin && <Link href="/admin/approvals" className={cls('/admin/approvals')}>Approvals{pending > 0 && <span className="badge">{pending}</span>}</Link>}
          </>
        )}
        <span className="who">{who}{profile?.sap_id ? ` (${profile.sap_id})` : ''}</span>
        <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </nav>
  );
}
