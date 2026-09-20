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
