# Diagnóstico antes da implementação — 16/10/2026

Branch: codex/editorial-image-acquisition-contract. HEAD/base: fd34ba2b0dbdc2ba10a35809c0112695b1ef781b. Produção consultada apenas em leitura.

## Percurso real

1. Página: https://maisfutebol.iol.pt/benfica/celtic/liga-europa-benfica-celtic-4-1-cronica. HTML 200 (82308 caracteres). NewsArticle.image.url declara https://img.iol.pt/image/id/6ad13331d34e53c759c76a1a/ (1280×720); og:image declara o preset social. A imagem principal usa carregamento JS (não é um img estático); #448 ainda pode cair em og:image.
2. newsroom_articles 3139820f-40ce-4a2b-ad4a-2e4badd09486: source_code manual_entry; image_url https://img.iol.pt/preset/6ad13331d34e53c759c76a1a/og/maisfutebol.
3. Dossiê 43bf4529-fe83-4629-819b-6d9ad5d46df2, imagem 1d9db9c3-d3a3-4e91-b4de-dc835ae17997: frozen_url igual ao preset, source_url NULL, storage_path/bucket NULL. A RPC de preparação (20260909100000, linhas 577+) copia article_row.image_url diretamente. O percurso manual-source permite referências externas; manual-entry completo valida uploads. frozen_url continua a ser candidato legado até confirmação.
4. prepareProductionImage em main reescreve o preset para /image/id/6ad13331d34e53c759c76a1a/1024.jpg e cria a decisão com essa origem.
5. GETs reais (sem redirects): preset = 200 image/jpeg, 191672 bytes, JPEG 1200×630; URL reescrita = 200 image/jpg, 131612 bytes, JPEG 1024×576, decode Sharp válido. Downloader real aceita preset e rejeita URL reescrita com image-response-invalid:200:image/jpg. A URL EXATA do JSON-LD = 200 image/webp, 207852 bytes, WebP 1280×720. Inspeção visual confirma grafismo MAISFUTEBOL no preset e ausência desse grafismo na variante 1024. Os ficheiros de observação estão em out/image-contract (não versionados).
6. claim insere acquiring antes da rede; a rejeição do MIME acontece antes de bind. Não há catch persistente nem estado failed no schema, portanto image permanece NULL indefinidamente. As três decisões reais consultadas (15:10:12, 15:10:19, 15:10:32 UTC) confirmam isto. Não houve erro HTTP remoto nem prova de crash Vercel.
7. Mesa retry repete a chave. Lote retry primeiro repete e, perante acquisition-incomplete, cria revision UUID; todas voltam a falhar pelo mesmo MIME. Uma segunda quebra latente: editorial_confirm_dossier_image_v1 compara decision.source_url com coalesce(dossier.source_url,frozen_url); a reescrita do #449 viola esta igualdade mesmo se o download terminar.
8. Sim: NewsArticle.image no JSON-LD fornece uma referência literal, distinta de og:image; não é necessário reconstruir a CDN. Esta evidência não é uma garantia universal de ausência de marcas em qualquer fotografia: seleção/revisão editorial continua necessária.
9. Materializar ao preparar a candidata é o ponto existente adequado: bytes verificados, SHA, original + quatro previews antes de selecionar. Descarregar toda a recolha indiscriminadamente não resolve a identificação errada da imagem e amplia o âmbito. frozen_url externo legado permanece material de origem e não autoridade selecionável; confirmação grava a URL local.

## Correção proposta após diagnóstico

- Aceitar alias image/jpg como JPEG, mantendo validação MIME versus bytes e decode.
- Resolver metadados da página com rede protegida (DNS fixado, redirects validados, limites), preferindo imagem de Article/NewsArticle sobre metadados sociais; eliminar reescrita de CDN. Preservar source_url original da decisão para a confirmação, guardando URL efetivamente adquirida separadamente.
- Estado failed terminal para aquisição sem bytes e expiração de claims interrompidos; retry explícito inicia revisão, recuperação de previews mantém SHA. Isto exige migration local estreita: não aplicar à produção sem autorização.
- Verificar objetos originais/previews mesmo com recibo existente. Manter uploads, ready legítimo, preserve e sem imagem.
- Testar o caminho da route com armazenamento isolado e bytes válidos; não publicar artigo real nem alterar produção para provar um teste.

## Implementação e prova final

