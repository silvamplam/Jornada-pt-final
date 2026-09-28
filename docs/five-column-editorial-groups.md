# Grupos editoriais de cinco colunas

Base: `21b29b48740a1580aa606f3e37c7dc0bea210302`.
Branch: `jornada-five-columns-editorial-group-20260928`.

## Diagnóstico

A Viva usa zonas e placements físicos, lidos pela workspace v22 e guardados
pela facade v29. A Mesa usa `PhysicalDeskState`, com undo e token OCC.
O público já juntava colunas consecutivas para apresentação/publicidade, mas
essa sequência não tinha identidade, título ou estado editorial persistente.
A Histórica guarda outras zonas e snapshots, através do workspace plan v3;
reopen cria IDs novos e a publicação coordena topology/carryover/handoff/archive.
Logo, apenas agrupar a rail ou alterar CSS não asseguraria continuidade.

O diagnóstico da Jornada 08 encontrou cinco colunas independentes, com
3/2/2/2/2 histórias. A fotografia desses dados foi obtida por leitura e ficou
fora do Git. Nenhum agrupamento foi gravado nessa Jornada.

## Modelo e integridade

Migration nova: `20260928230533_editorial_five_column_groups.sql`.
Não altera migrations antigas e não contém backfill de dados.

- `matchday_live_layout_column_groups` e `matchday_historical_column_groups`:
  identidade UUID, contexto, título, ligado/desligado e zona âncora.
- As respetivas tabelas `column_group_members` têm FKs explícitas para grupo
  e zona, exclusividade de associação e posição 1–5.
- A ordem do grupo é a posição do bloco da sua primeira zona membro. Não se
  duplica a ordem editorial numa segunda coluna que possa divergir dos blocos.
- Constraints diferidas verificam exatamente cinco membros `five_news_column`,
  âncora correta e continuidade da ordem final da transação. O vídeo histórico
  não pode ficar entre membros. Writers antigos também ficam sujeitos às regras.
- Ligado exige pelo menos uma história em cada membro. Desligado permite
  trabalho incompleto. A rejeição é transacional, sem alterações parciais.
- Desagrupar apaga apenas grupo/associações; mantém zonas, IDs e histórias.
- As tabelas têm RLS, sem acesso de anon/authenticated. Os writers são privados
  ou RPCs concedidas apenas a service_role. Contextos não podem ser trocados.

## Mesa e público

`Página e blocos → Agrupar 5 colunas` permite selecionar explicitamente cinco
zonas existentes. A ordem de seleção define os membros. Estes são reunidos na
posição da primeira zona na página; o grupo começa desligado.

A rail apresenta uma entrada, título e contagem total. O movimento troca a
unidade inteira com a vizinha. O painel central mantém o editor existente,
precedido do título do grupo, controlo de estado e cinco seletores. Só uma zona
é editada; drag/drop mantém o zoneId dessa zona. O painel de candidatas, slots,
menus, seleção, undo, tracking e Apply existentes são reutilizados.

O cabeçalho da coluna mantém título/família/contagem na primeira linha. O
picker, HEX manual e reset ficam numa segunda linha compacta. O controlo de cor
continua exclusivo da apresentação das colunas; o grupo não tem cor própria.

No público, membros explícitos originam uma unidade com heading próprio.
Grupos adjacentes não se fundem. Grupos desligados/inválidos não publicam
parcialmente. A unidade mantém o renderer 5/3/1, cores independentes e slots
esparsos: posição 2 nunca passa a destaque quando a posição 1 está vazia.
A publicidade é inserida fora da unidade. Colunas sem grupo preservam o
comportamento anterior por sequência. A elegibilidade de “A acontecer agora”
continua inalterada: `five_news_column` não pode ser host.

## Persistência e continuidade

- A workspace v22 transporta `column_groups` em settings. O token incorpora
  título, estado, identidade e membros; sem grupos, o hash anterior é preservado.
- Apply v31 engloba Apply v29 e substituição de associações na mesma transação.
- Histórica transporta IDs e metadata por membro no plano; replace mantém os
  IDs recebidos. Apply v4 verifica o estado anterior dos grupos, incluindo a
  corrida entre um editor sem grupos e a criação concorrente de um grupo.
- O primeiro draft hierárquico copia grupos explícitos da Viva. Em drafts já
  existentes, `Página e blocos → Importar grupos da Viva` acrescenta apenas os
  grupos em falta, preservando conteúdo existente. Histórias já usadas, mesmo
  em snapshots sem Bank FK, causam rejeição integral com diagnóstico.
