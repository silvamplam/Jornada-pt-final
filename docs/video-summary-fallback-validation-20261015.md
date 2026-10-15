# Validação do fallback de resumos Liga Portugal — 2026-10-15

Caso de regressão: Moreirense FC 0-1 Gil Vicente FC, 8.ª jornada de 2026/27.

Fonte real validada: `https://www.ligaportugal.pt/match/20262027/ligaportugalbetclic/8/7`.

O payload `#__NUXT_DATA__` dessa página contém o resumo completo com:

- Liga Portugal video id: 70286
- VSPORTS id: 131274
- match id VSPORTS: 30422
- título: `Liga Portugal Betclic (8ªJ): Resumo Moreirense FC 0-1 Gil Vicente FC`
- VOD: `https://ligaportugal.vsports.pt/vod/131274/m/30422/liga/4efb4d8f60cf726960c410c1bd0dc6a1`
- embed: `https://ligaportugal.vsports.pt/embd/131274/m/30422/liga/4efb4d8f60cf726960c410c1bd0dc6a1?autostart=true`

A descoberta completa da 8.ª jornada foi executada contra as fontes reais depois da alteração e devolveu o item 131274 com embed reproduzível.

Testes focados: 12/12 passaram.

Nota: `npx tsc --noEmit` continua a acusar um erro já existente em `lib/site-advertising-runtime.test.tsx` (Buffer vs BlobPart), fora do âmbito desta alteração; não foram detetados erros TypeScript nos ficheiros alterados nesta correção.
