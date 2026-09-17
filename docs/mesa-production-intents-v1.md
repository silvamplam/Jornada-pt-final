# Mesa: decisões de produção por contexto — fundação

Estado: primeira parte do lote 1, ainda não integrada na aplicação.
Base verificada: `6367ed98d6062dfaf5516904e214a4b6acbd03be`.
Branch: `jornada-mesa-producao-intencoes-continuidade-v2-20260917`.

## O que está implementado aqui

`newsroom-mesa-production-intents.ts` resolve pedidos editoriais a partir de uma
leitura autoritativa fornecida pelo servidor. Não acede a serviços externos e não
escreve fontes, associações, artigos ou estado de produção.

- Um Tema com artigos Jornada efetivamente publicados aceita revisão com zero
  novos, revisão com novos, ou apenas novos sem revisão.
- Um Tema sem publicados apenas pode produzir novos. A futura interface não
  apresenta o controlo de revisão nesse caso.
- Cada fonte selecionada tem um destino explícito: incorporar num Tema ativo,
  produção independente ou deixar para depois. A seleção, por si só, não associa.
- Cada Tema pode ser explicitamente adiado, sem bloquear fontes independentes.
- Fontes novas não criam automaticamente um artigo novo por fonte.
- Todos os artigos publicados continuam como referência no seu próprio contexto.
  Apenas os contextos com revisão pedida criam slots `EXISTING_*`.
- A preparação usa a captura utilizável mais recente **já guardada**, fornecida
  pela autoridade. Não afirma recolher novamente a página de origem.
- Um contexto só fornece fontes aos seus próprios outputs. Duas relações já
  existentes podem partilhar a mesma fonte física sem fundir os contextos.
- A revisão simultânea do mesmo artigo por dois Temas é rejeitada explicitamente.
- Os limites existentes são 20 contextos, 20 fontes distintas e 30 outputs no
  conjunto. Não se truncam fontes, histórico ou revisões para caber nesses limites.
- `matchdayId: null` é preservado, não transformado numa jornada artificial.

O módulo também valida um conjunto completo de decisões de publicação, usando
identidades obtidas pelo servidor. UPDATE preserva o artigo, o slug e a jornada;
SEM ALTERAÇÃO não materializa um artigo; NEW não substitui um artigo anterior.

## Referência de revisão por artigo

A projeção recebe recibos imutáveis de capturas por `(Tema, artigo)`:

- UPDATE e SEM ALTERAÇÃO registam a captura efetivamente revista desse artigo.
- NEW estabelece a captura de origem do artigo que acaba de ser criado, não a
  captura dos artigos anteriores do Tema.
- Artigos apenas de referência não recebem recibo de revisão.
- Publicação incompleta não produz recibos de ciclo concluído.
- Uma produção antiga concluída mais tarde não faz recuar a referência de revisão.
- Histórico ausente ou duas capturas divergentes com a mesma data dão `UNKNOWN`,
  nunca um falso `UNCHANGED_SOURCE`.

Isto é uma projeção testada em memória. **Ainda não existe writer SQL nem tabela
nova aplicada por este trabalho.** Os recibos não são prova de uma publicação
real enquanto não forem produzidos por uma autoridade transacional da aplicação.

## Identidade e atualidade

`mesaProductionIntentAuthorityMaterial` produz o material canónico para um hash
calculado no servidor. Inclui decisões, contexto, versões exatas das fontes e
fingerprints do conteúdo completo dos artigos publicados. Não inclui apenas o
instante da releitura; uma releitura da mesma matéria não deve criar conflito.

Os adaptadores devem normalizar timestamps para UTC ISO com milissegundos e
validar as respostas de I/O antes de construir os tipos `*Authority`.

O hash fornecido pelo navegador nunca substitui uma releitura/validação no
servidor. A comparação final e as escritas de associação/preparação devem ocorrer
na mesma transação. Repetições da mesma chave têm de recuperar o resultado já
persistido, sem duplicar contextos, fontes, planos ou associações.

## Trabalho seguinte — não concluído neste commit

1. Autoridade de leitura/preparação SQL e persistência dos recibos, com testes
   num PostgreSQL descartável, sem consultar a Supabase de produção. Manter as
   autoridades antigas para produções e pacotes V1 já existentes. Não tratar um
   fecho genérico ou uma publicação NEW como revisão dos artigos antigos.
2. Associar IDs reais de contexto e Article Plan aos slots do plano. A transação
   deve validar intenções, fontes, capturas e alvos publicados; a interface nunca
   escolhe diretamente os alvos de UPDATE.
3. Ligar as escolhas à faixa de seleção da Mesa. Não mudar cartões, cores,
   tipografia ou dimensões que já foram aprovados. Ocultar revisão nos Temas sem
   artigos publicados. Mostrar erros junto do contexto e preservar a seleção.
4. Propagar o contrato do plano por workspace, pacote editorial, retorno do
   texto e publicação. Artigos de referência e fontes não atravessam contextos.
   Validar de novo fingerprints antes de atualizar um artigo editado entretanto.
5. Executar testes SQL, integração e navegador dos percursos completos,
   incluindo publicação parcial, repetição, conflitos e recuperação.
6. Só depois delimitar/aprovar a migração, integrar e confirmar o deployment.

As rotas `/mesa/preparar`, `/mesa/tema-continuity`, a página de Produção, os
contratos antigos e a publicação em lote **não são alterados nesta etapa**.
A falha que o utilizador encontra no site não está corrigida só com esta fundação.
Este trabalho deve permanecer numa branch/PR em rascunho até à integração completa.

## Testes executáveis

`newsroom-mesa-production-intents.test.ts` contém 57 testes de comportamento,
incluindo uma matriz de 72 combinações de contagem, revisão e destino.
Não são verificações por expressões regulares sobre o código da implementação.

A sequência crítica é: publicar um novo sem revisão, mantendo fontes alteradas;
verificar que o artigo antigo continua com alterações por rever; só avançar a sua
referência depois de uma revisão explícita e concluída desse artigo.

Com Node 24 e dependências instaladas:

```sh
node node_modules/tsx/dist/cli.mjs --test \
  lib/redacao-automatica/newsroom-mesa-production-intents.test.ts
```

A suite focada inclui também continuidade V1, preparação 2C, organização,
parser e transferência de publicação em lote, para verificar compatibilidade.
