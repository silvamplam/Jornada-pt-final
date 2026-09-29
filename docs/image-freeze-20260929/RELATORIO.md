# Imagens editoriais imutáveis — entrega e checkpoint histórico

Data: 29/09/2026. Repositório: `silvamplam/Jornada-pt-final`.

Implementação e ferramentas concluídas e testadas localmente. **Não instaladas em produção.** O checkpoint histórico mantém-se: nenhum artigo histórico, objeto de Storage ou schema de produção foi alterado. A branch foi enviada por push após autorização; não houve merge ou alteração da main. A correção de rollout separa agora FOUNDATION de ACTIVATION, com deploy da aplicação entre ambas.

- Branch: `jornada-editorial-images-freeze-egress-20260929`.
- SHA-base: `ccfebdc9c85ec8f6167dcc0768c11496112ecc1a`.
- `origin/main`, reconfirmada após fetch no fecho: o mesmo SHA, merge do PR #420.
- Commit de implementação: `68d9ad6f1c26a6fb3347629153efdca357743d4c`. A documentação/evidências fica no commit seguinte; ambos são identificados na entrega.
- [Validação e limitações dos testes](VALIDACAO.md).
- [Falhas A3, analisadas individualmente e sem atualizar baseline](A3.md).
- [Inventário completo, candidatos e proveniência](inventory.json).
- [Primeiro dry-run, incluindo os 668 IDs afetados e casos por rever](dry-run.json).

## Diagnóstico read-only e causa raiz

O circuito congelava **referências**, sem garantir o congelamento dos bytes. `newsroom_articles.image_url` conserva a imagem da fonte; a preparação do Dossiê copiava essa referência para `newsroom_editorial_dossier_images.frozen_url`. Foram observadas 863 linhas de origem newsroom com referência externa e duas de upload local. O nome `frozen_url` não constituía uma garantia de imutabilidade.

A preparação de source packages reconstruía ainda a imagem a partir de `newsroom_articles` quando a origem do item do Dossiê era newsroom. Isso podia ignorar a referência congelada do banco. Os writers de artigos e as RPCs da Mesa/intents aceitavam essas URLs e não havia uma guarda final, transversal, junto da persistência. O renderer público preservava corretamente referências externas sem derivados; como consequência, o browser ia diretamente ao servidor terceiro em cada pedido sem cache local aplicável.

Assim, alterações dos bytes na origem podiam mudar a imagem pública sem nova decisão editorial. Não existe um arquivo dos bytes vistos nas decisões históricas que permita provar quando o logótipo foi introduzido. O snapshot atual permite rever os bytes atuais; não reconstrói essa decisão passada. No relatório visual foram observadas marcas Maisfutebol em candidatas, incluindo “Casa Pia desperdiçou quase tudo…” e “João Félix decidiu…”. Isto é evidência visual dessas cópias, não uma classificação por hostname ou formato da URL.

### Porque existem `manual_entry` com `img.iol.pt`

Há **dois percursos manuais ativos**, não apenas um:

1. `manual-newsroom-entry-internal.ts` / `newsroom_create_complete_manual_entry`: percurso completo, que valida imagens locais.
2. `manual-newsroom-source-internal.ts` / `newsroom_create_manual_source`, introduzido em `20260920141132_manual_newsroom_source_v1.sql`: criação de fonte manual na Mesa, que admite imagem HTTP/HTTPS externa como material de origem.

Foram observadas 29 linhas `manual_entry` com `img.iol.pt`, de 20 a 28/09. Portanto, a validação do primeiro percurso não abrangia o segundo. Admitir uma URL na recolha continua legítimo; publicá-la como autoridade visual deixa de ser permitido.

### Mapa dos percursos

