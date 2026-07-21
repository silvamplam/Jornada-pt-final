export type BroadcastChannelLogoPresentation =
  | { kind: "hidden" }
  | { kind: "fallback"; name: string }
  | { kind: "image"; name: string; logoUrl: string };

export function resolveBroadcastChannelLogoPresentation(
  name: string | null | undefined,
  logoUrl: string | null | undefined
): BroadcastChannelLogoPresentation {
  const exactName = name?.trim();
  if (!exactName) return { kind: "hidden" };

  const candidateUrl = logoUrl?.trim();
  if (!candidateUrl) return { kind: "fallback", name: exactName };

  try {
    const parsedUrl = new URL(candidateUrl);
    return parsedUrl.protocol === "https:"
      ? { kind: "image", name: exactName, logoUrl: candidateUrl }
      : { kind: "fallback", name: exactName };
  } catch {
    return { kind: "fallback", name: exactName };
  }
}
