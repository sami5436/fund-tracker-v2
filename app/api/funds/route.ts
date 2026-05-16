import { NextResponse } from 'next/server';
import type { FidelityFund } from '@/lib/types';
import fundsData from '@/lib/fidelity-funds-data.json';

interface DataFile {
  generatedAt: string;
  requested: number;
  succeeded: number;
  failed: string[];
  funds: FidelityFund[];
}

export async function GET() {
  const data = fundsData as DataFile;
  return NextResponse.json({
    funds: data.funds ?? [],
    total: (data.funds ?? []).length,
    generatedAt: data.generatedAt,
  });
}
