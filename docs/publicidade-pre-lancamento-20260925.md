# Publicidade pré-lançamento — 25/09/2026

Implementação local na branch `jornada-publicidade-pre-lancamento-faixa-20260925`.
Worktree: `C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt`.
Base: `4362a6f8365acec4782536d2e077e7da858fa337` (`origin/main` após fetch).
Relatório de validação antes do commit desta branch. Sem merge ou deploy. A migration foi aplicada remotamente pelo utilizador e o ficheiro local foi alinhado. A pasta principal mantém a branch, HEAD e alterações locais iniciais.

## 1. Causas confirmadas

O leitor `readPrimarySideAdvertisement` devolvia a campanha fixa Startup Madeira NOW tanto para um registo inexistente como para erros/timeout. Alguns pais mantinham o wrapper e a grelha mesmo quando o componente filho devolvia `null`: a lateral das notícias/editorial, o companheiro de Últimas e a publicidade do editorial histórico. No layout de quatro notícias faltava também completar as regras responsivas de colapso. As duas páginas de Jogos tinham caixas estáticas sem publicidade real.

A tabela `site_advertising_slots` já usa `slot_key` como chave primária e suporta posições independentes. Não existia campo para a apresentação da horizontal; não foi necessário criar entidades de campanhas/criativos.

## 2. Ficheiros alterados

| Área | Ficheiros |
| --- | --- |
| Leitura e validação | `lib/site-advertising.ts` |
| Horizontal e fronteira visual | `components/public/PublicHorizontalAdvertisement.tsx`, `components/public/renderPublicAdvertisingBoundary.tsx` |
| Lateral / Últimas | `components/public/PublicFourNewsLatestLayout.tsx`, `components/public/PublicLatestCompanionLayout.tsx`, `components/public/PublicThematicLatestOnlyLayout.tsx` |
| Jornada e respetivo editorial | `app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx`, `app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/editorial/page.tsx` |
| Invólucro lateral das notícias | `app/noticias/[slug]/page.tsx` |
| Jogos | `components/public/PublicGamesPage.tsx`, `app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/jogos/page.tsx` |
| Backoffice e API existentes | `app/admin/publicidade/page.tsx`, `app/admin/publicidade/loading.tsx`, `app/api/admin/publicidade/route.ts` |
| Testes | `lib/site-advertising-runtime.test.tsx`, `lib/public-side-advertising.test.ts`, `lib/editorial-matchday-full-page.test.ts`, `lib/public-matchday-thematic-renderer.test.ts`, `lib/public-matchday-editorial-section-frame.test.ts` |
| Migration | `supabase/migrations/20260925221106_advertising_horizontal_format.sql` |
| Relatório | `docs/publicidade-pre-lancamento-20260925.md` |

O componente `PublicSideAdvertisement` mantém o desenho existente; recebe agora ausência real através do leitor. Não foram alterados modelos, escritores, ordenação ou persistência do Bank/composição, nem lógica de artigos, classificação, continuidade, Histórica, Mesa Viva, Produção ou publicação em lote. Nos artigos/editorial foram alterados apenas os invólucros publicitários.

## 3. Migration aplicada e histórico alinhado

[20260925221106_advertising_horizontal_format.sql](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/supabase/migrations/20260925221106_advertising_horizontal_format.sql)

Acrescenta apenas `display_format text not null default 'slim'`, limitado por CHECK a `slim` ou `tall`. Forward-only; não muda campanhas existentes, URLs, bucket, grants ou RLS. Não insere qualquer campanha automática.

Testada numa base PostgreSQL local em memória (PGlite): aplicação da migration, preservação dos valores da lateral, default slim, aceitação de tall, rejeição de outro valor e RLS mantido. **Aplicação remota confirmada pelo utilizador**, com a versão `20260925221106_advertising_horizontal_format`. O SQL aplicado é semanticamente equivalente ao local; foi alterado apenas o nome do ficheiro, preservando o conteúdo.

A leitura e escrita da lateral não dependem deste novo campo. Após a migration, a leitura real de `display_format` e o formulário horizontal foram validados contra o Supabase remoto, sem gravações.

## 4. Lateral

Preserva `lateral_primary`, imagem, destino, alt, estado e posições atuais. Os wrappers são condicionados ao resultado efetivamente resolvido. Sem anúncio, a grelha recupera a coluna publicitária; as notícias relacionadas continuam a justificar uma lateral quando existem.

Na Jornada 8, medido no browser a 1440 px: com anúncio, três colunas; sem anúncio, duas colunas (`838.391px 343.594px`). A 390 px, uma coluna de 358 px e sem overflow.

[Lateral ativa em desktop](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/lateral-active-desktop.png) · [Lateral ausente em desktop](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/lateral-none-desktop.png) · [Lateral ausente em mobile](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/lateral-none-mobile.png).

