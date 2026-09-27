# Reconciliação de migrations — resultado final

Branch: `jornada-supabase-migration-history-reconciliation-20260927`.
Base Git: `a4da9d88174694b61d9b149b960c8a1f8b517dd8`.
Projeto de comparação, exclusivamente read-only: `mztkeurmeadwbgebmuvv`.

## Cadeia reconstruída

149 migrations: 143 recuperadas integralmente do histórico remoto, 5 local-only
conservadas e 1 corretiva explícita de v18 para o replay. As 143 incluem os 74
timestamps alinhados (42 E / 29 S / 3 D), as 10 remote-only e as 59 identidades
já coincidentes. Cada decisão, filename antigo e checksum consta de
[manifest.json](manifest.json) e [decisions.json](decisions.json).

Nenhuma migration histórica foi modificada para satisfazer representação textual
de testes. Os elementos de `statements[]` permanecem exatos; só foram acrescentados
delimitadores entre elementos quando necessários. Comentários persistidos,
incluindo a codificação observada remotamente, foram preservados.

## Replay e primeiras falhas

**PASSOU: 149/149**, num PostgreSQL **17.6** novo, com Supabase CLI **2.117.0**.
[Execução integral verificada](https://github.com/silvamplam/Jornada-pt-final/actions/runs/36327203323),
commit executável `3030a2af32ad07f82abb2914af9b06d554b055f8`.
A baseline e todo o código de replay deste resultado estão nesse commit;
os commits posteriores de fecho acrescentam apenas evidência/documentação.

Cada tentativa criou um cluster novo e parou na primeira falha de migration.
[attempts.json](attempts.json) regista todas as tentativas, incluindo falhas de
preparação, primeiro erro SQL e correção. A primeira falha SQL foi a inclusão
indevida de um constraint trigger no CREATE TABLE da baseline. Corrigiram-se
também dependências de funções/CHECK, um índice pertencente a uma constraint
posterior e uma constraint original substituída pela migration de fontes manuais.

A baseline final contém 47 tabelas e 24 funções de fundação; as proveniências
estão em [baseline-provenance.json](baseline-provenance.json).
É um snapshot de dependências, **não uma migration histórica fictícia**.

Duas pré-condições históricas ficam explícitas no harness:
- a reparação `20260901214531` exige exatamente uma transição existente:
  fixture inteiramente sintética, removida imediatamente após a reparação;
- v28 exige espaços específicos no corpo de v18: preparação estritamente
  textual, com tokens SQL idênticos, antes de executar o patch original de v28.

Não se saltou qualquer migration. Não foram copiados dados editoriais reais.
A rede do cluster é desativada e os cron jobs não são executados. O Vault
está vazio, apenas com a extensão necessária. O primeiro probe do CLI por
`supabase_migrations.schema_migrations`, antes de criar essa tabela, é uma
consulta de bootstrap tratada pelo CLI; não é uma falha de migration.

A [lista isolada](isolated-migration-list.txt) contém 149 versões alinhadas.
O [dry-run isolado](isolated-dry-run.txt) respondeu
`Remote database is up to date`.

## Comparação com produção

**Zero diferenças nos 438 objetos comparados: 115 tabelas e 323 funções**,
além dos schemas e cron jobs. Foram comparados colunas, tipos, defaults,
constraints, índices, triggers, RLS/policies, assinaturas, definições, owners,
grants, security mode, search_path e comentários persistidos.

[Comparação final](final-comparison.json) e [catálogo do replay](replay-catalog.json).
A comparação inicial completa também está preservada, sem esconder diferenças:
[first-complete-replay-comparison.json](first-complete-replay-comparison.json).
As diferenças de grants/comentários de três funções foram resolvidas recuperando
a fundação dos steps 113/117; CREATE OR REPLACE conserva esses metadados em produção.

Há **30 tabelas e 32 funções fora das dependências da cadeia**, explicitamente
inventariadas. Não se afirma paridade de toda a aplicação nessas superfícies.
A baseline mantém-se mínima; não replica módulos independentes só para aumentar
a contagem de objetos comparados.

A nova leitura de produção confirmou catálogo idêntico ao snapshot inicial e
as mesmas 143 identidades/checksums de histórico:
[production-recheck.json](production-recheck.json) e
[final-read-only-history.json](final-read-only-history.json).

## v17/v27 e v18

v17 conserva o remoto histórico. v27 encontra os seus dois padrões e executa
a correção original; a proteção `no-change` permanece. Tanto o wrapper v17
como a implementação final têm definições byte-for-byte iguais às de produção.

O v18 histórico conserva apenas o que consta do remoto. As validações atuais
não explicadas por migrations posteriores ficam na migration nova
`20260927134943_replay_preserve_production_carryover_v18_validations.sql`.
As duas funções resultantes são byte-for-byte iguais às de produção, incluindo
a regra de roundup introduzida por v28. A migration tem guarda de ambiente e
**não deve executar em produção**, que já possui essas definições.

## Decisão final sobre as cinco local-only

| Versão | Decisão | Evidência |
|---|---|---|
| 20260815230610 | Marcar applied, mediante autorização | Tabela/control e dois RPCs presentes; estado final igual ao replay |
| 20260816094000 | Marcar applied, mediante autorização | Três RPCs v2 presentes e iguais ao resultado final da cadeia |
| 20260816160000 | Marcar applied, mediante autorização | Coluna/default/NOT NULL/comentário iguais; zero adiados sem exclusão |
| 20260921122500 | Marcar applied, mediante autorização | Job automático de vídeos ausente nos dois ambientes |
| 20260922002000 | Marcar applied, mediante autorização | Job automático do feed ausente nos dois ambientes |

Estas decisões reconciliam o **estado instalado**, sem afirmar que existe prova
da data original de execução ou do instante do backfill. Não se reexecuta DML.

## Lista exata e mínima de repairs futuros

São **seis applied**, incluindo a corretiva v18; **zero reverted**.
Não há repair para os 74 renomes, para as 10 recuperadas, para a baseline
ou para as pré-condições do harness. [Plano detalhado](repair-plan.json).

Com o projeto ligado confirmado como `mztkeurmeadwbgebmuvv`, e **só depois de
autorização explícita**, os comandos seriam:

```text
supabase migration repair 20260815230610 --status applied --linked
supabase migration repair 20260816094000 --status applied --linked
supabase migration repair 20260816160000 --status applied --linked
supabase migration repair 20260921122500 --status applied --linked
supabase migration repair 20260922002000 --status applied --linked
supabase migration repair 20260927134943 --status applied --linked
```

Nenhum desses comandos foi executado. Se o histórico/schema entretanto mudar,
é necessário rever o preflight antes de executar qualquer repair.

## Testes e âmbito do diff

- 62 ficheiros focados: **600 passaram / 614**.
- As 14 falhas foram reproduzidas na base: 11 asserções antigas de UI/API e
  3 guardas de working tree de outros trabalhos. Não foram enfraquecidas.
- Nenhuma falha funcional nova; adaptações limitadas a filenames, delimitadores,
  espaços/comentários e separação entre histórico v18 e corretiva final.
- Integridade do histórico, v17/v27, guarda de v18, isolamento e equivalência
  textual de v28: **7/7 passaram**.
- TypeScript em 912 ficheiros versionados: **zero diagnósticos**.
- `git diff --check`: passou.

A lista dos testes, comandos e classificação de falhas está em
[test-classification.json](test-classification.json).
O diff contém migrations, referências em testes/scripts/docs, helper de testes,
harness/workflow de replay e evidência. Não altera código funcional da aplicação.

## Limites e ponto de paragem

O bootstrap de raiz exige a baseline e o harness documentados; um reset apenas
com a pasta de migrations não reproduz as pré-condições históricas.
A comparação cobre a cadeia e as suas dependências, não os 62 objetos excluídos,
dados editoriais, Auth completo ou toda a configuração da plataforma Supabase.

Produção permaneceu read-only. Não houve repair, db push de produção, DDL/DML
remoto ou merge. O [gate global posterior](GLOBAL-SUITE-GATE.md) confirmou ausência
de regressões novas. Antes de qualquer repair, é necessário tratar PR/merge,
confirmar main e repetir o preflight read-only de produção. Só então poderá
ser autorizada a execução dos seis repairs de histórico acima.