| Etapa / writer | Diagnóstico | Comportamento implementado |
|---|---|---|
| Recolha RSS/fonte e `newsroom_articles.image_url` | Referências externas de material ainda não escolhido | Mantém referências; nenhuma cópia indiscriminada |
| Fonte manual da Mesa | Aceita referências externas atualmente | Mantém proveniência; escolha editorial passa pelo congelamento |
| Entrada manual completa | Upload/local já validado | Mantém fluxo; publicação exige registo local e quatro derivados |
| Preparação/criação do Dossiê | Copia a URL externa para `frozen_url` | Continua candidata não selecionada; coluna `source_url` conserva origem quando confirmada |
| Banco de imagens da Produção | Mistura uploads, publicadas e newsroom | Candidata externa só fica selecionável após cópia local carregada e confirmação |
| Article Plans | Seleção por ID do banco | Serviço recusa guardar nova seleção externa; confirmação atualiza apenas referência visual/proveniência do item |
| Source package / output images | Podia reconstruir URL externa da fonte | Transporta `frozenUrl` local; o nome de campo legacy `externalImage` é preservado por compatibilidade |
| Preflight / publicação em lote | Imagens chegavam aos writers como strings | Guardas do servidor; continuidade valida todas as imagens antes da primeira transação |
| Mesa normal | `newsroom_publish_mesa_output_v3` → writer v2 | Serviço verifica imagem; trigger final cobre também chamadas alternativas |
| Mesa intents | `newsroom_publish_mesa_intent_output_v2` → writer v1 | Mesmo contrato e guarda antes da RPC |
| Continuidade | UPDATE, NEW, preserve e retry por output | Preservação exata permitida; nova referência tem de estar local |
| Editor direto | Serviço canónico e importação por source package | Congelar/rever/confirmar; só a confirmação aplica a URL ao formulário |
| Importação de imagem do pacote | Download + UUID; previews best-effort | Decisão idempotente; quatro derivados obrigatórios; pacote já local reutiliza o objeto sem nova cópia |
| Upload manual | Caminho timestamp/UUID, sem overwrite | Mantido; regista/valida original local e completa quatro previews antes de publicar |
| Writers SQL antigos de geração/compose | Podem criar drafts com referência externa | Draft não é publicação; qualquer transição para published passa pelo trigger |
| `editorial_articles.image_url` | Sem autoridade visual transversal | Trigger exige recibo de asset e objeto existente, salvo preserve exato do mesmo publicado |
| Renderer público | `publicEditorialImageSources(...)`, previews pré-gerados | Novo naming SHA reconhecido; escolhe derivados normalmente, sem transformações on-demand |
| Retries | Uma URL repetida podia voltar a ser descarregada | Decisão persistida antes da rede; retry conserva hash/path/conteúdo |
| Promoção histórica | Não existia operação estreita/auditável | RPC específica compara referência e toda a linha, sem alterar conteúdo nem composição |

Outros writers identificados incluem `newsroom_apply_editorial_dossier_article_plan_generation`, `newsroom_create_editorial_dossier_article_plan_draft`, `newsroom_prepare_editorial_compose` e `newsroom_apply_generated_article`. Não se depende de cada caller conhecer a regra: a guarda na tabela abrange todos. Caminhos legados continuam legíveis e os artigos históricos não foram reescritos.

## Arquitetura e invariantes

O ponto escolhido é **a confirmação de utilização da imagem**, depois de descarregar uma candidata e mostrar a cópia local, antes de gravar a seleção definitiva. O editor pode olhar para a fonte inicialmente, mas confirma a candidata congelada. No importador de artigo com uma única imagem, preparar automaticamente a candidata não a aplica automaticamente ao artigo.

Cada decisão tem chave estável e estado `acquiring → candidate → ready`. A chave é reclamada antes da rede; hash e path são persistidos antes do upload. Uma decisão pronta devolve sempre a mesma imagem. Um retry após upload/persistência interrompida reutiliza os objetos. Uma aquisição interrompida antes de existir qualquer original durável falha explicitamente; não volta à origem sob a mesma decisão. A ferramenta histórica dispõe de cache local durável e pode recuperar esses mesmos bytes, verificando o hash.

Uma nova obtenção é uma ação explícita e gera outra chave. Bytes A e B diferentes produzem SHA-256 diferente e paths diferentes: `editorial/sha256/<sha256>.<ext>`. Nunca se substitui conteúdo num path existente. Se os bytes forem idênticos, a deduplicação reutiliza os mesmos objetos e mantém decisões/proveniências separadas. A URL externa fica na decisão, no Dossiê e/ou no manifest/auditoria; não é usada como fallback visual do artigo promovido.

