**JORNADA.PT — Lote A2: companion previews do backoffice — 2026-09-25**

**Entrega e limites**

Branch: `jornada-egress-imagens-derivados-a2-20260925`.
Base: `5fa74009eb022f5a55f47b566b84e0bf0efd10a3`, confirmada após fetch, com A1 integrado.
Worktree: `C:/Users/silva/Documents/Codex/jornada-egress-imagens-derivados-a2-20260925-wt`.
O SHA final é o commit da entrega, indicado no relatório da conversa e consultável com `git rev-parse HEAD`; não é embutido no próprio commit.

O diretório original foi preservado: três alterações tracked prévias e os quatro untracked históricos. Não houve reset, transporte de alterações de outra feature, operação no Supabase remoto, backfill remoto, alteração de bucket, schema ou metadata de objetos existentes. Sem merge.

**Arquitetura**

O original continua a ser a autoridade. O seu conteúdo e URL não são alterados. Os derivados são objetos adicionais no bucket existente `editorial-images`, usados exclusivamente pelos previews migrados do backoffice.

Os dois endpoints de assinatura e a importação atuais já criam originais com este formato:

```text
editorial/YYYY/MM/<timestamp>-<uuid-v4>-<nome-seguro>.<jpg|jpeg|png|webp|avif>
```

Usam uma nova identidade em cada upload e proíbem upsert. O path completo versionado constitui uma identidade segura e injetiva para os companion previews; não depende apenas do título. Não é necessário hash no browser, consulta de existência durante renderização nem índice em DB.

```text
Original:
editorial/2026/09/1790323200000-12345678-1234-4123-8123-123456789012-foto.jpg

Companions:
previews/v1/editorial/2026/09/1790323200000-12345678-1234-4123-8123-123456789012-foto.jpg/w320.webp
previews/v1/editorial/2026/09/1790323200000-12345678-1234-4123-8123-123456789012-foto.jpg/w640.webp
```

A mudança de path original produz novos paths de preview. Uma receita futura usa `v2`, sem substituir `v1`. Paths históricos que não comprovem o padrão versionado são deliberadamente inelegíveis e mantêm o original. Sobrescrever manualmente o mesmo path original fora do pipeline violaria este contrato; não foi feito nem suportado neste lote.

**Processamento e dependência**

- `sharp@0.34.5` passou a dependência direta exata. Esta mesma versão já estava no lockfile, trazida pelo Next 15.5.22; não foi atualizado o encoder.
- Compatível com Node 24.x configurado no projeto. Build local e execução do encoder passaram. O trace do endpoint Next inclui o sharp e o binário nativo da plataforma de build.
- WebP, larguras máximas 320 e 640, qualidade **84**, alphaQuality 100, effort 4.
- Qualidade 84 é uma escolha conservadora para fotografia editorial; não é uma tentativa de compressão máxima.
- Apenas largura é imposta, preservando proporção, sem crop, sem flatten de transparência e com `withoutEnlargement: true`.
- Orientação EXIF aplicada antes do resize; a cópia derivada perde metadata EXIF. O original permanece byte a byte intacto.
- JPEG, PNG, WebP e AVIF foram verificados com fixtures. SVG, HEIC/outros formatos, animações e dados inválidos são recusados pela geração e ficam com fallback.
- Limites: 8 MiB de entrada, 40 milhões de pixels, dimensão máxima de 12 000 px por eixo, timeout de 8 segundos por encode e 10 segundos por pedido de Storage.
- Se o limite configurável do upload original for superior a 8 MiB, esse original continua aceite pelo percurso existente, mas a geração pode falhar de forma não bloqueante.

