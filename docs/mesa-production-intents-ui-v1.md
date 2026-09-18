# Mesa: seleção e entrada na Produção

Esta etapa liga a faixa de seleção e o retorno do Tema à preparação transacional
já existente. O PR #333 continua em rascunho: ainda não é autorização para aplicar
migrações nem certificação do percurso completo de publicação pelo navegador.

## Implementação

`MesaIntentPreparationClient` apresenta os três modos apenas quando a leitura de
servidor confirma publicados. Rascunhos não habilitam revisão. Fontes soltas exigem
destino explícito; incorporação não aumenta automaticamente o número de novos.
A preparação usa as capturas mais recentes já guardadas, sem recolher sites.

A rota administrativa `/mesa/preparar` mantém os percursos anteriores e acrescenta
GET por Tema e POST opt-in (`mesaVersion: 4`). O preview compara o conjunto de
publicados mostrado ao editor. A gravação volta à autoridade SQL. Erros mantêm as
escolhas; a chave/fingerprint da tentativa ficam em sessionStorage para recuperar
uma resposta perdida depois do commit sem duplicar a Produção. Só o trabalho
confirmado é retirado da seleção e do estado React; o adiado permanece.

A página do Tema reutiliza as mesmas escolhas. Os recibos são apresentados por
artigo: sem recibo verificável não se declara SEM ALTERAÇÃO, e NEW não marca os
artigos anteriores como revistos. A região nova tem deslocamento próprio; o botão
PREPARAR PRODUÇÃO fica fora dessa região. Os ficheiros CSS e cartões não mudam.

## Ensaios reproduzíveis

`.ci/mesa-intents-ui/browser.py` usa Chromium/Playwright, os componentes reais da
seleção e do Tema, os handlers reais de preparação/organização e PostgreSQL 17.6
descartável. O transporte HTTP é IPC, com lista fechada de rotas e SQL real;
nenhum servidor, autenticação ou base de produção é usado. `offline.py` bloqueia
sockets IPv4/IPv6 no processo e nos filhos.

Os 14 casos cobrem os três modos, Tema sozinho, Tema sem publicados, rascunho,
fonte independente, adiamento de Tema/fonte, incorporação parcial, associação sem
produzir, erro por publicados entretanto alterados, seleção preservada, resposta
perdida após gravação e repetição, e NEW sem revisão seguido de revisão posterior.
Há 13 testes puros novos para as escolhas/recibos/seleção e regressões existentes.

O workflow permanente `mesa-intents-application.yml` executa estes ensaios. O CI
usa um documento virtual de loopback e sessionStorage/crypto nativos. Recusa uma
prova com `--document-only`: essa opção é apenas para ensaio local em navegadores
administrados que impedem navegação, simulando armazenamento/UUID explicitamente.
O artefacto inclui relatório, screenshots e código do commit ensaiado.

## Limites — não declarar o circuito inteiro concluído

O router Next é uma fronteira explícita: verifica-se o endereço do workspace
pedido, não a renderização da página de destino. O pacote, retorno e publicação
usados para preparar o cenário de recibos passam pelos módulos/handler reais já
ensaiados, mas não são operados pelos controlos visuais de publicação nesta suite.
Autenticação/middleware e posições físicas de Últimas continuam fora desta prova.
Falta percorrer visualmente workspace → pacote → retorno → publicação, revalidar
as restantes fronteiras e obter autorização das migrações antes de integrar.
