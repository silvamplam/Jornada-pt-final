import {
  fetchSupabaseAdminTable,
  writeSupabaseAdmin,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";

export type MatchdayPhysicalPlacementType =
  | "opening"
  | "faixa"
  | "selection"
  | "video_highlight"
  | "zone";

export type MatchdayPhysicalPlacementTarget = Readonly<{
  placementType: MatchdayPhysicalPlacementType;
  zoneId?: string | null;
  slotPosition: number;
}>;

type PlacementAuthorityRow = Readonly<{
  is_physical: boolean;
  profile_key: string | null;
  state_token: string | null;
}>;

type PlacementRow = Readonly<{
  id: string;
  bank_item_id: string;
  placement_type: MatchdayPhysicalPlacementType;
  zone_id: string | null;
  slot_position: number;
}>;

type BankItemRow = Readonly<{
  id: string;
}>;

export type MatchdaySinglePlacementResult = Readonly<{
  state_token: string;
  no_op: boolean;
  placement_id: string | null;
  displaced_bank_item_id: string | null;
}>;

async function readAuthority(matchdayId: string) {
  const rows = await writeSupabaseAdminReturning<PlacementAuthorityRow>(
    "rpc/matchday_live_layout_single_placement_authority_v15",
    {
      method: "POST",
      body: JSON.stringify({ p_matchday_id: matchdayId }),
    },
  );
  const authority = rows[0];

  if (!authority) {
    throw new Error("matchday-live-layout-single-v15-authority-missing");
  }

  return authority;
}

export async function isMatchdayPhysicalPlacementAuthority(matchdayId: string) {
  return (await readAuthority(matchdayId)).is_physical;
}

async function readTargetPlacement(
  matchdayId: string,
  target: MatchdayPhysicalPlacementTarget,
) {
  const zoneFilter = target.zoneId
    ? `eq.${encodeURIComponent(target.zoneId)}`
    : "is.null";
  const rows = await fetchSupabaseAdminTable<PlacementRow>(
    "matchday_live_layout_placements"
      + "?select=id,bank_item_id,placement_type,zone_id,slot_position"
      + `&matchday_id=eq.${encodeURIComponent(matchdayId)}`
      + `&placement_type=eq.${encodeURIComponent(target.placementType)}`
      + `&zone_id=${zoneFilter}`
      + `&slot_position=eq.${target.slotPosition}&limit=1`,
  );
  return rows[0] ?? null;
}

async function applyLegacyMovement(
  matchdayId: string,
  action: "place" | "clear",
  bankItemId: string | null,
  target: MatchdayPhysicalPlacementTarget,
  expectedTargetBankItemId?: string | null,
  expectTargetEmpty?: boolean,
) {
  const currentTarget = await readTargetPlacement(matchdayId, target);
  const hasExplicitExpectation = expectedTargetBankItemId !== undefined
    || expectTargetEmpty !== undefined;

  await writeSupabaseAdmin("rpc/apply_matchday_live_layout_movement", {
    method: "POST",
    body: JSON.stringify({
      p_matchday_id: matchdayId,
      p_action: action,
      p_bank_item_id: bankItemId,
      p_placement_type: target.placementType,
      p_zone_id: target.zoneId ?? null,
      p_slot_position: target.slotPosition,
      p_expected_target_bank_item_id: hasExplicitExpectation
        ? expectedTargetBankItemId ?? null
        : currentTarget?.bank_item_id ?? null,
      p_expect_target_empty: hasExplicitExpectation
        ? expectTargetEmpty ?? false
        : currentTarget === null,
    }),
  });
}

async function applyPhysicalCommand(input: {
  matchdayId: string;
  expectedStateToken: string;
  action: "place" | "displace" | "bank";
  bankItemId: string;
  target?: MatchdayPhysicalPlacementTarget | null;
  expectedTargetBankItemId?: string | null;
  expectTargetEmpty?: boolean;
}) {
  const rows = await writeSupabaseAdminReturning<MatchdaySinglePlacementResult>(
    "rpc/apply_matchday_live_layout_single_placement_v15",
    {
      method: "POST",
      body: JSON.stringify({
        p_matchday_id: input.matchdayId,
        p_expected_physical_state_token: input.expectedStateToken,
        p_action: input.action,
        p_bank_item_id: input.bankItemId,
        p_placement_type: input.target?.placementType ?? null,
        p_zone_id: input.target?.zoneId ?? null,
        p_slot_position: input.target?.slotPosition ?? null,
        p_expected_target_bank_item_id: input.expectedTargetBankItemId ?? null,
        p_expect_target_empty: input.expectTargetEmpty ?? false,
      }),
    },
  );
  const result = rows[0];

  if (!result) {
    throw new Error("matchday-live-layout-single-v15-result-missing");
  }

  return result;
}

export async function applyMatchdaySinglePlacement(input: {
  matchdayId: string;
  action: "place" | "displace" | "bank";
  bankItemId: string;
  target?: MatchdayPhysicalPlacementTarget | null;
  expectedTargetBankItemId?: string | null;
  expectTargetEmpty?: boolean;
}) {
  const targetSnapshot = input.action === "place"
    && input.target
    && input.expectedTargetBankItemId === undefined
    && input.expectTargetEmpty === undefined
    ? await readTargetPlacement(input.matchdayId, input.target)
    : null;
  const expectedTargetBankItemId = targetSnapshot?.bank_item_id
    ?? input.expectedTargetBankItemId;
  const expectTargetEmpty = targetSnapshot === null
    && input.action === "place"
    && input.target
    && input.expectedTargetBankItemId === undefined
    && input.expectTargetEmpty === undefined
      ? true
      : input.expectTargetEmpty;
  const authority = await readAuthority(input.matchdayId);

  if (authority.is_physical) {
    if (!authority.state_token) {
      throw new Error("matchday-live-layout-single-v15-token-missing");
    }
    return applyPhysicalCommand({
      ...input,
      expectedStateToken: authority.state_token,
      expectedTargetBankItemId,
      expectTargetEmpty,
    });
  }

  if (input.action === "bank") {
    throw new Error("matchday-live-layout-single-v15-bank-requires-physical");
  }
  if (!input.target) {
    throw new Error("matchday-live-layout-single-v15-target-required");
  }

  await applyLegacyMovement(
    input.matchdayId,
    input.action === "place" ? "place" : "clear",
    input.action === "place" ? input.bankItemId : null,
    input.target,
    expectedTargetBankItemId,
    expectTargetEmpty,
  );
  return null;
}

async function readBankItemByLink(matchdayId: string, sourceLinkUrl: string) {
  const rows = await fetchSupabaseAdminTable<BankItemRow>(
    "matchday_editorial_bank_items?select=id"
      + `&matchday_id=eq.${encodeURIComponent(matchdayId)}`
      + "&status=eq.active"
      + `&link_url=eq.${encodeURIComponent(sourceLinkUrl)}&limit=2`,
  );

  if (rows.length !== 1 || !rows[0]?.id) {
    throw new Error("matchday-live-layout-single-v15-bank-resolution-failed");
  }
  return rows[0].id;
}

export async function applyMatchdayPlacementByLink(input: {
  matchdayId: string;
  action: "place" | "clear";
  sourceLinkUrl?: string | null;
  target: MatchdayPhysicalPlacementTarget;
}) {
  const authority = await readAuthority(input.matchdayId);

  if (!authority.is_physical) {
    await writeSupabaseAdmin("rpc/apply_matchday_live_layout_legacy_slot", {
      method: "POST",
      body: JSON.stringify({
        p_matchday_id: input.matchdayId,
        p_action: input.action,
        p_placement_type: input.target.placementType,
        p_zone_id: input.target.zoneId ?? null,
        p_slot_position: input.target.slotPosition,
        p_source_link_url: input.sourceLinkUrl ?? null,
      }),
    });
    return { isPhysical: false, result: null } as const;
  }

  if (!authority.state_token) {
    throw new Error("matchday-live-layout-single-v15-token-missing");
  }

  if (input.action === "place") {
    if (!input.sourceLinkUrl) {
      throw new Error("matchday-live-layout-single-v15-link-required");
    }
    const bankItemId = await readBankItemByLink(
      input.matchdayId,
      input.sourceLinkUrl,
    );
    const result = await applyPhysicalCommand({
      matchdayId: input.matchdayId,
      expectedStateToken: authority.state_token,
      action: "place",
      bankItemId,
      target: input.target,
    });
    return { isPhysical: true, result } as const;
  }

  const current = await readTargetPlacement(input.matchdayId, input.target);
  if (!current) {
    if (input.sourceLinkUrl) {
      throw new Error("matchday-live-layout-single-v15-source-changed");
    }
    return { isPhysical: true, result: null } as const;
  }
  if (input.sourceLinkUrl) {
    const expectedBankItemId = await readBankItemByLink(
      input.matchdayId,
      input.sourceLinkUrl,
    );
    if (current.bank_item_id !== expectedBankItemId) {
      throw new Error("matchday-live-layout-single-v15-source-changed");
    }
  }
  const result = await applyPhysicalCommand({
    matchdayId: input.matchdayId,
    expectedStateToken: authority.state_token,
    action: "displace",
    bankItemId: current.bank_item_id,
    target: input.target,
  });
  return { isPhysical: true, result } as const;
}
