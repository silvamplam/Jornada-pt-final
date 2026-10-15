import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = "https://www.ligaportugal.pt/match/20262027/ligaportugalbetclic/8/7";
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Jornada.pt diagnostic/1.0",
    },
  });
  const html = await response.text();
  return new NextResponse(html, {
    status: response.status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