Original e previews recebem `Cache-Control: max-age=31536000`, com `x-upsert:false`. Os quatro derivados são `previews/v1/<original-path>/w320.webp`, `w640.webp`, `w960.webp`, `w1280.webp`. Usam os mesmos bytes descarregados, em memória. O reconhecimento foi acrescentado deliberadamente a `isEditorialPreviewOriginalPath`; defaults A2 320/640 e receita v1 mantêm-se. Não se introduziram Supabase Image Transformations.

### Matriz de publicação

| Operação | Regra |
|---|---|
| NEW com imagem externa | Bloqueada até congelamento/confirmação; o servidor não materializa silenciosamente durante a publicação |
| NEW local confirmada | Publica original local registado, com quatro previews |
| UPDATE escolhe nova externa | Mesmo congelamento/revisão antes da publicação; uma URL externa diferente é recusada |
| UPDATE `preserve_published` legacy | Conserva temporariamente a referência **exata** do mesmo artigo já publicado; edição de texto continua possível |
| Draft externo → published | Bloqueado; não beneficia da exceção legacy |
| UPDATE local → externa | Bloqueado; não é preserve |
| Retry da publicação | Conserva recibo/identidade editorial existentes; não readquire imagem |
| Batch | Preflight de imagens antes de escrever; cada RPC é atómica; o lote continua retomável, sem inventar uma transação global |
| Continuidade/intents/Article Plans | Mesmo contrato, incluindo preserve e as guardas de persistência |

### Migrations SQL e ordem segura de rollout

As duas migrations foram criadas pelo CLI normal do projeto e testadas em PostgreSQL 17 local. Nenhuma foi aplicada remotamente. A versão `20260929084410` ainda não foi instalada, pelo que pode ser corrigida nesta branch sem reescrever uma migration já aplicada.

| Fase | Migration | Conteúdo e compatibilidade |
|---|---|---|
| FOUNDATION | `supabase/migrations/20260929084410_editorial_image_authority.sql` | Tabelas assets/decisions/promotions, `source_url`, decisão imutável, confirmação, promoção, ACL/RLS e proteções image-only. **Não cria a função de guarda nem instala `editorial_require_local_image`.** A main antiga pode continuar a escrever; a aplicação nova já tem todas as dependências disponíveis. |
| Deploy da aplicação | Commit compatível desta branch | Freezer, registo, confirmação e writers funcionam só com FOUNDATION. Guardas da aplicação já recusam NEW e substituições externas, mantendo apenas preserve exato do mesmo artigo publicado. Confirmar que este código está efetivamente em produção antes da fase seguinte. |
| ACTIVATION | `supabase/migrations/20260929101014_editorial_image_authority_activation.sql` | Cria `editorial_require_local_image_v1`, restringe EXECUTE e instala o trigger em `editorial_articles`. Guarda final transversal, com a mesma lógica anterior e sem flag/fallback permanente. |

**Ordem obrigatória: FOUNDATION → deploy e confirmação da aplicação → ACTIVATION.** A primeira fase elimina a dependência circular: não exige que a aplicação antiga produza recibos novos. Na fase intermédia a aplicação nova protege os seus writers, mas a proteção de qualquer SQL direto só passa a existir depois da ACTIVATION. A rollout não está concluída enquanto faltar essa fase final.

Recibos são escritos apenas pelo serviço; RLS e privilégios impedem o cliente público de os fabricar. A guarda SQL final usa registo de asset + `storage.objects`, sem hostname Supabase hardcoded. Depois da ACTIVATION, NEW local sem recibo também é recusado; preserve continua limitado à referência exata do mesmo artigo já publicado.

A promoção histórica altera apenas `image_url`; a auditoria está numa tabela separada. Compara todos os outros campos antes/depois, incluindo `updated_at`. Foram também identificados três triggers que podiam causar reconciliação de banco/composição/fontes/contexto numa atualização só da imagem. A FOUNDATION acrescenta um early return exclusivamente a esse caso, preservando o resto das funções, owner e ACL: `sync_published_editorial_source_to_matchday_bank`, `newsroom_link_legacy_article_source_v1`, `newsroom_mesa_after_article_publication_v2`. Estas proteções pertencem à FOUNDATION porque a RPC de promoção já deve funcionar integralmente antes da ACTIVATION.