- A Histórica permite editar título/estado/colunas, mover e desagrupar. Reopen
  conserva a identidade do grupo e remapeia membros para os novos IDs de zonas.
- Topology cria associações desligadas; carryover repõe o estado depois de
  copiar os placements. Handoff verifica os mapas de membros. Hashes de origem
  e certificação de arquivo incluem o grupo; arquivo certificado é imutável.
- Republicação da Histórica não altera a Viva seguinte já entregue.

## Validação local

- PostgreSQL 17 isolado, apenas loopback, a partir de schema/contratos exportados
  por leitura: migration, OIDs/ACLs/security/search_path, hashes sem grupos,
  Apply/reload/retry, cardinalidade, mínimo por coluna, OCC, undo de falhas,
  replace/import histórico, publicação real, carryover/handoff/archive,
  reopen/retry e republicação. Resultado: PASS.
- 18 testes novos de estado, payload, seleção, slots, movimento, cores, ungroup,
  título, renderer, publicidade e Histórica: PASS.
- Um teste novo do reader histórico valida ordem, fallback estrito antes da
  migration e propagação de erros reais: PASS.
- Bateria comparável: main tinha 525 testes, 516 PASS, 8 FAIL e 1 SKIP.
  Com os 18 testes de grupos: 543 testes, 534 PASS, os mesmos 8 FAIL e 1 SKIP.
  Zero falhas novas. Três testes existentes foram adaptados para a unidade de
  grupo e para o fallback estritamente limitado a RPC ausente.
- As oito falhas pré-existentes são sete comparações com uma base antiga em
  `public-editorial-image-a3.test.ts` e a comparação textual do frame histórico
  em `public-matchday-editorial-section-frame.test.ts`. Não foram ocultadas.
- TypeScript de app/components/lib/scripts: PASS. Exclui apenas a pasta pessoal
  não versionada `_continuity_handoff`, que contém erros alheios ao lote.
- `git diff --check`: PASS.

### Evidência visual

`serve-five-column-groups-preview.tsx` compila a Mesa **real**, a sua própria
CSS e os dados lidos da Jornada 08. A baseline é compilada de `git show` da base
imutável. Não é outro desenho nem outro componente. O servidor local rejeita
todos os pedidos de escrita e não encaminha APIs para produção.

`verify-five-column-groups-browser.cjs` conduz criação, seletores 1–5, drag/drop
real para a Coluna 4, HEX/reset, ligar, mover e undo. Captura antes, grupo fechado,
Coluna 1 e Coluna 4, sempre com o painel direito visível.

| Medida a 1440 | Antes | Depois |
|---|---:|---:|
| Entradas na rail | 13 | 9 |
| Editores centrais visíveis | 1 | 1 |
| Largura da lista da rail | 163 px | 163 px |
| Largura do painel central | 635,34 px | 635,34 px |
| Largura do painel direito | 602,66 px | 602,66 px |
| Altura do cabeçalho da coluna | 117 px | 91,19 px |
| Altura do controlo de cor | 86 px | 45,19 px |

O aviso existente de alterações pendentes acrescenta 31 px acima dos painéis;
as posições horizontais mantêm-se. Não há overflow horizontal.

`serve-five-news-column-preview.tsx` com `?group=1&sparse=1&ads=1&before=1`
exercita o renderer público real com conteúdo sintético/local. Verificação a
1440/1024/390: 5/3/1 colunas, ordem preservada, sem overflow nem anúncios dentro.
`verify-five-column-groups-public.cjs` também compara cinco apresentações já
existentes com main nos três tamanhos: **15 pares de PNG byte-equivalentes**.
Inclui `six_news`, `five_news_balanced`, `five_news_secondary`, `six_news_1_2_3`
e `five_news_column` sem grupo.

Os scripts de browser recebem o caminho de agent-browser e o diretório de
artefactos. Abrir previamente uma sessão `column-groups` evita o problema de
handles herdados ao iniciar o browser via processo síncrono no Windows.

## Gate e limitações

A migration está criada, mas **não foi aplicada remotamente**. O Preview pode
mostrar a UI, mas guardar grupos requer a migration. A Viva devolve diagnóstico
de migration pendente; a Histórica só faz fallback para v3 quando v4 não existe
e nenhum grupo participa. Não se faz fallback de erros OCC/validação.

