import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchSupabaseAdminTable,
} from "./supabase";

test(
  "a leitura administrativa repete apenas PGRST303 JWT issued at future",
  async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalServiceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://project.example.invalid";
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      "service-role-test";

    try {
      let transientCalls = 0;

      globalThis.fetch = async () => {
        transientCalls += 1;

        if (transientCalls === 1) {
          return new Response(
            JSON.stringify({
              code: "PGRST303",
              message: "JWT issued at future",
            }),
            { status: 401 },
          );
        }

        return new Response(
          JSON.stringify([{ id: "ok" }]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      };

      const rows =
        await fetchSupabaseAdminTable<
          Readonly<{ id: string }>
        >("seasons?select=id");

      assert.deepEqual(rows, [{ id: "ok" }]);
      assert.equal(transientCalls, 2);

      let permanentCalls = 0;

      globalThis.fetch = async () => {
        permanentCalls += 1;

        return new Response(
          JSON.stringify({
            code: "PGRST301",
            message: "Invalid JWT",
          }),
          { status: 401 },
        );
      };

      await assert.rejects(
        () =>
          fetchSupabaseAdminTable(
            "seasons?select=id",
          ),
        /Invalid JWT/,
      );

      assert.equal(permanentCalls, 1);
    } finally {
      globalThis.fetch = originalFetch;

      if (originalUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_URL =
          originalUrl;
      }

      if (originalServiceRoleKey === undefined) {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      } else {
        process.env.SUPABASE_SERVICE_ROLE_KEY =
          originalServiceRoleKey;
      }
    }
  },
);