As definições atuais das três funções foram novamente lidas de produção e confirmadas no formato esperado pelo patch. Também se confirmou `jornada_private.refresh_automatic_classifications_from_articles_update()`: filtra diferenças de identidade, label, title, subtitle, body e status; não considera `image_url`. Nenhuma destas leituras executou DDL/DML. [Definições remotas consultadas e timestamp](rollout-remote-functions.json).

### Segurança de rede

Downloader partilhado com os fluxos existentes: apenas HTTP/HTTPS, sem credenciais, URLs especiais, portas arbitrárias ou IPs literais; bloqueia localhost, redes privadas, link-local e metadata. Valida todos os endereços DNS e fixa o endereço validado na ligação, evitando uma segunda resolução. Máximo de três redirects, cada destino revalidado; timeout de rede 15 s; limite em streaming 8 MiB; JPEG/PNG/WebP/AVIF, MIME coerente, decode real Sharp limitado a 40 milhões de pixels, dimensões máximas 12000 e imagem não animada. Não basta aceitar cabeçalhos ou extensão.

## Dry-run histórico e revisão humana

Snapshot observado em `2026-09-29T08:56:52.398Z`, run `dc217251-8a1a-424a-ac5c-1dfdc7b3e720`. Leitura de produção reconfirmou no fecho 1089 publicados, 421 locais e 668 externos; a nova migration continua ausente.

| Domínio | Artigos | URLs únicas |
|---|---:|---:|
| `sportal365images.com` | 340 | 338 |
| `cdn.record.pt` | 314 | 304 |
| `img.iol.pt` | 9 | 9 |
| `staticx.noticiasilimitadas.pt` | 4 | 4 |
| `www.zerozero.pt` | 1 | 1 |
| **Total** | **668** | **656** |

Há 12 referências repetidas, 656 conteúdos distintos, zero duplicações de conteúdo entre URLs distintas e zero falhas HTTP/formato/tamanho no snapshot. As nove IOL incluem seis presets e três `/image/id/`; nenhuma classe foi considerada limpa por esse motivo. **Todos os 668 artigos estão por rever; zero aprovações.** Os 421 artigos já locais não são afetados. IDs/slugs dos afetados e lista explícita por rever estão em `dry-run.json`.

O relatório local é `out/image-freeze/historical/review.html`, acompanhado de `assets/`. Mostra cópia congelada, título, slug, domínio, URL original, hash, estado e ação de revisão; permite filtrar título/domínio e abrir o original congelado. Exporta `image-reviews.json` com revisor + artigo + origem + hash + decisão. Exportar não escreve em produção. As escolhas são mantidas nessa sessão do relatório: exportar antes de fechar. Não se criou uma aplicação paralela nem qualquer classificação automática de marcas.

O dry-run descarregou cada URL uma vez para cache **local**, gerou os quatro derivados e calculou os objetos remotos propostos. Não fez a fase remota de staging. Repetições não descarregam outra vez, incluindo falhas; uma nova obtenção exige um novo diretório/run e nova revisão. O manifest conservou o SHA-256 `92331e7684ade9e93b9e218ccf9cc60956ec29bc203f020df4c563d2c86ac7bd`.

O staging remoto autorizado reutilizará estes mesmos bytes/candidatas. A promoção reutiliza a URL da candidata, sem segunda cópia. Só promove revisão `approved` inequívoca para o hash e origem certos; `rejected`, `uncertain`, erros e conflitos ficam por rever. Antes de qualquer promoção, verifica o conjunto aprovado; cada RPC volta a comparar a referência sob lock, protegendo edições concorrentes.

## IMPACTO DE EGRESS E STORAGE

MB/GB abaixo usam base decimal. São bytes de imagem, salvo indicação contrária. Não são a fatura global de toda a organização.

### ANTES

