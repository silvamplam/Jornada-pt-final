import type { MetadataRoute } from "next";

import {
  BLOCKED_CRAWLER_USER_AGENTS,
  PRESERVED_SEARCH_CRAWLERS,
} from "@/lib/crawler-egress-policy";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: [...PRESERVED_SEARCH_CRAWLERS],
        allow: "/",
      },
      {
        userAgent: [...BLOCKED_CRAWLER_USER_AGENTS],
        disallow: "/",
      },
      {
        userAgent: "*",
        allow: "/",
      },
    ],
  };
}
