export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORAL_BOTTLE_URL =
  "https://cdn.shopify.com/s/files/1/0565/3151/7632/products/CORAL-Beer-Cerveja-Portugal_1200x.png?v=1625509447";

function svgResponse(svg: string) {
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

async function readBottleDataUri() {
  const response = await fetch(CORAL_BOTTLE_URL, {
    next: { revalidate: 86400 },
  });
  if (!response.ok) {
    throw new Error(`coral-bottle-${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function lateralCreative(bottle: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="650" viewBox="0 0 300 650" role="img" aria-label="Coral — Cerveja da Madeira">
    <rect width="300" height="650" fill="#ffffff"/>
    <image href="${bottle}" x="-175" y="-4" width="650" height="650" preserveAspectRatio="xMidYMid meet"/>
  </svg>`;
}

function horizontalCreative(bottle: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="120" viewBox="0 0 1200 120" role="img" aria-label="Coral — Deita comigo">
    <defs>
      <linearGradient id="bg" x1="0" x2="1">
        <stop offset="0" stop-color="#f4dfb4"/>
        <stop offset=".42" stop-color="#b3241d"/>
        <stop offset="1" stop-color="#270706"/>
      </linearGradient>
      <clipPath id="bottleClip"><rect width="650" height="120"/></clipPath>
    </defs>
    <rect width="1200" height="120" fill="url(#bg)"/>
    <g clip-path="url(#bottleClip)">
      <image href="${bottle}" x="5" y="-170" width="460" height="460"
        preserveAspectRatio="xMidYMid meet"
        transform="rotate(-90 235 60)"/>
    </g>
    <text x="680" y="51" fill="#fff8ea" font-family="Georgia, 'Times New Roman', serif"
      font-size="47" font-weight="700">Deita</text>
    <text x="826" y="52" fill="#dfb765" font-family="Georgia, 'Times New Roman', serif"
      font-size="47" font-style="italic">comigo</text>
    <path d="M826 66 C900 76 1010 76 1090 65" fill="none" stroke="#dfb765" stroke-width="2"/>
    <text x="683" y="91" fill="#dfb765" font-family="Arial, Helvetica, sans-serif"
      font-size="12" font-weight="700" letter-spacing="3">CORAL · SEMPRE UMA BOA IDEIA</text>
  </svg>`;
}

export async function GET(request: Request) {
  const variant = new URL(request.url).searchParams.get("variant");
  try {
    const bottle = await readBottleDataUri();
    return svgResponse(
      variant === "horizontal"
        ? horizontalCreative(bottle)
        : lateralCreative(bottle),
    );
  } catch {
    return svgResponse(
      variant === "horizontal"
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="120" viewBox="0 0 1200 120"><rect width="1200" height="120" fill="#9f211a"/><text x="70" y="76" fill="#fff" font-family="Georgia,serif" font-size="52" font-weight="700">CORAL · Deita comigo</text></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="650" viewBox="0 0 300 650"><rect width="300" height="650" fill="#fff"/><text x="150" y="300" text-anchor="middle" fill="#a51f1b" font-family="Arial,sans-serif" font-size="44" font-weight="700">CORAL</text><text x="150" y="345" text-anchor="middle" fill="#222" font-family="Georgia,serif" font-size="20">Cerveja da Madeira</text></svg>',
    );
  }
}
