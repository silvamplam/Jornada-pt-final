export type BroadcastChannelLogoContrastMode = "standard" | "light-logo";

type BroadcastChannelLogoVisualConfig = {
  opticalScale: number;
  contrastMode: BroadcastChannelLogoContrastMode;
};

export type BroadcastChannelLogoPresentation =
  | { kind: "hidden" }
  | { kind: "fallback"; name: string }
  | {
      kind: "image";
      name: string;
      logoUrl: string;
      opticalScale: number;
      contrastMode: BroadcastChannelLogoContrastMode;
    };

const DEFAULT_VISUAL_CONFIG: BroadcastChannelLogoVisualConfig = {
  opticalScale: 1,
  contrastMode: "standard"
};

const CHANNEL_VISUAL_CONFIG = new Map<string, BroadcastChannelLogoVisualConfig>([
  ["rtp1", { opticalScale: 0.76, contrastMode: "standard" }],
  ...["sport tv 1", "sport tv 2", "sport tv 3", "sport tv 4", "sport tv 5", "sport tv 6", "sport tv 7", "sport tv+"]
    .map((channelName): [string, BroadcastChannelLogoVisualConfig] => [
      channelName,
      { opticalScale: 1, contrastMode: "light-logo" }
    ])
]);

function resolveBroadcastChannelLogoVisualConfig(name: string): BroadcastChannelLogoVisualConfig {
  return CHANNEL_VISUAL_CONFIG.get(name.toLocaleLowerCase("pt-PT")) ?? DEFAULT_VISUAL_CONFIG;
}

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
    if (parsedUrl.protocol !== "https:") return { kind: "fallback", name: exactName };
    return {
      kind: "image",
      name: exactName,
      logoUrl: candidateUrl,
      ...resolveBroadcastChannelLogoVisualConfig(exactName)
    };
  } catch {
    return { kind: "fallback", name: exactName };
  }
}