## 5. Faixa horizontal

Uma única posição `horizontal_between_zones`, independente da lateral. Apresentações Estreita/slim (padrão, imagem até 120 px de altura) e Alta/tall (até 320 px). Contentor máximo de 1200 px, centrado; imagem inteira, proporcional, sem crop nem deformação, limitada à largura disponível. Uma imagem por slot.

A identificação “Publicidade” só existe com anúncio ativo e válido. Não há fundo, caixa ou altura mínima publicitária.

A integração é feita na apresentação, entre irmãos React, sem inserir anúncios nos arrays de dados editoriais. Nos percursos físico, temático, legado e histórico dinâmico, a primeira transição entre notícias efetivamente renderizadas e vídeo recebe a faixa. Blocos omitidos não contam; vídeos sem notícias anteriores não recebem automaticamente publicidade. O histórico de compatibilidade reutiliza o ponto de extensão visual de vídeo já existente, respeitando a ordem normalizada e validada.

Sem uma fronteira notícias → vídeos visível, a horizontal não aparece. Confirmado na Jornada 8, cuja composição atual não apresenta vídeos; confirmado com faixa na Jornada 4.

## 6. Ausência, Jogos e administração

Registo inexistente, estado inativo, imagem/destino vazios ou inválidos, erro e timeout resultam em ausência de publicidade. Não há campanha de recurso. A resolução no servidor permite omitir também os pais com margem, padding, separador ou coluna.

No browser da Jornada 4, os estados inativo, inexistente, erro e timeout resultaram em zero wrappers publicitários e os mesmos 44 px de transição editorial em desktop.

As duas caixas estáticas de Jogos foram removidas. A página geral passa a uma só coluna. A página de Jogos da Jornada só mantém a coluna lateral quando tem notícias reais. Não foi criada uma terceira posição.

[Jogos sem caixa publicitária](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/games-none-desktop.png).

O backoffice mantém uma página e uma API, com dois formulários independentes. A horizontal acrescenta apenas o seletor de formato. Uploads continuam no bucket `editorial-images`, no caminho `publicidade/…`, com os tipos e limite de 8 MiB existentes; middleware de autenticação e permissões preservados.

A gravação pelo browser foi verificada com armazenamento local simulado: ativar a horizontal em Alta não alterou a lateral inativa. [Backoffice desktop](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/admin-desktop.png) · [Backoffice mobile](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/admin-mobile.png).

## 7–8. Capturas dos formatos e sem publicidade

Dados editoriais das páginas reais, apenas lidos através de proxy. Os anúncios usados nas capturas são **simulações locais**, não campanhas gravadas no remoto.

| Estado | 1440 px | 900 px | 390 px |
| --- | --- | --- | --- |
| Estreita | [desktop](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/slim-desktop.png) | [intermediate](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/slim-intermediate.png) | [mobile](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/slim-mobile.png) |
| Alta | [desktop](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/tall-desktop.png) | [intermediate](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/tall-intermediate.png) | [mobile](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/tall-mobile.png) |
| Sem publicidade | [desktop](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/none-desktop.png) | [intermediate](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/none-intermediate.png) | [mobile](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/none-mobile.png) |

[Visão conjunta desktop/mobile](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/visual-overview.jpg).

Medições: largura do documento igual ao viewport em 1440, 900 e 390 px. Banner slim: 1200 × 120 em desktop e cerca de 358 × 35,8 em mobile; tall: 1200 × 300 e 358 × 89,5. As proporções da imagem são mantidas.

## 9. Verificação executada

