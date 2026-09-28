# Colunas editoriais independentes

`five_news_column` é uma zona normal de cinco posições. Cada zona tem UUID,
título público, cor opcional e bloco próprio na ordem editorial. Não existe
grupo persistido, `group_id`, `layout_config` ou zona de 25 artigos.

## Apresentação e ordenação

O catálogo central define capacidade, slots, renderer, publicação parcial,
elegibilidade de anfitriã e composição em colunas. A posição 1 monta a imagem
clicável e o título; as posições 2–5 montam apenas o título com link. Vagas
intermédias não compactam nem promovem artigos. Uma zona vazia continua no
editor, mas não produz HTML público.

`composePublicEditorialColumnRuns` agrupa zonas adjacentes depois da ordem
editorial final e antes da moldura/publicidade. Outra família ou bloco quebra
a sequência, mesmo que depois não seja visível. Cada sequência tem uma moldura
e é uma unidade para a política de publicidade existente. Não há anúncios entre
colunas. A Histórica conserva a sua política anterior, sem introdução de anúncios.

A grelha conceptual tem cinco colunas até ao breakpoint de 1100 px, três abaixo
dele e uma até 680 px. Sequências incompletas alinham à esquerda; sequências
maiores quebram sem alterar a ordem. Os gaps são 36 px na horizontal e 40 px
entre linhas; em mobile, 36 px entre zonas, com separador e padding superior de
28 px a partir da segunda. As imagens usam 16:9 e `cover`, conservando o fallback
existente com `contain`. Títulos completos, sem clamp.

## Cor editorial

`public_title_color` é `text nullable` nas zonas Viva e Histórica. `null` usa o
default visual; os valores não nulos aceitam exclusivamente `#RRGGBB` e são
normalizados para maiúsculas. Não se infere cor por clube, classificação ou
posição. Só esta família aplica a cor ao título da coluna; os títulos dos
artigos e as famílias anteriores ignoram-na visualmente.

O controlo normal de zona inclui picker, hexadecimal e reposição do default.
Reader, estado local, fingerprint histórico, token OCC, Apply, edição/criação,
replace, reopen, publicação, topologia, carryover, handoff e arquivo transportam
ou certificam o valor. Uma alteração concorrente de cor invalida o token.

## A acontecer agora

A elegibilidade fica no catálogo (`canHostLatest`) e no seu equivalente SQL
`jornada_private.matchday_live_layout_can_host_latest`. O seletor, estado,
parser e RPC excluem `five_news_column`. As cinco famílias elegíveis anteriores
permanecem aceites. O RPC valida o estado final antes de escrever: deslocar o
módulo para outra zona válida e converter a anfitriã anterior no mesmo Apply é
permitido.

Uma associação persistida impossível produz `ineligible_host`, preservando
UUIDs, artigos, posições e associação. A Mesa continua utilizável e apresenta
um aviso localizado; a página pública não apresenta o módulo associado nem o
move automaticamente. Só uma escolha editorial explícita corrige o destino.

## Histórica e migration

Migration única: `supabase/migrations/20260928172215_editorial_five_news_column.sql`.

A publicação parcial é exclusiva desta família: 0–5 posições únicas entre 1 e
5, mantendo a validação existente dos artigos/snapshots. As famílias anteriores
continuam a exigir preenchimento completo. O CHECK histórico de posições 1–6
não muda.

As alterações das funções existentes usam substituições delimitadas e contagem
esperada de ocorrências. Divergência da definição de origem aborta toda a
transação. Preservam-se OIDs, owners, ACLs, SECURITY e search_path. Os hashes de
arquivo/carryover anteriores mantêm-se iguais quando a nova cor é nula; cores
não nulas passam a integrar esses hashes.

## Verificação

- Baseline antes de editar: 53 ficheiros, 488 testes, 479 passados, 8 falhas,
  1 ignorado.
- Mesma bateria mais o novo ficheiro: 512 testes, 503 passados, as mesmas
  8 falhas, 1 ignorado. Zero falhas novas; 24 testes adicionais passados.
- As falhas iniciais são sete comparações de source com uma base antiga em
  `public-editorial-image-a3.test.ts` e uma asserção de source do vídeo histórico
  em `public-matchday-editorial-section-frame.test.ts`. Os TAPs antes/depois e
  as mensagens iniciais foram guardados fora do repositório.
- TypeScript da aplicação/componentes/lib/scripts passa. O material pessoal
  não versionado em `_continuity_handoff` foi excluído dessa verificação e não
  foi alterado. Não se apresenta este resultado como um build Next completo.
- SQL: PostgreSQL 17 local descartável, esquema/funções/triggers/ACLs exportados
  em leitura de `pg_catalog`, sem linhas de produção. A migration exata e os
  testes de Apply, reload, OCC, retry, atomicidade, hosts, posições, cores,
  replace/activate, publicação, carryover/handoff/archive e reopen/republish
  passaram. Também passaram as comparações de hashes nulos e metadados das funções.
- Browser: 1440/1024/390 sem overflow, 5/3/1 colunas, imagens 16:9, cores
  independentes. Sequências 1/2/3/4/5/6/7/11, vagas, fallback e quebra por módulos
  ocultos verificadas. Cinco famílias antigas × três tamanhos: 15 pares de PNGs
  com SHA-256 idêntico à base `1226023509ab9441f3c07ea8917b8b55ff351438`.

### Reprodução local

```powershell
# Testes da nova família e fronteiras diretamente alteradas
npx tsx --test lib/editorial-five-news-column.test.tsx lib/editorial-matchday-live-layout-physical-apply.test.ts lib/editorial-matchday-live-layout-desk-state-v22.test.ts lib/public-matchday-physical.test.ts

# Preview isolado dos componentes reais, com conteúdo e imagens locais de teste
$env:COLUMN_PREVIEW_BASE = '1226023509ab9441f3c07ea8917b8b55ff351438'
npx tsx scripts/serve-five-news-column-preview.tsx
```

URLs locais: `/`, `/?count=11`, `/?sparse`, `/?fallback&count=1`,
`/?break=video&hidden&ads`, `/?editor&default&count=2`. Para comparar famílias
anteriores, usar `/?count=1&family=six_news` e acrescentar `&baseline=1`.
A base é compilada em memória; o checkout não muda.

```powershell
# Base vazia LOCAL com nome five_news_column_test ou five_news_column_test_N
node scripts/verify-five-news-column-sql.cjs postgresql://postgres@127.0.0.1:55439/five_news_column_test schema-baseline.json
```

O JSON de metadados é um artefacto de teste separado, sem dados de produção.
O harness recusa hosts não locais e bases fora do padrão indicado. Usa a fixture
física existente, publicando os seus artigos pelos triggers reais. Não substitui
funções de produção por stubs.

## Limitações e aplicação futura

A migration não foi aplicada remotamente. A verificação visual usa componentes
reais com fixtures; não equivale a uma sessão autenticada completa da Mesa num
Preview Vercel com a nova migration. O diálogo nativo do picker foi validado pelo
seu evento de input; o campo hexadecimal foi exercitado por fill/blur no browser.

A base de dados deve receber a migration antes da aplicação com estes readers.
Até essa aplicação coordenada, o novo código não está pronto para publicação em
produção. É necessária a autorização explícita do responsável para a escrita
remota. Uma eventual reversão depois de uso editorial deve preservar as novas
zonas e cores; não se devem eliminar as colunas de dados cegamente. O risco de
drift das funções SQL é tratado por falha atómica, exigindo novo diagnóstico se
o esquema remoto entretanto mudar. Não há alterações de artigos, abertura ou
renderers das famílias anteriores.
