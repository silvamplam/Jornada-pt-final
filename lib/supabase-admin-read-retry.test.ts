import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchSupabaseAdminTable,
} from "./supabase";

const REAL_JWT_FUTURE_PAYLOAD =
  '{"code":"PGRST303","details":null,"hint":null,"message":"JWT issued at future"}';

async function withSupabaseAdminFetch<T>(
  fetchImplementation: typeof fetch,
  operation: () => Promise<T>,
) {
  const originalFetch = globalThis.fetch;
  const originalUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  process.env.NEXT_PUBLIC_SUPABASE_URL =
    "https://project.example.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "service-role-test";
  globalThis.fetch = fetchImplementation;

  try {
    return await operation();
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
}

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
            REAL_JWT_FUTURE_PAYLOAD,
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

test(
  "a leitura administrativa não repete outro erro PostgREST",
  async () => {
    let calls = 0;

    await withSupabaseAdminFetch(
      async () => {
        calls += 1;
        return new Response(
          JSON.stringify({
            code: "PGRST002",
            message: "Schema cache unavailable",
          }),
          { status: 503 },
        );
      },
      async () => {
        await assert.rejects(
          () => fetchSupabaseAdminTable("seasons?select=id"),
          /Schema cache unavailable/,
        );
      },
    );

    assert.equal(calls, 1);
  },
);

test(
  "a leitura administrativa termina após quatro PGRST303 persistentes e preserva o erro",
  async () => {
    let calls = 0;

    await withSupabaseAdminFetch(
      async () => {
        calls += 1;
        return new Response(
          REAL_JWT_FUTURE_PAYLOAD,
          { status: 401 },
        );
      },
      async () => {
        await assert.rejects(
          () => fetchSupabaseAdminTable("competitions?select=id"),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /PGRST303/);
            assert.match(error.message, /JWT issued at future/);
            return true;
          },
        );
      },
    );

    assert.equal(calls, 4);
  },
);

test(
  "a leitura administrativa recupera quando o PGRST303 termina na quarta tentativa",
  async () => {
    let calls = 0;

    const rows = await withSupabaseAdminFetch(
      async () => {
        calls += 1;

        if (calls <= 3) {
          return new Response(
            REAL_JWT_FUTURE_PAYLOAD,
            { status: 401 },
          );
        }

        return new Response(
          JSON.stringify([{ id: "recovered" }]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      },
      () =>
        fetchSupabaseAdminTable<Readonly<{ id: string }>>(
          "matchdays?select=id",
        ),
    );

    assert.deepEqual(rows, [{ id: "recovered" }]);
    assert.equal(calls, 4);
  },
);