- **96 testes focados aprovados**, incluindo 32 verificações de comportamento da publicidade, ausência, timeout, slots independentes, validação da API, backoffice, wrappers e fronteiras.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false`: aprovado, sem erros, abrangendo todos os ficheiros alterados.
- `npm run build`: aprovado (exit 0; 67 páginas estáticas geradas, typecheck incluído).
- `git diff --check`: aprovado.
- Migration testada localmente em PostgreSQL/PGlite e posteriormente aplicada remotamente pelo utilizador; histórico local alinhado sem modificar o SQL.
- Navegação pública, autenticação administrativa e responsive check no browser. Gravação horizontal independente validada apenas com armazenamento local simulado.
- React: componentes de servidor, leituras independentes em paralelo, ausência de estado/client JavaScript novo para publicidade, chaves estáveis para blocos e links externos identificados como sponsored.

Comando dos testes focados:

```powershell
node node_modules/tsx/dist/cli.mjs --test lib/public-side-advertising.test.ts lib/site-advertising-runtime.test.tsx lib/editorial-matchday-full-page.test.ts lib/public-matchday-thematic-renderer.test.ts lib/public-matchday-editorial-body.test.ts lib/public-matchday-conditional-layout.test.ts lib/public-matchday-opening-adaptive-layout.test.ts lib/public-matchday-editorial-section-frame.test.ts lib/public-matchday-latest-destination.test.ts lib/public-four-news-latest-dedup.test.ts
```

[Log dos testes](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/main-sync-tests.log) · [Log do build](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/main-sync-build.log) · [Teste da migration](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/migration-test.log).

## 10. Validação da integração remota

A aplicação local desta branch foi ligada diretamente ao Supabase remoto após a migration. `/admin/publicidade`, a Jornada 4 e o artigo “Sporting encontrou o equilíbrio e resolveu o jogo antes do intervalo” responderam com HTTP 200, sem erros de schema/API ou erros de browser.

- Lateral: `Startup Madeira NOW`, ativa, imagem `/ads/startup-madeira-now-sidebar.png`, destino `https://now.startupmadeira.eu/` e alt `Startup Madeira NOW`, preservados no formulário e na página pública. Imagem do artigo carregada a 318 × 636 px, mantendo a proporção original.
- Horizontal: formulário disponível, opções Estreita/slim e Alta/tall selecionáveis; alternar o formato não modificou os campos da lateral. Nenhum formulário publicitário foi submetido.
- O remoto contém apenas `lateral_primary`; não existe registo horizontal. A Jornada 4 apresenta zero wrappers horizontais e conserva os 44 px normais da transição editorial, sem espaço publicitário reservado.
- Uma segunda leitura confirmou todos os valores remotos idênticos aos iniciais, incluindo `updated_at`. Nenhuma campanha, upload ou configuração remota foi alterada nesta validação.
- Os 96 testes focados, typecheck e build foram repetidos e aprovados após o fast-forward para `4362a6f8365acec4782536d2e077e7da858fa337`; `git diff --check` também passou.

Capturas locais: `out/advertising-validation/remote-admin-desktop.png`, `remote-horizontal-absent.jpg` e `remote-article-lateral.jpg`. Evidência final: `out/advertising-validation/remote-check-final.json`.

## 11. Limitações

- A configuração horizontal ativa foi testada com fixtures locais. A integração remota foi validada apenas em leitura, preservando a lateral existente e a ausência de horizontal.
- A validação visual foi feita nas Jornadas 4 e 8 de Liga Portugal 2026/27. As regras dos restantes percursos são protegidas pelos testes de fronteira e integração; não foi feita uma sessão visual para cada composição possível.
- A rota geral `/jogos` em desenvolvimento apresenta um aviso de hidratação `<main>` versus `<style>`. Foi reproduzido com o componente original de HEAD numa sessão separada, confirmando que é preexistente. Não foi alterada essa lógica nesta tarefa. [Evidência baseline](C:/Users/silva/Documents/Codex/jornada-publicidade-pre-lancamento-faixa-20260925-wt/out/advertising-validation/games-baseline-errors.json).
- O build emite avisos de Autoprefixer em CSS existente de Mesa/Produção (`end`/compatibilidade), fora dos ficheiros alterados.
- As capturas, fixtures e logs estão em `out/advertising-validation`, ignorado pelo Git. Não fazem parte da implementação publicada.

## 12. Estado Git antes do commit

HEAD e `origin/main`: `4362a6f8365acec4782536d2e077e7da858fa337`. Branch 0 commits à frente / 0 atrás; 21 ficheiros desta tarefa revistos para staging explícito. Este registo descreve o estado anterior ao commit; a publicação da branch e a PR são registadas separadamente.

```text
## jornada-publicidade-pre-lancamento-faixa-20260925...origin/main
 M app/admin/publicidade/loading.tsx
 M app/admin/publicidade/page.tsx
 M app/api/admin/publicidade/route.ts
 M app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/editorial/page.tsx
 M app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/jogos/page.tsx
 M app/competicoes/[competitionSlug]/[seasonLabel]/jornadas/[matchdayNumber]/page.tsx
 M app/noticias/[slug]/page.tsx
 M components/public/PublicFourNewsLatestLayout.tsx
 M components/public/PublicGamesPage.tsx
 M components/public/PublicLatestCompanionLayout.tsx
 M components/public/PublicThematicLatestOnlyLayout.tsx
 M lib/editorial-matchday-full-page.test.ts
 M lib/public-matchday-editorial-section-frame.test.ts
 M lib/public-matchday-thematic-renderer.test.ts
 M lib/public-side-advertising.test.ts
 M lib/site-advertising.ts
?? components/public/PublicHorizontalAdvertisement.tsx
?? components/public/renderPublicAdvertisingBoundary.tsx
?? docs/publicidade-pre-lancamento-20260925.md
?? lib/site-advertising-runtime.test.tsx
?? supabase/migrations/20260925221106_advertising_horizontal_format.sql
```
