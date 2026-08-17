import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import robots from "@/app/robots";
import { middleware } from "@/middleware";
import {
  BLOCKED_CRAWLER_USER_AGENTS,
  isBlockedCrawlerUserAgent,
} from "@/lib/crawler-egress-policy";
import { NextRequest } from "next/server";

test("bloqueia crawlers nao essenciais observados", () => {
  const blockedUserAgents = [
    "Mozilla/5.0 Chrome/143.0.0.0 Safari/537.36 iubenda-radar/3.28.0",
    "Mozilla/5.0 (compatible; Amazonbot/0.1)",
    "meta-webindexer",
    "meta-externalagent/1.1",
  ];

  for (const userAgent of blockedUserAgents) {
    assert.equal(isBlockedCrawlerUserAgent(userAgent), true, userAgent);
  }
});

test("preserva pesquisa, previews sociais e browsers normais", () => {
  const allowedUserAgents = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Googlebot-Image/1.0",
    "Googlebot-Video/1.0",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "facebookexternalhit/1.1",
    "meta-externalfetcher/1.1",
    "Mozilla/5.0 Firefox/153.0",
  ];

  for (const userAgent of allowedUserAgents) {
    assert.equal(isBlockedCrawlerUserAgent(userAgent), false, userAgent);
  }
});

test("robots bloqueia crawlers dispensaveis e mantem indexacao geral", () => {
  const value = robots();
  assert.ok(Array.isArray(value.rules));

  const rules = value.rules as Array<{
    userAgent: string | string[];
    allow?: string | string[];
    disallow?: string | string[];
  }>;

  const blockedRule = rules.find((rule) =>
    Array.isArray(rule.userAgent)
    && BLOCKED_CRAWLER_USER_AGENTS.every((userAgent) =>
      rule.userAgent.includes(userAgent),
    ),
  );

  assert.ok(blockedRule);
  assert.equal(blockedRule.disallow, "/");

  const fallbackRule = rules.find((rule) => rule.userAgent === "*");
  assert.ok(fallbackRule);
  assert.equal(fallbackRule.allow, "/");
});

test("middleware corta crawler antes de renderizar a pagina", async () => {
  const blocked = await middleware(new NextRequest("https://www.jornada.pt/", {
    headers: {
      "user-agent": "iubenda-radar/3.28.0",
    },
  }));

  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get("x-robots-tag"), "noindex, nofollow");

  const allowed = await middleware(new NextRequest("https://www.jornada.pt/", {
    headers: {
      "user-agent": "Googlebot/2.1",
    },
  }));

  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("x-middleware-next"), "1");
});

test("middleware preserva a protecao existente do admin", () => {
  const source = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");

  assert.match(source, /ADMIN_SESSION_COOKIE/);
  assert.match(source, /verifyAdminSession/);
  assert.match(source, /redirectToAdminLogin/);
  assert.match(source, /pathname\.startsWith\("\/admin\/login"\)/);
  assert.match(source, /pathname\.startsWith\("\/api\/admin\/login"\)/);
  assert.match(source, /pathname\.startsWith\("\/api\/admin\/logout"\)/);
  assert.match(source, /robots\.txt/);
  assert.match(source, /_next\/image/);
});