A implementação mantém as referências legadas como candidatas até preparação. Não altera RPCs de criação de Dossiês, nem copia todas as imagens da recolha. O servidor usa a relação newsroom_article_id para consultar original_url e, quando necessário, image_url; funciona com dados existentes e não depende de atualizar o favorito.

- `editorial-image-source.server.ts`: extrai referências literais de Article/NewsArticle e imagens do corpo; distingue metadados sociais, recusa resultado ambíguo e nunca reconstrói uma CDN. Se a mesma fotografia aparece em Article e og:image, mantém a referência. Sem evidência suficiente para substituir uma origem social, falha explicitamente.
- `editorial-image-download.server.ts`: transporte partilhado com limite próprio para HTML, DNS fixado e redirects revalidados; alias image/jpg normalizado depois de validar bytes JPEG.
- `prepareProductionImage`: identidade v2 vinculada ao Dossiê e à proveniência original; só reutiliza decisões v1 depois de validar que a origem não precisa de substituição. Confronta proveniência de cópias locais antigas antes de as reutilizar.
- `freezeEditorialImage` / `createImageFreezeStorage`: persistem acquisitionUrl separado de source_url/publicUrl; falha antes de bind passa a failed; candidato com original durável recupera previews sem novo download; ready continua obrigado a ter objetos existentes. Uma decisão ready antiga de origem social sem aquisição alternativa comprovada é recusada e preservada para auditoria. registerLocal também recusa proveniência social conhecida, mesmo existindo asset/objeto.
- Route `/api/admin/editorial/images/freeze`: resolve no servidor o artigo ligado ao Dossiê, inclui o percurso legacy do painel de confirmação, mantém source_url compatível com a RPC. Valida cópias locais com proveniência incompleta usando newsroom.image_url. Expira tentativas interrompidas há mais de 120 segundos **quando essa candidata é novamente consultada**, sem apagar registos; não instala job global nem reescreve decisões históricas durante a migration.
- Mesa/lote: retry explícito de aquisição falhada abre revisão; retry de previews/confirm reutiliza bytes. Cópias locais de Dossiê no lote também passam pelo servidor. Uploads válidos mantêm URL e zero download externo.
- Favorito: NewsArticle.image antecede fallback social quando a imagem principal depende de JS. É melhoria complementar, não requisito para corrigir o material antigo.

### Caso real, sem nova recolha

O teste chama o handler POST real com NextRequest e sessão administrativa assinada de teste. DNS/HTTP e REST/Storage são portas isoladas e não podem chegar à produção. O modo `IMAGE_CONTRACT_REAL_FIXTURE=1` reproduz o HTML e os bytes realmente descarregados no diagnóstico, mantendo o downloader, o decode, o freezer, o adaptador Storage, a geração de previews, a seleção e o pré-flight da aplicação reais.

| Variante do mesmo caso | Resultado |
|---|---|
| Dossiê real 1d9db9c3…: frozen_url preset, source_url NULL, newsroom.original_url disponível | Resolve URL exata do artigo, ready, confirmação, pré-flight true |
| frozen_url local com bytes reais do preset e source_url social | Cópia existente não é reutilizada; nova imagem resolvida, ready, pré-flight true |
| frozen_url local com bytes reais do preset e source_url NULL; newsroom.image_url social | Recupera proveniência da newsroom; mesma substituição e pré-flight true |

As três variantes materializaram 207852 bytes WebP 1280×720, SHA `c012110e5fede55c711d98fa553afdc8850c3077459f8079e9177fe55acd5d58`. Asset e cinco objetos (original + quatro WebP) existem no armazenamento isolado; cada preview foi descodificado e tem largura 320/640/960/1280. Cada variante faz uma única descarga de imagem; confirmação/reload não repetem a descarga nem a leitura do HTML. O preset com o grafismo MAISFUTEBOL e a fotografia literal do JSON-LD foram inspecionados visualmente. Os bytes sociais não são publicados no teste.

A confirmação e a publicação foram também verificadas com SQL real em PostgreSQL 17.11 local, usando FOUNDATION/ACTIVATION e a nova migration. A confirmação idempotente preserva a origem social e grava a URL local; a guarda de publicação aceita um artigo sintético com o asset/objetos locais. O teste SQL usa registos de objetos; o teste da route verifica separadamente os corpos e o decode dos cinco objetos.

### Validação

