# Gate global antes de PR/merge e de qualquer repair

Resultado: **sem regressões novas face a main**. A suite global continua com
65 falhas pré-existentes; não se apresenta esse resultado como uma suite verde.

Branch: `jornada-supabase-migration-history-reconciliation-20260927`.
Main/base confirmado por fetch: `a4da9d88174694b61d9b149b960c8a1f8b517dd8`.
HEAD inicial: `fa88596e9d2db8f1383aaf3aef87f169d2f29030`.
Commit com as correções testadas: `82f460dc36fec601254ea64b565de00ef9bc97f6`.

| Execução | Ficheiros | Total | Aprovados | Falhados | Ignorados |
|---|---:|---:|---:|---:|---:|
| main/base | 352 | 3.398 | 3.328 | 65 | 5 |
| branch antes das correções deste gate | 353 | 3.405 | 3.331 | 69 | 5 |
| branch depois das correções | 353 | 3.405 | 3.335 | 65 | 5 |

Não houve testes cancelados. Os sete testes adicionais da branch pertencem à
reconciliação e passaram. Um teste de continuidade já tinha sido renomeado na
etapa anterior; passa em ambas as versões e está mapeado no relatório.

## Método e comparação

Foram usados dois checkouts detached limpos, Node 24.19.0, as mesmas dependências
e concorrência 4. A branch principal permaneceu no checkout original. Não foram
criadas branches adicionais nem copiados ficheiros de ambiente de produção.
Os ficheiros locais não versionados do utilizador foram preservados.

Todos os ficheiros de teste versionados foram enumerados, incluindo TSX, a
função Supabase e os testes de reconciliação. O equivalente em PowerShell é:

```powershell
$testFiles = git ls-files | Where-Object { $_ -match '\.(?:test|spec)\.[cm]?[jt]sx?$' }
node --import tsx --test --test-concurrency=4 @testFiles
```

O reporter usado capturou nomes, ficheiros, estados e detalhes de cada falha.
As **65 falhas finais correspondem uma a uma às de main**, com detalhes completos
iguais após normalizar apenas o caminho do checkout e posições de stack trace.
Os respetivos nomes, causas e hashes estão em [global-suite-gate.json](global-suite-gate.json),
assim como a lista completa dos 353 ficheiros e os cinco skips originais.

Uma das falhas pré-existentes é o carregamento de
`editorial-historical-inherited-news-integration.test.ts`, que referencia uma
migration inexistente já em main. Não foi corrigida neste trabalho. Também não
foram alteradas as outras falhas antigas de UI/API, snapshots ou configuração.

## Quatro falhas novas encontradas e corrigidas

1. `v16 confines automatic positional distribution to pre-cutover matchdays`:
   procurava comentários de secção ausentes do SQL remoto recuperado.
2. `v16 physical OCC and tracking ignore residual automatic state`:
   mesma dependência de comentários como limites da função.
3. `Mesa v2 publication keeps workspace compatibility and enforces context scope when opted in`:
   exigia espaços específicos junto de `=` e de uma vírgula.
4. `consolidation preserves old engines and links outputs from Theme contexts without closing Themes`:
   exigia um espaço depois da vírgula da lista `('workspace','context')`.

Classificação: **testes de representação textual obsoletos**, sem regressão
funcional SQL. A comparação lexical provou igualdade integral dos 3.797 tokens
de v16 e dos 10.485 tokens da migration Mesa 2C entre main e a branch.

Alteraram-se apenas dois ficheiros de teste, nove linhas adicionadas e nove
removidas. Em v16, os limites passaram a ser declarações SQL adjacentes. Na
Mesa 2C, três regexes passaram a tolerar espaços opcionais, conservando os
identificadores, operadores e valores literais exigidos. Todas as outras
asserções de contrato foram mantidas. Os 18 testes desses ficheiros passaram,
seguidos de nova execução da suite global completa.

## Restantes confirmações

- Replay do HEAD inicial: **149/149**, PostgreSQL 17.6, sem erros de migration.
  [Execução verificada](https://github.com/silvamplam/Jornada-pt-final/actions/runs/36327646690).
- Comparação do replay: **zero diferenças** nos 438 objetos abrangidos.
- Nenhuma migration, baseline, script ou workflow de replay mudou neste gate;
  isso foi verificado com `git diff --exit-code` contra o HEAD inicial.
- TypeScript depois das correções: **912 ficheiros, zero diagnósticos**.
- `git diff --check origin/main`: **passou**.

## Ponto de paragem

Não houve acesso de escrita a produção, migration repair, db push de produção,
PR ou merge neste gate. A confirmação externa das 143 entradas remotas e da
ausência das seis versões foi recebida do utilizador, sem executar novo
preflight de produção nesta etapa.

O próximo passo é tratar PR/merge e confirmar main. Só depois se faz um novo
preflight read-only de produção e, mediante autorização, os seis repairs já
enumerados em `repair-plan.json`. **Nenhum repair antes do merge.**
