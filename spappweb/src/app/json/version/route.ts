import { NextResponse } from "next/server";

/**
 * Cursor/Chrome CDP probes often hit the Next.js port with GET /json/version.
 * Answer quickly so the terminal is not flooded with 404 noise.
 */
export function GET() {
  return new NextResponse(null, { status: 204 });
}
