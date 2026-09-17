export type HistoricalInheritedBankItem = Readonly<{
  continuity_source_matchday_id?: string | null;
  continuity_revalidated_at?: string | null;
}>;

export function isHistoricalInheritedBankItem(
  item: HistoricalInheritedBankItem,
) {
  return Boolean(item.continuity_source_matchday_id?.trim());
}

export function isHistoricalBankItemEligible(
  item: HistoricalInheritedBankItem,
) {
  return !isHistoricalInheritedBankItem(item)
    || Boolean(item.continuity_revalidated_at);
}
