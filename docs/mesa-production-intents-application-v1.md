# Intenções da Mesa — integração da aplicação

Checkpoint a partir de `99dd1b6c8371d0e585e48f24e02fb848390be579` no PR #333.
Não aplicar migrações nem integrar o PR antes de completar seleção e navegador.
A nova preparação ainda NÃO está ativada na faixa de seleção ou na página do Tema.

## Implementado neste checkpoint

- Validação própria de `productionIntents`: pedido, contextos, snapshots, artigos
  efetivamente publicados, slots, IDs e totais. Conserva o JSON exato da autoridade
  SQL; não reutiliza o contrato antigo de continuidade de um único Tema.
- Pacote, leitura, edição, transferência e resposta conservam esse contrato.
  O texto usa o leitor existente, com slots e fontes autorizadas por contexto.
  Artigos anteriores sem revisão pedida ficam como referência; não recebem slots.
- Workspace protege identidade, quantidade e contexto. A gravação em lote valida
  todos os outputs antes da primeira escrita. A fonte independente não recebe
  referências publicadas pertencentes a outro contexto.
- Publicação encaminhada para o RPC de intents, incluindo UPDATE com jornada nula.
  O finalizador lê o envelope real `{result:{action,updatedCount,newCount,noChangeCount}}`.
  Retry usa o payload guardado e volta a passar pela verificação SQL, sem reescrever
  uma edição manual entretanto. Ciclos parciais não criam recibos de conclusão.
- Serviço de leitura dos recibos e comparação por Tema/artigo. NEW não revê os
  anteriores. A apresentação desses recibos na página do Tema ainda falta ligar.

## Testes reproduzíveis

`.ci/mesa-intents-sql/application.mjs` executa módulos reais da aplicação: preparação,
criação/leitura do pacote, transferência, leitor de texto, API de publicação, SQL e
recibos. Um adaptador restrito traduz pedidos PostgREST sintéticos para PostgreSQL
17.6 descartável. Qualquer URL externa é recusada. `offline.py` bloqueia também
sockets IPv4/IPv6, incluindo subprocessos; a base usa apenas socket Unix local ou
Docker sem rede. Não existe chamada a IA ou recolha dos sites das fontes.

Os dez percursos locais passaram: Milan/Amorim + Pote; apenas SEM ALTERAÇÃO; NEW
sem revisão seguido de revisão posterior; revisão com UPDATE/SEM ALTERAÇÃO e novos;
Tema sem publicados/rascunho; Tema adiado; recuperação de publicação parcial; edição
manual entretanto; rejeição de fontes/contratos adulterados; vários Temas com pedido
não ordenado. O SQL existente foi repetido: 38 grupos aprovados. Há 26 novos testes
do contrato, transferência e guardas do workspace. A confirmação final é o CI do
commit guardado, não apenas este registo local.

O workflow `mesa-intents-application.yml` guarda o commit ensaiado, os relatórios e
um arquivo do código. A espera de PostgreSQL confirma o processo PID1 definitivo,
não apenas o servidor temporário do init, que podia encerrar entre duas sondagens.

## Limites e trabalho pendente

Estes ensaios NÃO são testes de navegador nem de autenticação/middleware HTTP.
A entrada nas posições físicas de Últimas é uma fronteira simulada observável,
com falha injetável. O writer e o finalizador SQL são reais. A suite SQL anterior
mantém os próprios testes e limites de sincronização V15.

Falta ligar a faixa de seleção e o percurso do Tema à preparação nova, apresentar
os recibos na continuidade e testar no navegador todos os modos, associação sem
produzir, Tema sozinho, restauro/gravação do workspace e erros sem perder seleção.
Depois: validação final, autorização delimitada das migrações, aplicação, merge e
deployment. Não houve nova migração, consulta à produção, alteração de Home,
páginas públicas, estilos ou cartões aprovados neste checkpoint.
