# Motor de Apostas | ramo de desenvolvimento

Este diretório identifica o projeto **Motor de Apostas**, independente da aplicação editorial Jornada.

## Situação em 18 de outubro de 2026

- A branch `motor-de-apostas` foi criada a partir de `main`.
- A implementação do Motor e da extensão Firefox **ainda não foi importada**.
- As versões anteriores AX e AO são apenas material de referência. A experiência BA foi abandonada como base operacional.
- A validação ponta a ponta de seleção, confirmação humana, recibo real e registo no ledger **não está concluída**.
- Não usar esta branch para apostas reais.

## Separação e publicação

O código do Motor, quando preparado para publicação, ficará exclusivamente neste diretório; a extensão Firefox deverá ficar num subdiretório próprio.

**Atenção:** o repositório `silvamplam/Jornada-pt-final` é público. Não adicionar bases de dados, recibos pessoais, credenciais, ficheiros `.env`, estados locais, backups nem qualquer conteúdo confidencial.

Não integrar automaticamente esta branch em `main`. A presença nesta branch não representa uma versão instalada ou operacional.

## Critério funcional para a futura implementação

O comando «Colocar» deve abrir de imediato a Betclic e selecionar os mercados. Nunca introduzir montante nem confirmar a aposta automaticamente. O único momento em que dados financeiros passam a ser factos no ledger é o reconhecimento inequívoco de um recibo de aposta aceite, com referência única, montante real e odd aceite. Ausência de recibo não é prova de ausência de aposta. O processo deve permitir esclarecer dúvidas reais sem criar apostas fictícias ou duplicadas.

O guia técnico completo e o código devem ser avaliados separadamente antes de qualquer publicação no repositório público.