- Publicadas: **421 locais, 668 externas, 0 sem imagem**.
- Bucket `editorial-images`: **2460 objetos, 157349835 bytes**.
- Storage de todo o projeto contabilizado: **172224204 bytes**.
- Média atual dos originais do pipeline: 117200 bytes; previews 320/640/960/1280: 11938 / 31239 / 51869 / 71813 bytes. O conjunto de todos os originais contém outros ficheiros maiores, pelo que a sua média não foi confundida com a do pipeline.

Logs `edge_logs`, cinco janelas UTC completas de 24h, GET de `editorial-images`, resposta 200. Bytes obtidos do `Content-Length` registado; não equivalem ao contador de faturação. [Dados de origem agregados](observed-egress.json).

| Dia UTC | Pedidos 200 | Originais / derivados | HIT / MISS | HIT por pedidos | Bytes | Extrapolação ×30 em GB |
|---|---:|---:|---:|---:|---:|---:|
| 22/09 | 488 | 488 / 0 | 402 / 86 | 82,38% | 60549332 | 1,816 |
| 23/09 | 364 | 364 / 0 | 336 / 28 | 92,31% | 45042454 | 1,351 |
| 26/09 | 928 | 261 / 667 | 356 / 572 | 38,36% | 61018677 | 1,831 |
| 27/09 | 299 | 38 / 261 | 138 / 161 | 46,15% | 42645990 | 1,279 |
| 28/09 | 243 | 54 / 189 | 50 / 193 | 20,58% | 40795185 | 1,224 |

Não se calculou uma média entre arquiteturas. 22–23/09 precedem os derivados; 26/09 inclui rollout/backfill e 104 respostas 429, 12 respostas 400 e uma 304. Em 27/09 observaram-se seis 304 e seis 400; em 28/09 nove 304. Essas respostas não contam como imagens 200 na tabela.

A faixa indicativa mais recente é **1,224–1,279 GB/mês**, extrapolando separadamente 27 e 28/09. Não prova tráfego mensal estável nem distingue todos os pedidos públicos/backoffice. Em 28/09, os 189 derivados somaram 7067472 bytes; os 54 originais ainda somaram 33727713 bytes. O cache HIT por contagem não é a percentagem de bytes cached.

Os pedidos públicos às 668 URLs externas não passam por Supabase e não aparecem nestes logs. Esse tráfego é suportado pelos terceiros. Não foi inventada uma medição desse volume.

### DURANTE

| Métrica | Realizado no dry-run | Staging remoto proposto, se autorizado |
|---|---:|---:|
| Bytes descarregados dos terceiros | **75186891** | **0 adicionais**, usando a cache atual |
| Bytes enviados para Storage | **0** | **186856189** se todos os objetos faltarem |
| Bytes de imagem lidos do Storage pelo processo | **0** | **0**, inclusive recuperação com cache local |
| Egress de corpos de imagem para validação remota | **0** | **0** com HEAD/recibos e revisão local; uma futura validação GET seria medida à parte |
| Objetos remotos criados | **0** | **3280** = 656 × (original + 4) |
| Incremento remoto de Storage | **0** | **186856189 bytes**, cerca de 186,86 MB |
| Artigos alterados | **0** | **0 no staging**; promoção só dos aprovados |

O upload futuro é ingress do Supabase, não egress. O snapshot de 75,19 MB é egress dos terceiros para o processo local. Consultas SQL/REST de inventário e respostas de metadados têm tráfego próprio, não quantificado aqui como imagem; cabeçalhos e respostas de API não são zero bytes. Não se afirma zero egress global da conta.

Após staging completo, o bucket teria **344206024 bytes** e o Storage total contabilizado **359080393 bytes** (cerca de 0,359 GB). O snapshot real é inferior ao cenário médio inicial de ~190 MB porque há 656 URLs únicas e foram medidos estes ficheiros. A repetição do dry-run produziu zero descargas, uploads, leituras de Storage e promoções.

### DEPOIS — projeções, ainda sem rollout

| Variante | Média real das 656 candidatas | P90 | Máximo |
|---|---:|---:|---:|
| Original | 114614 bytes | 151692 | 2121746 |
| 320 | 11795 bytes | 17346 | 31352 |
| 640 | 31628 bytes | 48042 | 101256 |
| 960 | 53134 bytes | 85840 | 199582 |
| 1280 | 73670 bytes | 120086 | 275158 |

