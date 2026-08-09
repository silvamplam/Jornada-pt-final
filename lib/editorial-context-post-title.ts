export const EDITORIAL_CONTEXT_DESTINATION = "context" as const;
export const EDITORIAL_CONTEXT_DESTINATION_LABEL = "CONTEXTO";

export type EditorialContextDestination = typeof EDITORIAL_CONTEXT_DESTINATION;

export const EDITORIAL_CONTEXT_POST_TITLE_MIN_CHARS = 420;
export const EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS = 500;

export function normalizeEditorialContextDestination(
  value: string | null | undefined,
): EditorialContextDestination | null {
  const normalized = value
    ?.trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  return normalized === EDITORIAL_CONTEXT_DESTINATION_LABEL
    ? EDITORIAL_CONTEXT_DESTINATION
    : null;
}

export const EDITORIAL_CONTEXT_POST_TITLE_PROMPT_RULE =
  `Só quando o editor indicar explicitamente que este artigo se destina à zona editorial Contexto, o PÓS-TÍTULO deve procurar ficar entre ${EDITORIAL_CONTEXT_POST_TITLE_MIN_CHARS} e ${EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS} caracteres. Sempre que os factos o permitam, aproxima-te do limite superior para preencher a coluna até perto do limite visual inferior do Contexto. Nunca ultrapasses ${EDITORIAL_CONTEXT_POST_TITLE_MAX_CHARS} caracteres nesse caso. Se os factos disponíveis não permitirem atingir ${EDITORIAL_CONTEXT_POST_TITLE_MIN_CHARS} caracteres sem repetição ou informação não sustentada, escreve menos em vez de inventar ou encher texto. O limite visual da página continua soberano e corta apenas a apresentação se a geometria disponível for menor. Esta regra não se aplica aos restantes artigos.`;
