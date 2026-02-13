import { NextRequest, NextResponse } from 'next/server';
import { searchSymbols } from '@/lib/yahoo';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    if (!q || q.length < 2) {
      return NextResponse.json([]);
    }

    const results = await searchSymbols(q);
    return NextResponse.json(results.slice(0, 10));
  } catch (error) {
    console.error('Symbol search error:', error);
    return NextResponse.json([], { status: 500 });
  }
}
