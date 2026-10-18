# BB — correção dirigida ao comando «Colocar»

Base: R12.12.2BA-P0-EXPERIMENTAL.1. Versão local produzida: R12.12.2BB-P0-EXPERIMENTAL.1.

Esta alteração elimina a atualização integral de mercados e a recombinação da aposta inicial no momento de «Colocar». O programa deve usar o plano inicial previamente calculado e passar diretamente à abertura do guia; a extensão continua a verificar as seleções e as odds reais no boletim.

O módulo de cálculo, a base SQLite e o ledger mantêm-se inalterados. A extensão Firefox 0.3.3 também.

Testes locais: 55 testes Python; verificações JavaScript de navegação, arranque, receção de recibos e concorrência de estado. O teste real autenticado da Betclic não foi executado.

**Estado:** alteração local validada parcialmente. Não representa validação do reconhecimento causal de recibos, nem resolve comprovadamente todos os bloqueios da BA. Não usar com dinheiro real.

**Pendente:** importar a implementação integral revista (com inspeção de dados privados), validar extensão/Motor no Firefox e verificar a transição da primeira confirmação para o ledger.

Não integrar esta branch em main (Jornada).
