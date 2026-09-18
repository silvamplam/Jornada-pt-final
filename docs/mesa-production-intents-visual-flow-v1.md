# Mesa: percurso visual de Produção e publicação

O teste `.ci/mesa-intents-ui/flow-browser.py` prolonga a seleção até à publicação.
Carrega o resultado das funções reais das páginas de Produção e Publicação em lote,
renderiza os componentes reais e opera Guardar artigos e imagens, Copiar pacote,
entrada do texto devolvido, seleção da jornada dos NEW e publicação.

Os handlers de preparação, workspace, pacote e publicação são os da aplicação.
As leituras, planos, pacote, artigos, finalização e recibos usam PostgreSQL 17.6
local/descartável. O runner anterior de preparação/publicação tem de ter passado
primeiro. Não são chamadas fontes externas, IA, Supabase ou páginas de produção.

## Casos

1. Milan/Amorim publicado + Pote independente: UPDATE com jornada nula e NEW.
2. Ciclo só SEM ALTERAÇÃO: nenhum artigo reescrito.
3. NEW sem revisão; regressar ao Tema; confirmar o antigo não revisto; rever ambos.
4. UPDATE + SEM ALTERAÇÃO + dois NEW no mesmo Tema.
5. UPDATE sozinho, preservando a jornada nula do alvo.
6. Edição manual após preflight: publicação recusada, texto devolvido preservado.

## Fronteiras e prova

As funções de página são executadas sem o transporte Next/RSC. O resultado é
serializado preservando os componentes cliente e reconstruído no navegador.
Não se está a certificar SSR/hidratação ou autenticação/middleware com esta suite.
O código desses mecanismos não é alterado. O transporte HTTP/PostgREST usa IPC
com rotas e tabelas autorizadas; os handlers e SQL não são substituídos.
Os bytes das imagens sintéticas e o documento final de regresso à Mesa são
substitutos declarados. A colocação física em Últimas continua a usar a fronteira
observável da suite da aplicação; este teste não a apresenta como validada.

O CI executa sem `--document-only`, com sessionStorage, clipboard e navegação
final nativos. Verifica as marcas no relatório e inclui o código do commit no
artefacto existente. O modo `--document-only` serve apenas ao diagnóstico local
quando o Chromium administrado bloqueia navegação. Substitui explicitamente
armazenamento, clipboard e as duas transições de location.assign; o relatório
regista as três capacidades como não nativas. Não é aceite como prova CI.

Os erros e resultados locais não certificam um commit. Confirmar o workflow e
o SHA guardado no artefacto antes de atualizar o estado de conclusão do PR.
A migração de produção continua a exigir autorização; não houve aplicação.
