import assert from "node:assert/strict";
import test from "node:test";

import {
  FOOTBALL_DATA_COMPETITIONS,
  FOOTBALL_DATA_PROVIDER,
  MAX_PROVIDER_REQUESTS_PER_RUN,
  buildFinalPatch,
  buildTeamLookup,
  findLocalMatch,
  isFinishedProviderMatch,
  isAuthorizedSyncRequest,
  resolveProviderTeam,
  seasonStartYear,
  shouldCheckResult,
  type FootballDataMatch,
  type LocalMatch,
} from "./index";

function localMatch(
  overrides:
    Partial<LocalMatch> = {}
): LocalMatch {
  return {
    id: "local-match",
    competition_id: "competition",
    season_id: "season",
    home_team_id: "arsenal",
    away_team_id: "coventry",
    kickoff_at:
      "2026-08-21T19:00:00.000Z",
    status: "scheduled",
    home_score: null,
    away_score: null,
    external_provider: null,
    external_match_id: null,
    last_synced_at: null,
    ...overrides,
  };
}

function providerMatch(
  overrides:
    Partial<FootballDataMatch> = {}
): FootballDataMatch {
  return {
    id: 560542,
    utcDate:
      "2026-08-21T19:00:00Z",
    status: "FINISHED",
    homeTeam: {
      id: 1,
      name: "Arsenal FC",
    },
    awayTeam: {
      id: 2,
      name: "Coventry City FC",
    },
    score: {
      fullTime: {
        home: 3,
        away: 0,
      },
    },
    ...overrides,
  };
}

test(
  "usa PPL PL e PD",
  () => {
    assert.deepEqual(
      FOOTBALL_DATA_COMPETITIONS,
      [
        {
          slug:
            "liga-portugal",
          code: "PPL",
        },
        {
          slug:
            "premier-league",
          code: "PL",
        },
        {
          slug:
            "la-liga",
          code: "PD",
        },
      ]
    );
  }
);

test(
  "limita a três pedidos",
  () => {
    assert.equal(
      MAX_PROVIDER_REQUESTS_PER_RUN,
      3
    );
  }
);

test(
  "scheduled e postponed ficam elegiveis",
  () => {
    assert.equal(
      shouldCheckResult(
        localMatch({
          status: "scheduled",
        })
      ),
      true
    );

    assert.equal(
      shouldCheckResult(
        localMatch({
          status: "postponed",
        })
      ),
      true
    );

    assert.equal(
      shouldCheckResult(
        localMatch({
          status: "finished",
        })
      ),
      false
    );
  }
);

test(
  "finished local não volta a ser candidato",
  () => {
    assert.equal(
      shouldCheckResult(
        localMatch({
          status: "finished",
        }),
        new Date(
          "2026-08-21T22:00:00Z"
        )
      ),
      false
    );
  }
);

test(
  "obtém 2026 da época 2026/27",
  () => {
    assert.equal(
      seasonStartYear({
        id: "season",
        competition_id:
          "competition",
        label: "2026/27",
        starts_on:
          "2026-08-06",
      }),
      2026
    );
  }
);

test(
  "só aceita FINISHED com marcador",
  () => {
    assert.equal(
      isFinishedProviderMatch(
        providerMatch()
      ),
      true
    );

    assert.equal(
      isFinishedProviderMatch(
        providerMatch({
          status: "IN_PLAY",
        })
      ),
      false
    );
  }
);

test(
  "grava Arsenal 3 Coventry 0",
  () => {
    const now =
      new Date(
        "2026-08-21T22:00:00Z"
      );

    assert.deepEqual(
      buildFinalPatch(
        providerMatch(),
        now
      ),
      {
        status: "finished",
        home_score: 3,
        away_score: 0,
        minute: null,
        live_started_at: null,
        live_base_minute: null,
        is_clock_running: false,
        external_provider:
          FOOTBALL_DATA_PROVIDER,
        external_match_id:
          "560542",
        last_synced_at:
          now.toISOString(),
      }
    );
  }
);