Modelo responsivo: pesos de 28/09 entre derivados, 62/52/51/24 pedidos de 320/640/960/1280. Aplicados aos tamanhos reais das candidatas, dão **36264 bytes por pedido de imagem**. Cada browser escolhe uma variante; não se somam as quatro por pedido. As médias não garantem o mesmo mix depois da migração. [Cálculos reproduzíveis](economic-calculations.json).

| Pedidos de imagem | Mix observado, GB | Todos 1280 médios, GB | Todos 1280 P90, GB |
|---|---:|---:|---:|
| 10000 | 0,363 | 0,737 | 1,201 |
| 100000 | 3,626 | 7,367 | 12,009 |
| 1000000 | 36,264 | 73,670 | 120,086 |
| 5000000 | 181,320 | 368,348 | 600,430 |

Para a projeção mensal com tráfego observado, mantém-se a faixa medida dos objetos atuais (1,224–1,279 GB). Como o tráfego terceiro é desconhecido, um cenário explícito de **igual número de pedidos por artigo** adicionaria aproximadamente 0,419–0,516 GB/mês para os 668 externos, com o mix responsivo acima: total indicativo **1,64–1,80 GB/mês**. Usa 243/299 pedidos por dia × 668/421 × 30 × 36264 bytes; não é previsão observada nem contagem de pageviews.

Não há cache HIT/MISS depois desta implantação, porque não houve rollout. Não se promete uma taxa superior à observada. Paths imutáveis e cache de um ano permitem reutilização; o primeiro pedido em cada localização pode ser MISS. Para orçamento conservador, admitir 100% uncached. Um cenário de 5 milhões de pedidos todos a 1280 P90 dá 600,43 GB; um cenário degradado com fallback ao original P90 dá 758,46 GB. O maior original individual (2,12 MB) é um outlier, não uma média usada para todo o tráfego.

