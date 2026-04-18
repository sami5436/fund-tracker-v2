import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const fundId = req.nextUrl.searchParams.get('fund_id');
  if (!fundId) return NextResponse.json({ error: 'fund_id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('nav_records')
    .select('*')
    .eq('fund_id', fundId)
    .order('date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fund_id, date, actual_nav, estimated_nav } = body;

  if (!fund_id || !date || actual_nav == null) {
    return NextResponse.json({ error: 'fund_id, date, and actual_nav required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('nav_records')
    .upsert({ fund_id, date, actual_nav, estimated_nav }, { onConflict: 'fund_id,date' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const fundId = req.nextUrl.searchParams.get('fund_id');
  const date = req.nextUrl.searchParams.get('date');
  if (!fundId || !date) {
    return NextResponse.json({ error: 'fund_id and date required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('nav_records')
    .delete()
    .eq('fund_id', fundId)
    .eq('date', date);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