As fotografias da Mesa provam a interação local com o componente real; a
persistência e publicação foram exercitadas separadamente no PostgreSQL local.
Não houve Apply de produção, repair, SQL remoto, backfill da Jornada 08 ou merge.
As alterações de funções SQL usam substituições delimitadas com deteção de
drift: se o contrato remoto divergir, a migration aborta integralmente.

## Retificações finais — cabeçalho compacto

Base desta revisão: `cd9b92030d50dcde705a24575bd58e70aa2ff3ac`, na mesma
branch `jornada-five-columns-editorial-group-20260928`.

A cópia read-only da Jornada 08 contém 3 + 2 + 2 + 2 + 2 histórias. A divergência
15/25 não se reproduziu nesta base. Para evitar fontes de contagem diferentes,
`columnGroupStoryCount` passa a servir o cabeçalho e as rails Viva/Histórica,
somando exclusivamente as posições ocupadas das zonas membro. O teste específico
inclui mais quatro histórias numa zona exterior: há 15 placements, mas o grupo
continua a mostrar 11/25. Slots vazios e posições reservadas não entram na soma.

A ação passa a ser explícita: **Desligado · Ligar** ou **Ligado · Desligar**.
Mantém-se a validação existente: grupo incompleto pode ficar desligado; tentar
ligá-lo é rejeitado integralmente até existir pelo menos uma história por coluna.

O cabeçalho tem três linhas: título/total/ação; cinco seletores; título e família
da coluna/ocupação/picker/HEX/default. As legendas continuam acessíveis. O modo
compacto do controlo de cor só é usado quando a coluna pertence ao grupo.

### Medição real a 1440 × 1000

| Medida | Antes (`cd9b920`) | Depois |
|---|---:|---:|
| Cabeçalho completo, do topo do grupo ao primeiro slot | 211,19 px | 114 px |
| Controlos do grupo e seletores | 109 px | 67 px |
| Cabeçalho da coluna, incluindo cor | 91,19 px | 36 px |
| Primeiro slot: coordenada vertical | 398,19 px | 301 px |
| Entrada do grupo na rail | 38 px | 38 px |
| Rail / centro / direita: larguras | 163 / 635,34 / 602,66 px | iguais |

Redução total: 97,19 px (46%). Os 45,19 px do controlo de cor anterior estavam
incluídos nos 91,19 px da coluna; não devem ser somados uma segunda vez.
As coordenadas x/y dos três painéis e as suas alturas são iguais. Os cards e
slots mantêm dimensões e comportamento. A comparação da Mesa com a família
`six_news_1_2_3` selecionada produziu PNGs byte-equivalentes (SHA-256
`16b424564b7b78b604c38372c97f9061d8539b292e21d5716a7a2b9e964422dd`).

### Verificação desta revisão

- 24 testes do grupo: PASS, incluindo soma 11/25, drag/drop, remoção, undo,
  serialização Apply/reconstrução do estado, campos/cor e contagem histórica.
- Bateria focada: 550 testes; 541 PASS, oito falhas pré-existentes em main,
  um skip. As oito falhas são exatamente as já documentadas acima.
- TypeScript de app/components/lib/scripts e `git diff --check`: PASS.
- `verify-five-column-groups-compact-browser.cjs`: Mesa real, mesma cópia J08,
  baseline compilada de `cd9b920`; rail/total/tabs, drop/remover/undo, coluna
  ativa, HEX inválido/normalizado, picker/default, ligar/desligar e rejeição
  atómica quando a Coluna 5 está vazia. O picker recebe os eventos DOM nativos;
  a caixa de seleção de cor do sistema operativo não é automatizada.
- Capturas: Coluna 1, Coluna 4 desligada/ligada, medição vertical anotada e
  comparação da família antiga. Nenhum overflow horizontal a 1440.

Reprodução: arrancar `serve-five-column-groups-preview.tsx <cópia-J08.json>` com
`GROUP_PREVIEW_BASE=cd9b92030d50dcde705a24575bd58e70aa2ff3ac`; executar
`node scripts/verify-five-column-groups-compact-browser.cjs <agent-browser> <saída>`.
O harness continua a recusar writes e não tem proxy para produção. O teste de
reload passa pelo payload e pela reconstrução real do estado da Mesa; não faz
Apply remoto. SQL, migrations, API, renderer e responsivo públicos não foram
alterados nesta revisão. Sem merge, repair, migration remota ou writes remotos.
