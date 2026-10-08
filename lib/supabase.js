import { createClient } from '@supabase/supabase-js';

export const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
  { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } }
);

// Reads every row of a table, 1000 at a time (Supabase caps a single select at 1000).
export async function fetchAll(table, columns, filter = q => q){
  const out = [];
  for(let from = 0; ; from += 1000){
    const { data, error } = await filter(supabase.from(table).select(columns)).range(from, from + 999);
    if(error) throw error;
    out.push(...data);
    if(data.length < 1000) return out;
  }
}