Preços confirmados nas fontes oficiais em 29/09/2026: egress acima da quota a **US$0,03/GB cached** e **US$0,09/GB uncached**, com **250 GB de cada tipo separadamente** em Pro/Team. [Supabase — Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

Storage Pro/Team inclui **100 GB**, com excedente a **US$0,0213/GB/mês**. O total projetado de 0,359 GB é muito inferior a essa quota, considerada isoladamente. [Supabase — Storage size](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size).

Assumindo as quotas inteiras disponíveis e 100% uncached, 5 milhões de pedidos no mix médio ficam abaixo de 250 GB; no cenário 1280 P90 o excedente custaria cerca de US$31,54; no fallback original P90, US$45,76. Consumo de outros serviços/projetos da organização reduz a quota disponível. Nenhum preço foi introduzido no runtime.

## Ficheiros alterados e motivo

| Ficheiro(s) | Motivo |
|---|---|
| `lib/editorial-image-authority.ts` | Contrato de URL própria e exceção legacy por identidade |
| `lib/editorial-image-download.server.ts` | Downloader partilhado, SSRF, limites e validação real |
| `lib/editorial-image-freeze.server.ts` | Decisão durável, hash, retry, recuperação e quatro derivados |
| `lib/editorial-image-freeze-storage.server.ts` | Adaptador de decisões, recibos e Storage sem overwrite |
| `lib/editorial-image-publication.server.ts` | Guarda comum dos serviços de publicação |
| `lib/editorial-image-preview.ts` | Aceitar naming SHA no contrato dos previews |
| `lib/editorial-article-service-internal.ts`, `lib/editorial-article-service.ts` | Guarda canónica e leitura da imagem atual para preserve |
| `lib/redacao-automatica/editorial-source-image.ts` | Reutilizar downloader protegido em vez da implementação anterior |
| `lib/redacao-automatica/editorial-source-package-internal.ts` | Compatibilidade AVIF com imagens locais congeladas |
| `lib/redacao-automatica/editorial-dossier-article-plan-service.ts` | Guarda do writer Mesa |
| `lib/redacao-automatica/newsroom-mesa-production-intents-service.ts` | Guarda do writer intents |
| `lib/redacao-automatica/editorial-dossier-production-workspace-service.ts` | Bloquear nova seleção externa não congelada no plano |
| `app/api/admin/editorial/images/freeze/route.ts` | Aquisição/confirmar autenticados, mesma origem, decisão estável |
| `app/api/admin/editorial/artigos/import-source-image/route.ts` | Importação idempotente, nova aquisição explícita, reutilização local |
| `app/api/admin/editorial/redacao-automatica/mesa/workspace/route.ts` | Evitar reconstruir imagem externa ao preparar pacote |
| `app/api/admin/editorial/redacao-automatica/publicacao-lote/route.ts` | Validar todas as imagens de continuidade antes de escrever |
| `components/admin/FreezeEditorialImage.tsx` | Mostrar e confirmar candidata; separar retry de nova obtenção |
| `app/admin/editorial/artigos/_freezeArticleImage.tsx`, `_articleForm.tsx` | Expor congelamento no editor direto |
| `app/admin/editorial/artigos/_externalArticleImport.tsx` | Confirmação explícita da cópia antes de preencher imagem |
| `app/admin/editorial/redacao-automatica/_dossierImageChoiceGrid.tsx` | Confirmar cópia no banco, distinguir IDs legacy |
| `app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx` | Mostrar seleção local confirmada |
| `app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx` | Propagar URL confirmada em output e session storage |
| `lib/editorial-image-migration.ts` | Plano puro, resumo e relatório de revisão HTML |
| `scripts/migrate-editorial-images.ts`, `package.json` | Snapshot/dry-run/staging/promoção, cache, lock, métricas |
| `supabase/migrations/20260929084410_editorial_image_authority.sql` | FOUNDATION: infraestrutura completa e promoção sem efeitos editoriais laterais; compatível com a aplicação antiga |
| `supabase/migrations/20260929101014_editorial_image_authority_activation.sql` | ACTIVATION: instalar a guarda transversal só depois de confirmar o deploy compatível |
| `lib/editorial-image-freeze.test.ts` | Testes dos novos invariantes e segurança |
| `lib/editorial-article-service.test.ts`, `editorial-article-published-slug.test.ts` | NEW local/externo, UPDATE preserve e fixtures adequadas |
| `lib/editorial-image-preview-a2.test.ts` | Contrato do importador partilhado e bytes reutilizados |
| `lib/redacao-automatica/editorial-source-package.test.ts` | Importação por decisão e confirmação antes de aplicar |
| `lib/redacao-automatica/editorial-dossier-mesa-workspace-ui.test.ts` | Pacote transporta imagem congelada |
| `lib/redacao-automatica/editorial-batch-preflight-ui.test.ts` | IDs legacy na seleção de candidatas |
| `scripts/verify-editorial-image-authority.cjs` | Teste PostgreSQL isolado das três fases A/B/C, com paragem entre migrations |
| `scripts/verify-editorial-image-foundation.ts` | Freezer e serviço canónico reais contra PostgreSQL/role de serviço antes da ACTIVATION; objetos de imagem apenas em memória |
| `scripts/serve-image-freeze-fixture.ts` | Verificação no navegador com componentes/gerador reais e dados sintéticos |
| `docs/image-freeze-20260929/*` | Diagnóstico, inventário, economia, validação e diffs A3 auditáveis |

Não se reformataram ficheiros alheios. Artefactos preexistentes de continuidade e `supabase/.temp/` ficaram intactos e fora dos commits. Imagens e servidores de teste ficam em `out/`, ignorado pelo Git; não se publicam 186 MB de binários no repositório.

## Passos que dependem de autorização

1. Autorizar a **FOUNDATION apenas**. O artefacto/job de migrations desta release deve conter o histórico e `20260929084410_editorial_image_authority.sql`, excluindo a ACTIVATION. O CLI aplica todas as migrations pendentes: **não executar `db push` com ambas disponíveis antes do deploy**. Num diretório de release isolado, validar `supabase --workdir <release-foundation> db push --project-ref mztkeurmeadwbgebmuvv --skip-vault --dry-run`; só prosseguir se listar exclusivamente FOUNDATION. Depois de aplicada por processo autorizado, confirmar tabelas/RPCs e ausência do trigger. Não alterar nem marcar a ACTIVATION como aplicada no histórico remoto.
2. Autorizar o deploy da aplicação compatível e confirmar a versão em produção. Verificar freeze/registo/confirmação, NEW local, rejeição de NEW externo e UPDATE preserve. Esta é a paragem obrigatória entre migrations; a existência do ficheiro ACTIVATION no Git não autoriza a sua aplicação automática.
3. Só após essa confirmação, autorizar **ACTIVATION**. No artefacto completo, o dry-run deve listar exclusivamente `20260929101014_editorial_image_authority_activation.sql`. Aplicar pelo processo normal de migrations e confirmar o trigger ativo. Não existe flag de bypass permanente. Após esta fase, rollback para aplicação antiga requer um plano compatível com a guarda, não apenas trocar o código. Nenhuma destas operações foi executada nesta correção.
4. Autorizar o **staging das candidatas históricas**, depois deste dry-run. Usar o diretório existente; não criar outro run para repetir a operação. O staging não altera artigos.
5. Fazer revisão humana no HTML e exportar as decisões. Não há nenhuma aprovação predefinida. Antes da promoção, executar novo dry-run da fase promote com esse ficheiro; conflitos interrompem a escrita.
6. Autorizar explicitamente a promoção do conjunto aprovado. As candidatas contaminadas, duvidosas, indisponíveis e não revistas ficam excluídas. Depois validar referências e observar novas janelas de 24h para cache/egress; medir separadamente qualquer GET de validação.

Comandos PowerShell, **não executados com `--execute` neste trabalho**:

```powershell
# Repetir o inventário existente e regenerar o relatório, sem escrita remota:
node --env-file=.env.local --import tsx scripts/migrate-editorial-images.ts --dir out/image-freeze/historical

# Só após autorização de staging e rollout FOUNDATION -> app -> ACTIVATION:
$env:JORNADA_IMAGE_MIGRATION_WRITE='allow:mztkeurmeadwbgebmuvv.supabase.co'
node --env-file=.env.local --import tsx scripts/migrate-editorial-images.ts --dir out/image-freeze/historical --phase snapshot --execute

# Após exportar revisões humanas: preflight, ainda sem promoção:
node --env-file=.env.local --import tsx scripts/migrate-editorial-images.ts --dir out/image-freeze/historical --phase promote --reviews out/image-freeze/image-reviews.json

# Só depois da aprovação explícita desse plano:
node --env-file=.env.local --import tsx scripts/migrate-editorial-images.ts --dir out/image-freeze/historical --phase promote --reviews out/image-freeze/image-reviews.json --execute
Remove-Item Env:JORNADA_IMAGE_MIGRATION_WRITE
```

## Limitações e riscos residuais

As 668 referências externas continuam em produção até revisão/promoção autorizada; UPDATE preserve permite conscientemente essa continuidade, sem aceitar nova referência externa. A implantação é necessária antes de afirmar que a regra está ativa em produção.

Não se altera composição, Latest ou snapshots de imagem históricos. Consequentemente, snapshots públicos independentes que ainda conservem URLs externas podem necessitar de inventário/revisão próprios; a promoção aqui muda exclusivamente a autoridade canónica do artigo, como solicitado. Não se faz uma substituição transversal silenciosa desses snapshots.

Um serviço privilegiado com permissões administrativas sobre Storage continua capaz de apagar objetos. Imutabilidade nesta arquitetura significa caminhos únicos, ausência de overwrite/upsert e recibos/decisões protegidos; não é WORM contra o proprietário do projeto. Candidatas não aprovadas ocupam espaço após staging; limpeza eventual exige política própria e não pode apagar objetos referidos por artigos/decisões. Não se introduziu limpeza automática.

Pedidos interrompidos antes de haver bytes duráveis requerem nova ação explícita. Erros a meio de um lote podem deixar outputs anteriores publicados segundo o comportamento retomável já existente; não há transação global fictícia. A promoção é atómica por artigo, compara concorrência e é idempotente; não promete atomicidade de todo o lote histórico.

Não houve comparação pixel a pixel de todo o site, deploy, E2E autenticado em produção ou medição de cache após rollout. A documentação A3 separa precisamente o que é main anterior e o que muda no backoffice desta branch. **Não houve merge.**