- Suite focada: testes de downloader/SSRF/MIME, falhas, expiração, imutabilidade, SHA, previews, resolução de fontes, dados antigos, route, seleção/lote, upload, preserve e favorito.
- Regressão ampliada de imagens: **138 testes, 134 passaram, 3 ignorados, 1 falhou**. A falha `existing CSS reserves space before composition and batch images load` exige regras CSS antigas em `HierarchicalCompositionDeskClient.tsx`. O ficheiro é idêntico à base fd34ba2b; as duas asserções de CSS já falham na base. Não foi alterado nem atualizado o teste para esconder a falha.
- TypeScript: passa com configuração temporária que exclui `out/` e inclui app/components/lib/scripts. O comando global `tsc --noEmit` inclui uma cópia antiga preexistente em `out/image-freeze/main-audit` e produz conflitos entre tipos dessa cópia e o código atual. Nenhum desses ficheiros foi apagado ou alterado.
- PostgreSQL: harness histórico passa A/B/C, preservação dos triggers e ACL; harness novo passa failed terminal, ready imutável, confirmação e artigo sintético publicado.
- Rede real depois da correção: resolver + downloader devolvem a URL literal do artigo, image/webp e 207852 bytes. A antiga URL 1024.jpg também passa agora na validação JPEG, mas não é usada pelo resolver.

Reproduzir a evidência real (só GETs públicos e escrita local):

```powershell
node --import tsx scripts/diagnose-editorial-image-contract.ts
$env:IMAGE_CONTRACT_REAL_FIXTURE='1'
node --import tsx --test lib/editorial-image-freeze-route.test.ts
Remove-Item Env:IMAGE_CONTRACT_REAL_FIXTURE
```

Sem acesso à rede, o mesmo teste usa HTML representativo e bytes WebP gerados por Sharp. Para SQL, usar uma base temporária vazia `image_freeze_test` em localhost: executar primeiro `scripts/verify-editorial-image-authority.cjs <connection>`, depois `scripts/verify-editorial-image-acquisition.cjs <connection>`. Os scripts recusam destinos não locais. A migration é aplicada apenas nesse banco descartável.

### Rollout e limites

A migration `20261016154652_editorial_image_acquisition_failure.sql` adiciona failed/failure_code e preserva as proteções de identidade e bytes. **Necessária antes de instalar esta versão da aplicação; não aplicada em produção.** Aplicação remota exige autorização específica. Não executar um db push indiscriminado: rever todas as migrations pendentes antes de qualquer rollout autorizado.

Não houve merge, deploy, escrita na DB/Storage de produção, re-recolha, upload manual, limpeza de assets ou publicação de artigo real. Não se afirma que a produção já está corrigida. Falta o rollout autorizado e o smoke autenticado da UI em produção. O pré-flight funcional passou e os bytes/objetos foram comprovados no ambiente isolado; não se apresenta isso como screenshot da interface de produção.

O resolver prova a relação entre referências e rejeita derivados sociais identificados; não é um detetor visual universal de marcas. Artigos sem metadados suficientes ou com imagens ambíguas falham explicitamente e continuam sujeitos à escolha editorial. A exceção UPDATE/preserve exato de artigos publicados permanece intacta; não há substituição retroativa automática de artigos públicos.

Validação adicional da seleção final: **85/85** testes passaram (`editorial-production-image-preparation`, `editorial-dossier-workspace-batch-service`, `editorial-batch-preflight-ui`). A Produção agora exige a resposta de preparação para considerar uma candidata local selecionável; uma falha de validação não deixa a URL local antiga selecionada por omissão. UPDATE/preserve e artigos já publicados conservam as regras existentes.

Ficheiros adicionais: `editorial-production-image-choice.ts` e `_workspace-client.tsx` aplicam essa exigência; `_production-image-preparation.ts` define retry explícito sem perder a revisão durável; `editorial-batch-image-preparation.ts` confirma também candidatas locais. O relatório histórico de 29/09, o receiver `_manual-source-entry.tsx`, a cópia SQL do Dossiê, o source package da Mesa e a guarda de publicação em lote foram inspecionados. O receiver mantém separados imageUrl/sourceUrl; a publicação em lote chama requirePublishableEditorialImage antes das escritas, que agora herda a validação reforçada de registerLocal.

A consulta adicional de proveniência e os HEADs aos cinco objetos aumentam verificações de existência na preparação/publicação; não descarregam o original de novo quando asset e previews estão íntegros.
