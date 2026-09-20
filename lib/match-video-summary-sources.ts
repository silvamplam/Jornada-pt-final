export function mergeTrustedSourceChannelIds(
  configuredAndBuiltIn: string[],
  historicallyApproved: string[],
) {
  return Array.from(new Set(
    [...configuredAndBuiltIn, ...historicallyApproved]
      .map((channelId) => channelId.trim())
      .filter(Boolean),
  ));
}

export function inferTrustedSourceChannelIds(historicalChannelIds: string[]) {
  const counts = new Map<string, number>();
  historicalChannelIds
    .map((channelId) => channelId.trim())
    .filter(Boolean)
    .forEach((channelId) => counts.set(channelId, (counts.get(channelId) ?? 0) + 1));

  const maxCount = Math.max(0, ...counts.values());
  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2 && count >= Math.ceil(maxCount / 2))
    .map(([channelId]) => channelId);
}