test(
  "resolve os nomes ingleses reais",
  () => {
    const lookup =
      buildTeamLookup(
        [
          {
            id: "arsenal",
            name:
              "Arsenal Football Club",
            short_name: "ARS",
            slug: "arsenal",
            code: "ARS",
          },
          {
            id: "coventry",
            name:
              "Coventry City Football Club",
            short_name: "COV",
            slug:
              "coventry-city",
            code: "COV",
          },
        ],
        [
          {
            team_id: "arsenal",
            normalized_alias:
              "arsenal-fc",
          },
          {
            team_id: "coventry",
            normalized_alias:
              "coventry-city-fc",
          },
        ]
      );

    assert.equal(
      resolveProviderTeam(
        "Arsenal FC",
        lookup
      ),
      "arsenal"
    );

    assert.equal(
      resolveProviderTeam(
        "Coventry City FC",
        lookup
      ),
      "coventry"
    );
  }
);

test(
  "resolve nomes reais espanhóis",
  () => {
    const lookup =
      buildTeamLookup(
        [
          {
            id: "atletico",
            name:
              "Club Atlético de Madrid",
            short_name: "ATM",
            slug:
              "atletico-de-madrid",
            code: "ESP-ATM",
          },
          {
            id: "betis",
            name:
              "Real Betis Balompié",
            short_name: "BET",
            slug: "real-betis",
            code: "ESP-BET",
          },
          {
            id: "sociedad",
            name:
              "Real Sociedad de Fútbol",
            short_name: "RSO",
            slug:
              "real-sociedad",
            code: "ESP-RSO",
          },
        ],
        []
      );

    assert.equal(
      resolveProviderTeam(
        "Club Atlético de Madrid",
        lookup
      ),
      "atletico"
    );

    assert.equal(
      resolveProviderTeam(
        "Real Betis Balompié",
        lookup
      ),
      "betis"
    );

    assert.equal(
      resolveProviderTeam(
        "Real Sociedad de Fútbol",
        lookup
      ),
      "sociedad"
    );
  }
);

test(
  "encontra Arsenal Coventry",
  () => {
    const lookup =
      buildTeamLookup(
        [
          {
            id: "arsenal",
            name:
              "Arsenal Football Club",
            short_name: "ARS",
            slug: "arsenal",
            code: "ARS",
          },
          {
            id: "coventry",
            name:
              "Coventry City Football Club",
            short_name: "COV",
            slug:
              "coventry-city",
            code: "COV",
          },
        ],
        [
          {
            team_id: "arsenal",
            normalized_alias:
              "arsenal-fc",
          },
          {
            team_id: "coventry",
            normalized_alias:
              "coventry-city-fc",
          },
        ]
      );

    assert.equal(
      findLocalMatch(
        providerMatch(),
        [localMatch()],
        "competition",
        lookup
      )?.id,
      "local-match"
    );
  }
);
test(
  "sync exige segredo privado correto",
  () => {
    assert.equal(
      isAuthorizedSyncRequest(
        undefined,
        null
      ),
      false
    );

    assert.equal(
      isAuthorizedSyncRequest(
        "segredo-correto",
        null
      ),
      false
    );

    assert.equal(
      isAuthorizedSyncRequest(
        "segredo-correto",
        "errado"
      ),
      false
    );

    assert.equal(
      isAuthorizedSyncRequest(
        "segredo-correto",
        "segredo-correto"
      ),
      true
    );
  }
);
test(
  "resultado automatico preserva metadados manuais globais",
  () => {
    const patch =
      buildFinalPatch(
        providerMatch(),
        new Date(
          "2026-08-21T23:00:00Z"
        )
      );

    assert.ok(patch);

    assert.equal(
      "data_source" in patch,
      false
    );

    assert.equal(
      "sync_status" in patch,
      false
    );

    assert.equal(
      "manual_override" in patch,
      false
    );
  }
);

test(
  "fast usa data do fornecedor e recovery varre a epoca",
  async () => {
    const module =
      await import("./index");

    const now =
      new Date(
        "2026-08-22T00:30:00Z"
      );

    assert.deepEqual(
      module.buildProviderDateRange(
        now,
        "fast"
      ),
      {
        dateFrom: "2026-08-20",
        dateTo: "2026-08-22",
      }
    );

    assert.deepEqual(
      module.buildProviderDateRange(
        now,
        "recovery"
      ),
      {}
    );

    assert.equal(
      module.syncModeFromBody({}),
      "fast"
    );

    assert.equal(
      module.syncModeFromBody({
        mode: "recovery",
      }),
      "recovery"
    );

    assert.equal(
      module.syncModeFromBody({
        mode: "qualquer",
      }),
      "fast"
    );
  }
);
