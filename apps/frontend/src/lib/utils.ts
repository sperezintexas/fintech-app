import { ObjectId } from 'mongodb';

/**
 * Safely parse string to ObjectId or return null.
 * Prevents invalid ID errors and injection attempts.
 */
export function safeObjectId(id: string | null | undefined): ObjectId | null {
  if (!id || typeof id !== 'string' || !ObjectId.isValid(id)) {
    return null;
  }
  return new ObjectId(id);
}

/**
 * Escape string for safe MongoDB regex (prevent ReDoS).
 * For ticker/symbol searches: new RegExp(escapeRegExp(symbol), 'i')
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Usage examples:
// const oid = safeObjectId(params.id); if (!oid) return NextResponse.json({error: 'Invalid ID'}, {status: 400});
// const regex = new RegExp(escapeRegExp(searchParams.get('symbol') ?? ''), 'i');
