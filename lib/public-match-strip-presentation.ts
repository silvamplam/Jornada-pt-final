import {
  getPublicLiveMinute,
  type LiveMatchClockInput
} from "@/lib/live-match-clock";

export type PublicMatchStripPresentationInput = LiveMatchClockInput & {
  home_score?: number | null;
  away_score?: number | null;
};

export type PublicMatchStripPresentationKind =
  | "finished"
  | "live"
  | "halftime"
  | "postponed"
  | "scheduled";

export type PublicMatchStripCenter =
  | {
      kind: "empty";
    }
  | {
      kind: "placeholder";
      text: "-";
    }
  | {
      kind: "score";
      text: string;
    };

export type PublicMatchStripStatus =
  | {
      kind: "schedule";
    }
  | {
      kind: "live";
      label: "Live";
      minute: number | null;
    }
  | {
      kind: "label";
      label: "Intervalo" | "Finalizado" | "Adiado";
    };

export type PublicMatchStripPresentation = {
  kind: PublicMatchStripPresentationKind;
  statusLabel: string;
  center: PublicMatchStripCenter;
  status: PublicMatchStripStatus;
  finishedScore: {
    left: string;
    right: string;
  } | null;
  showChannel: boolean;
};

function statusKind(
  status?: string | null
): PublicMatchStripPresentationKind {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "finished") return "finished";
  if (normalized === "live") return "live";
  if (normalized === "halftime") return "halftime";
  if (normalized === "postponed") return "postponed";
  return "scheduled";
}

function statusLabel(status?: string | null) {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "finished") return "Finalizado";
  if (normalized === "scheduled") return "Agendado";
  if (normalized === "live") return "Live";
  if (normalized === "halftime") return "Intervalo";
  if (normalized === "postponed") return "Adiado";
  if (normalized === "cancelled") return "Cancelado";
  return status?.trim() || "Agendado";
}

function isScheduledStatus(status?: string | null) {
  const normalized = status?.trim().toLowerCase();
  return !normalized || normalized === "scheduled";
}

export function formatPublicMatchStripScore(
  homeScore?: number | null,
  awayScore?: number | null
) {
  if (
    typeof homeScore !== "number"
    || !Number.isFinite(homeScore)
    || homeScore < 0
    || !Number.isInteger(homeScore)
    || typeof awayScore !== "number"
    || !Number.isFinite(awayScore)
    || awayScore < 0
    || !Number.isInteger(awayScore)
  ) {
    return null;
  }

  return `${homeScore}\u2013${awayScore}`;
}

export function getPublicMatchStripPresentation(
  match: PublicMatchStripPresentationInput,
  now = new Date()
): PublicMatchStripPresentation {
  const kind = statusKind(match.status);
  const formattedScore = formatPublicMatchStripScore(
    match.home_score,
    match.away_score
  );
  const showCenterScore = formattedScore !== null && (
    kind === "live"
    || kind === "halftime"
  );

  const status: PublicMatchStripStatus = kind === "live"
    ? {
        kind: "live",
        label: "Live",
        minute: getPublicLiveMinute(match, now)
      }
    : kind === "halftime"
      ? { kind: "label", label: "Intervalo" }
      : kind === "finished"
        ? { kind: "label", label: "Finalizado" }
        : kind === "postponed"
          ? { kind: "label", label: "Adiado" }
          : { kind: "schedule" };

  return {
    kind,
    statusLabel: statusLabel(match.status),
    center: showCenterScore
      ? { kind: "score", text: formattedScore }
      : isScheduledStatus(match.status)
        ? { kind: "placeholder", text: "-" }
        : { kind: "empty" },
    status,
    finishedScore: kind === "finished" && formattedScore !== null
      ? {
          left: String(match.home_score),
          right: String(match.away_score)
        }
      : null,
    showChannel: kind !== "finished" && kind !== "postponed"
  };
}
