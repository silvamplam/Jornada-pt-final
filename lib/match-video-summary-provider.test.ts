import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmedCandidateMediaPatch,
  publishedVideoSummaryProvider,
} from "./match-video-summary-provider";

test("associatedProvider reflete a media realmente publicada", () => {
  assert.equal(publishedVideoSummaryProvider({
    video_url: "https://vsports.pt/vsports/embd/resumo-sporting-arouca-130983?autostart=false",
    youtube_video_id: null,
  }), "vsports");
  assert.equal(publishedVideoSummaryProvider({
    video_url: "https://www.youtube.com/watch?v=elNskBgE3Ew",
    youtube_video_id: "elNskBgE3Ew",
  }), "youtube");
  assert.equal(publishedVideoSummaryProvider({
    video_url: "https://example.com/video",
    youtube_video_id: null,
  }), null);
});

test("confirmação VSPORTS usa playable media e limpa toda a metadata YouTube", () => {
  assert.deepEqual(confirmedCandidateMediaPatch({
    id: "candidate-vsports",
    provider: "vsports",
    provider_video_id: "130983",
    canonical_url: "https://vsports.pt/vsports/vod/resumo-sporting-arouca-130983",
    playable_media_url: "https://vsports.pt/vsports/embd/resumo-sporting-arouca-130983?autostart=false",
    channel_id: null,
    thumbnail_url: "https://vsports.pt/poster.jpg",
    is_embeddable: true,
  }, null), {
    video_url: "https://vsports.pt/vsports/embd/resumo-sporting-arouca-130983?autostart=false",
    image_url: "https://vsports.pt/poster.jpg",
    duration: null,
    youtube_video_id: null,
    youtube_channel_id: null,
    is_embeddable: true,
    source_candidate_id: "candidate-vsports",
  });
});

test("confirmação YouTube preenche os campos técnicos e a provenance nova", () => {
  assert.deepEqual(confirmedCandidateMediaPatch({
    id: "candidate-youtube",
    provider: "youtube",
    provider_video_id: "elNskBgE3Ew",
    canonical_url: "https://www.youtube.com/watch?v=elNskBgE3Ew",
    playable_media_url: "https://www.youtube.com/watch?v=elNskBgE3Ew",
    channel_id: "channel-vsports",
    thumbnail_url: "https://img.youtube.com/vi/elNskBgE3Ew/hqdefault.jpg",
    is_embeddable: true,
  }, "3:42"), {
    video_url: "https://www.youtube.com/watch?v=elNskBgE3Ew",
    image_url: "https://img.youtube.com/vi/elNskBgE3Ew/hqdefault.jpg",
    duration: "3:42",
    youtube_video_id: "elNskBgE3Ew",
    youtube_channel_id: "channel-vsports",
    is_embeddable: true,
    source_candidate_id: "candidate-youtube",
  });
});

test("upgrade editorial troca provider no mesmo roundup e preserva histórico", () => {
  const roundups = [{
    id: "roundup-1",
    sort_order: 4,
    video_url: "https://vsports.pt/vsports/embd/resumo-sporting-arouca-130983?autostart=false",
    youtube_video_id: null as string | null,
    youtube_channel_id: null as string | null,
    source_candidate_id: "candidate-vsports",
  }];
  const candidateHistory = ["candidate-vsports", "candidate-youtube"];

  Object.assign(roundups[0], confirmedCandidateMediaPatch({
    id: "candidate-youtube",
    provider: "youtube",
    provider_video_id: "elNskBgE3Ew",
    canonical_url: "https://www.youtube.com/watch?v=elNskBgE3Ew",
    playable_media_url: "https://www.youtube.com/watch?v=elNskBgE3Ew",
    channel_id: "channel-vsports",
    thumbnail_url: null,
    is_embeddable: true,
  }, "3:42"));

  assert.equal(roundups.length, 1);
  assert.equal(roundups[0].id, "roundup-1");
  assert.equal(roundups[0].sort_order, 4);
  assert.equal(roundups[0].source_candidate_id, "candidate-youtube");
  assert.equal(publishedVideoSummaryProvider(roundups[0]), "youtube");
  assert.deepEqual(candidateHistory, ["candidate-vsports", "candidate-youtube"]);

  Object.assign(roundups[0], confirmedCandidateMediaPatch({
    id: "candidate-vsports",
    provider: "vsports",
    provider_video_id: "130983",
    canonical_url: "https://vsports.pt/vsports/vod/resumo-sporting-arouca-130983",
    playable_media_url: "https://vsports.pt/vsports/embd/resumo-sporting-arouca-130983?autostart=false",
    channel_id: null,
    thumbnail_url: null,
    is_embeddable: true,
  }, null));

  assert.equal(roundups.length, 1);
  assert.equal(roundups[0].id, "roundup-1");
  assert.equal(roundups[0].sort_order, 4);
  assert.equal(roundups[0].youtube_video_id, null);
  assert.equal(roundups[0].youtube_channel_id, null);
  assert.equal(roundups[0].source_candidate_id, "candidate-vsports");
  assert.equal(publishedVideoSummaryProvider(roundups[0]), "vsports");
  assert.deepEqual(candidateHistory, ["candidate-vsports", "candidate-youtube"]);
});