Referências: [instalação do sharp](https://sharp.pixelplumbing.com/install/), [resize](https://sharp.pixelplumbing.com/api-resize/), [WebP](https://sharp.pixelplumbing.com/api-output/#webp). Os uploads usam `x-upsert: false`, coerente com a [recomendação de paths novos no Supabase](https://supabase.com/docs/guides/storage/uploads/standard-uploads#overwriting-files).

**Novos uploads cobertos**

| Percurso | Integração |
|---|---|
| Upload de artigo — `_articleForm.tsx` | Original continua a ir diretamente para Storage; conclusão best effort após sucesso. |
| Upload de imagem de conteúdo — `_contentForm.tsx` | Mesmo mecanismo; upload de vídeo não alterado. |
| Publicação em lote — `_batchPreflightClient.tsx` | Inicia companions sem aguardar e devolve imediatamente o mesmo `signPayload.publicUrl` original à publicação. |
| Entrada manual — `_manualNewsEntryForm.tsx` | Inicia companions sem aguardar; input editorial e submissão imediata mantêm URL original. |
| Banco partilhado — `_dossierImageBank.tsx` | Inicia após PUT, sem aguardar antes de registar o mesmo original no Dossiê. |
| Banco interno de Produção — `_workspace-client.tsx` | Também coberto, incluindo o percurso interno anterior ao banco partilhado. |
| Planeador de outputs — `_sourcePackageOutputPlanner.tsx` | Upload externo/local conserva a URL original na escolha do output. |
| Importação de fonte — `import-source-image/route.ts` | Depois de gravar o original, reutiliza os bytes já descarregados. Nenhum segundo download. |

Os sete clientes de upload direto recebem um ticket assinado dos dois endpoints existentes `artigos/upload-image/sign` e `conteudos/upload-image/sign`. O original, headers de upload e paths continuam iguais. A função de conclusão é a mesma nos clientes React e nos dois formulários com script inline.

A conclusão é um POST administrativo separado, nunca um endpoint de imagem. Verifica sessão admin, Origin quando enviado, ticket HMAC associado ao path e validade de duas horas. O ticket não contém a service role. Depois confirma a existência de cada derivado e só descarrega o original se faltar algum. Numa repetição completa não há download nem encode. A importação reutiliza os seus bytes em memória.

Nenhuma conclusão é chamada pelo componente visual. Não há geração em GET, em scroll, durante renderização ou a cada pedido de imagem.

Uma falha gera um resultado diagnosticável com path, fase implícita na mensagem e contadores; não lança erro para o fluxo editorial. O cliente também absorve falhas de rede/HTTP e continua com o original. Não há DELETE nem upsert de originais ou previews. Um conflito de criação de preview é tratado como objeto já existente.

Nos sete percursos client-side, a chamada usa `void completeEditorialImagePreviews(...)`: depois do PUT bem-sucedido, a associação/confirmação do original e guardar/continuar/publicar não aguardam os previews. O timeout de 45 segundos limita apenas o pedido em segundo plano. O POST pequeno, contendo só path e ticket, usa `keepalive: true` para permitir continuidade durante navegação, incluindo o `form.submit()` da entrada manual. Não há abort por unmount, nova fila, cron, DB ou infraestrutura. Assinatura/validação do ticket, sessão, Origin e endpoint permanecem iguais.

`keepalive` continua best effort e sujeito aos limites do browser/rede; não garante entrega perante fecho forçado ou falha de rede. Referência: [Fetch Standard — keepalive](https://fetch.spec.whatwg.org/#request-keepalive-flag). O backfill pode recuperar companions em falta. A importação de fonte mantém a geração server-side dentro de `try/catch`, reutilizando os bytes, sem converter falha de preview em falha do original.

Publicidade também usa `editorial-images`, mas está excluída: não alterámos esse upload nem aceitamos o seu prefixo. Home e Gestor usam `matchday-editorials`, também excluído. Fontes remotas congeladas que apenas guardam uma URL externa não passam a ser importadas automaticamente.

**Renderização e fallback**

`BackofficeImage` recebe o `src` canónico original, resolve o preview só para o projeto configurado em `NEXT_PUBLIC_SUPABASE_URL`, bucket e path elegíveis, e renderiza um único `img`. Não introduz contentores ou alterações CSS.

Se o preview falhar, o componente pede o original. Se o original também falhar, não regressa ao preview. Não há `srcSet`, loop de alternância, fetch de existência, geração ou API de transformação. O estado de fallback é local ao componente. Até ao backfill, uma imagem elegível antiga pode provocar um pedido falhado de preview antes do original; os nomes históricos não elegíveis nem sequer tentam o preview.

URLs externas, Blob/data, outro bucket/projeto, SVG e paths não versionados continuam a usar exatamente o URL recebido. Query strings, fragmentos, credenciais na URL, caminhos codificados ou ambíguos e traversal não são convertidos.

**14 elementos migrados**

| Ficheiro / elemento | Variante |
|---|---|
| `HierarchicalCompositionDeskClient.tsx`: cartão de montagem | 640 — caixa fluida |
| Mesmo ficheiro: candidato do banco | 640 — caixa fluida |
| Mesmo ficheiro: Herdadas | 320 |
| Composição `page.tsx`: `ImagePreview` dos cartões administrativos | 320 |
| Mesmo ficheiro: banco de artigos | 320 |
| `_batchPreflightClient.tsx`: `productionImage.imageUrl` | 320 |
| `_mesa-source-item.tsx`: cartão de fonte | 320, só quando a origem for elegível |
| `_mesa-archive-source-item.tsx`: arquivo | 320, só quando a origem for elegível |
| Produção `_workspace-client.tsx`: banco | 320 |
| Mesmo ficheiro: identidade do output | 320 |
| `_dossierImageBank.tsx`: banco partilhado | 320 |
| `_dossierImageChoiceGrid.tsx`: imagem publicada preservada | 320 |
| Mesmo ficheiro: opção de imagem do Dossiê | 320 |
| `_sourcePackageOutputPlanner.tsx`: candidato remoto | 320 |

Preservados deliberadamente:

- Poster da lista de vídeos em Composição `page.tsx`: mantido fora da migração A2 por exclusão explícita de vídeos. Conserva lazy/async do A1.
- `previewUrl` misto Blob/local/remoto do lote e `externalPreview` imediato do planeador: feedback da escolha mantido.
- Imagens externas nos componentes migrados: o helper devolve a URL original.
- Imagens principais dos formulários, público, Home, Mesa Viva, logos de clubes/TV, publicidade e players/vídeos: intactos.

Os sete pontos A1 conservam `loading="lazy"` e `decoding="async"`; os demais conservam os atributos que já tinham. CSS, drag/drop, ordem, seleção, zonas, crop e object-position não foram alterados.

**Backfill preparado, não executado remotamente**

Comando: `npm run images:backfill -- --prefix editorial/YYYY/MM`.

- Dry-run por defeito; lista somente um mês, com 20 entradas por execução e máximo 100.
- Sem recursão automática nem leitura de milhares de objetos.
- Ordenação por nome, `--offset` explícito e `nextOffset` no relatório quando a página vem completa.
- Dry-run faz apenas listagem e verificação de existência dos dois companions; não descarrega o original nem faz encode/upload.
- Execução sequencial e idempotente; ignora companions existentes e completa apenas os ausentes.
- Escrita exige simultaneamente `--execute` e `JORNADA_PREVIEW_BACKFILL_WRITE=allow:<hostname-do-projeto-configurado>`.
- Contadores: encontrados, objetos já completos, objetos completados, ignorados, falhados, planeados, previews criados, bytes de originais processados e bytes de previews gerados.
- Uma geração parcial conta como falhada, mas os previews já criados permanecem válidos. Não há rollback que apague ficheiros. Os bytes gerados podem incluir uma tentativa que encontrou conflito; por isso não equivalem necessariamente a bytes novos persistidos.
- Logs por objeto com paths, estado e variantes previstas. Saída não inclui credenciais.

**Passos futuros de produção — requerem autorização separada**

1. Rever/autorizar esta implementação e o lote de objetos a processar. Confirmar projeto, acesso privado ao relatório e suporte WebP no bucket existente, sem alterar o bucket neste trabalho.
2. Preparar um terminal operacional com Node 24, dependências instaladas e variáveis `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` injetadas de forma segura. O script não carrega automaticamente `.env.local`. Não colocar a chave em argumentos, logs ou ficheiros versionados.
3. Confirmar a origem configurada e executar uma amostra **dry-run**:

```powershell
npm run images:backfill -- --prefix editorial/2026/09 --limit 10 --offset 0
```

4. Rever paths, ignorados e variantes em falta. Nenhuma estimativa real de compressão é produzida por dry-run, porque este não descarrega originais.
5. Só depois de nova autorização, permitir explicitamente escrita para o hostname revisto e executar a mesma amostra:

```powershell
$env:JORNADA_PREVIEW_BACKFILL_WRITE = 'allow:<project-ref>.supabase.co'
npm run images:backfill -- --prefix editorial/2026/09 --limit 10 --offset 0 --execute
Remove-Item Env:JORNADA_PREVIEW_BACKFILL_WRITE
```

6. Repetir dry-run sobre a amostra para confirmar `alreadyExisting`. Numa sessão autenticada, confirmar URLs dos derivados no Network, qualidade/crop, seleção e ausência de download do original nos cartões com preview.
7. Aumentar para lotes de 20–100, usando o `nextOffset` reportado, com revisão entre lotes. Preferir meses fechados; inserções/deleções concorrentes podem deslocar offsets e justificam uma nova passagem idempotente. Não executar um loop automático de todos os meses.
8. Parar se houver falhas de acesso, formato, limites ou custos inesperados. Companions em falta mantêm fallback. Regressão visual pode ser revertida no código sem tocar nos originais ou URLs editoriais.
9. Medir Cached Egress real depois da disponibilização dos derivados e do uso normal. A autorização deste desenvolvimento não inclui executar os passos de escrita acima.

**Testes, benchmark e validação**

- A2: **22/22 testes passaram**, incluindo ticket/auth, segurança de URL/path, formatos reais, orientação/alpha, limites, preservação de bytes, erro de geração, idempotência, concorrência, backfill e fronteira do diff.
- O teste de não bloqueio executa a instrução real dos sete clientes com o fetch de conclusão pendente: todos disponibilizam o original antes da resposta. Verifica `keepalive`, path/ticket sem URL alternativa e corpo pequeno; depois simula HTTP 503 sem rejeição não tratada. Os formulários inline continuam cobertos pelo teste de serialização.
- A1: **10/10 testes permanentes passaram**. Os dois testes opcionais de diff exclusivo do A1 ficam ignorados sem `JORNADA_EGRESS_A1_BASE`; o A2 tem a sua própria auditoria.
- Suite focada: **265 testes; 262 passaram, 1 falha preexistente, 2 ignorados**.
- Falha preexistente: `editorial-hierarchical-composition.test.ts`, “arquivar e reativar uma notícia livre repõe 15 lugares e momentos posteriores”; regex exige condições na mesma linha. Reproduzida na base exata: 31 testes, 30 passaram e a mesma falha.
- Os testes estruturais A1 e de modernização foram adaptados apenas para reconhecer o componente que continua a emitir um `img`.
- A auditoria confirma que os 15 ficheiros de aplicação existentes ficam idênticos à base removendo apenas imports/props de preview e chamadas/ticket de conclusão. Persistência, Article Plans, snapshots e payloads editoriais permanecem intactos.
- `npx tsc --noEmit`: passou.
- `npm run build`: passou, Next 15.5.22, 67 páginas estáticas; avisos Autoprefixer preexistentes em CSS não alterado.
- `next-env.d.ts`: intacto, não incluído.
- `git diff --check`: passou.
- Bundle de cliente: zero ocorrências dos marcadores de assinatura de ticket ou `SUPABASE_SERVICE_ROLE_KEY`.
- Nenhuma chamada aos serviços remotos foi usada nos testes; Storage é simulado em memória ou por fetch injetado.

Reprodução:

```powershell
$env:JORNADA_EGRESS_A2_BASE = '5fa74009eb022f5a55f47b566b84e0bf0efd10a3'
npx tsx --test lib/editorial-image-preview-a2.test.ts lib/backoffice-image-egress-a1.test.ts
npm run images:benchmark
npx tsc --noEmit
npm run build
git diff --check
```

Benchmark `scripts/benchmark-editorial-image-previews.ts`: raster sintético determinístico; não é fotografia real nem estimativa de poupança de tráfego.

| Ficheiro | Dimensões | Bytes | Redução face à fixture original |
|---|---:|---:|---:|
| JPEG original | 2400×1600 | 1 844 619 | — |
| w320 WebP | 320×213 | 2 750 | 99,85% |
| w640 WebP | 640×427 | 14 406 | 99,22% |

**Browser local**

A fixture `npx tsx scripts/serve-editorial-preview-fixture.ts` serve apenas assets sintéticos em `127.0.0.1:3102`, usando o componente real. Usa esbuild já instalado com tsx, sem dependência adicional.

Foram confirmados no browser e no contador de pedidos do servidor:

- URLs w320/w640 nos dois casos com companions; zero pedidos dos respetivos originais.
- Companion ausente: um pedido falhado e depois um pedido do original.
- Companion e original ausentes: ambos pedidos uma vez; não houve alternância/loop após rerender.
- URL fora do percurso Storage: mantida diretamente.
- Seleção conservou URL canónica; dimensões CSS e parent draggable permaneceram.
- Lazy/async presentes e nenhum erro JavaScript reportado.

Isto verifica o componente isolado, não o drag/drop integral das Mesas. As quatro áreas da aplicação construída — Redação, Produção, Publicação em lote e Composição — redirecionaram para login sem `ADMIN_PASSWORD` configurada nesta worktree. A autenticação não foi contornada, nem foram criados dados ou sessões da aplicação para obter acesso. Fluxos reais das Mesas e Network autenticado continuam por confirmar.

Capturas: `C:/Users/silva/Documents/Codex/jornada-egress-a2-validation-artifacts-20260925/`. Logs locais ignorados da validação após retirar a espera client-side: `a2-nonblocking-focused.log`, `a2-focused-files.log`, `a2-nonblocking-tests.log`, `a2-nonblocking-tsc.log`, `a2-nonblocking-build.log`. Base de reprodução da falha preexistente: `C:/Users/silva/Documents/Codex/jornada-egress-a2-base-validation-20260925/`.

**Ficheiros da entrega**

Aplicação existente (15):

- `app/admin/editorial/artigos/_articleForm.tsx`
- `app/admin/editorial/conteudos/_contentForm.tsx`
- `app/admin/editorial/composicao/[matchdayId]/HierarchicalCompositionDeskClient.tsx`
- `app/admin/editorial/composicao/[matchdayId]/page.tsx`
- `app/admin/editorial/redacao-automatica/_dossierImageBank.tsx`
- `app/admin/editorial/redacao-automatica/_dossierImageChoiceGrid.tsx`
- `app/admin/editorial/redacao-automatica/_manualNewsEntryForm.tsx`
- `app/admin/editorial/redacao-automatica/_sourcePackageOutputPlanner.tsx`
- `app/admin/editorial/redacao-automatica/mesa/_mesa-source-item.tsx`
- `app/admin/editorial/redacao-automatica/mesa/_mesa-archive-source-item.tsx`
- `app/admin/editorial/redacao-automatica/mesa/producao/[dossierId]/_workspace-client.tsx`
- `app/admin/editorial/redacao-automatica/publicacao-lote/_batchPreflightClient.tsx`
- `app/api/admin/editorial/artigos/upload-image/sign/route.ts`
- `app/api/admin/editorial/conteudos/upload-image/sign/route.ts`
- `app/api/admin/editorial/artigos/import-source-image/route.ts`

Novos módulos/runtime (9):

- `components/admin/BackofficeImage.tsx`
- `app/api/admin/editorial/image-previews/complete/route.ts`
- `lib/editorial-image-preview.ts`
- `lib/editorial-image-preview-generator.server.ts`
- `lib/editorial-image-preview-generation.server.ts`
- `lib/editorial-image-preview-storage.server.ts`
- `lib/editorial-image-preview-ticket.server.ts`
- `lib/editorial-image-preview-upload.ts`
- `lib/editorial-image-preview-backfill.server.ts`

Ferramentas, testes, dependências e documentação (9):

- `scripts/backfill-editorial-image-previews.ts`
- `scripts/benchmark-editorial-image-previews.ts`
- `scripts/serve-editorial-preview-fixture.ts`
- `lib/editorial-image-preview-a2.test.ts`
- `lib/backoffice-image-egress-a1.test.ts`
- `lib/editorial-historical-composition-ui-modernization.test.ts`
- `package.json`
- `package-lock.json`
- `docs/egress-imagens-derivados-a2-20260925.md`

**Garantias e riscos residuais**

Zero SQL/migrations; zero alteração de originais, URLs canónicas persistidas, snapshots, Proveniência, Article Plans, Intents, publicação, classificação, temas ou continuidade. Zero alterações públicas, Mesa Viva, logos, publicidade, jogos/live, resultados, cache/read models públicos ou `force-dynamic`.

A poupança em históricos depende de backfill posterior. Objetos fora do padrão versionado e formatos/tamanhos recusados continuam com o original. Originais visíveis noutros componentes ainda podem ser descarregados. Derivados acrescentam armazenamento e trabalho por upload/backfill; não existe trabalho de encode por render. Dimensões 320/640 preservam proporção, mas origens com proporções extremas podem exigir avaliar qualidade no crop CSS. A validação visual integrada e a medição real de Cached Egress aguardam acesso/autorização apropriados.
