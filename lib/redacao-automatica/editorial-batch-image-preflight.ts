export const EDITORIAL_BATCH_IMAGE_ACCEPT =
  "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

export type EditorialBatchImageFile = Readonly<{
  name: string;
  type: string;
  size: number;
}>;

export type EditorialBatchImageFileProblemCode =
  | "invalid_prefix"
  | "unsupported_format"
  | "unknown_article";

export type EditorialBatchImageFileProblem<
  TFile extends EditorialBatchImageFile = EditorialBatchImageFile,
> = Readonly<{
  code: EditorialBatchImageFileProblemCode;
  file: TFile;
  key?: string;
  message: string;
}>;

export type EditorialBatchImageArticleStatus =
  | "associated"
  | "missing"
  | "duplicate";

export type EditorialBatchImageArticleResult<
  TFile extends EditorialBatchImageFile = EditorialBatchImageFile,
> = Readonly<{
  key: string;
  status: EditorialBatchImageArticleStatus;
  file: TFile | null;
  candidates: readonly TFile[];
  message: string;
}>;

export type EditorialBatchImagePreflight<
  TFile extends EditorialBatchImageFile = EditorialBatchImageFile,
> = Readonly<{
  selected: number;
  associated: number;
  missing: number;
  problems: number;
  ready: boolean;
  articles: readonly EditorialBatchImageArticleResult<TFile>[];
  fileProblems: readonly EditorialBatchImageFileProblem<TFile>[];
}>;

const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const SUPPORTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const OFFICIAL_ARTICLE_KEY = /^(?:0[1-9]|[12]\d|30)$/;
const FILE_PREFIX = /^(\d{2})-/;

function compareText(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareFiles(left: EditorialBatchImageFile, right: EditorialBatchImageFile) {
  return compareText(left.name, right.name)
    || compareText(left.type, right.type)
    || left.size - right.size;
}

function supportedImage(file: EditorialBatchImageFile) {
  const mime = file.type.trim().toLowerCase();
  if (mime) {
    return SUPPORTED_MIME_TYPES.has(mime);
  }

  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase() ?? "";
  return SUPPORTED_EXTENSIONS.has(extension);
}

function duplicateMessage(key: string, count: number) {
  return count === 2
    ? `DUAS IMAGENS COM O PREFIXO ${key}`
    : `${count} IMAGENS COM O PREFIXO ${key}`;
}

export function preflightEditorialBatchImages<
  TFile extends EditorialBatchImageFile,
>(
  articleKeys: readonly string[],
  inputFiles: readonly TFile[],
): EditorialBatchImagePreflight<TFile> {
  const files = [...inputFiles].sort(compareFiles);
  const keys = [...new Set(articleKeys)];
  const matchableKeys = new Set(keys.filter((key) => OFFICIAL_ARTICLE_KEY.test(key)));
  const candidatesByKey = new Map<string, TFile[]>();
  const fileProblems: EditorialBatchImageFileProblem<TFile>[] = [];

  for (const file of files) {
    const prefixMatch = FILE_PREFIX.exec(file.name);
    const key = prefixMatch?.[1];
    const formatSupported = supportedImage(file);

    if (!key) {
      fileProblems.push({
        code: "invalid_prefix",
        file,
        message: "PREFIXO EM FALTA OU INVÁLIDO",
      });
    }

    if (!formatSupported) {
      fileProblems.push({
        code: "unsupported_format",
        file,
        ...(key ? { key } : {}),
        message: "FORMATO NÃO SUPORTADO",
      });
    }

    if (key && !matchableKeys.has(key)) {
      fileProblems.push({
        code: "unknown_article",
        file,
        key,
        message: `NÃO EXISTE ARTIGO ${key}`,
      });
    }

    if (!key || !formatSupported || !matchableKeys.has(key)) {
      continue;
    }

    const candidates = candidatesByKey.get(key) ?? [];
    candidates.push(file);
    candidatesByKey.set(key, candidates);
  }

  const articles: EditorialBatchImageArticleResult<TFile>[] = keys.map((key) => {
    const candidates = candidatesByKey.get(key) ?? [];

    if (candidates.length === 1) {
      return {
        key,
        status: "associated",
        file: candidates[0],
        candidates,
        message: "IMAGEM ASSOCIADA",
      };
    }

    if (candidates.length > 1) {
      return {
        key,
        status: "duplicate",
        file: null,
        candidates,
        message: duplicateMessage(key, candidates.length),
      };
    }

    return {
      key,
      status: "missing",
      file: null,
      candidates,
      message: "IMAGEM EM FALTA",
    };
  });

  const associated = articles.filter((article) => article.status === "associated").length;
  const missing = articles.filter((article) => article.status === "missing").length;
  const duplicateProblems = articles.filter((article) => article.status === "duplicate").length;
  const problems = fileProblems.length + duplicateProblems;

  return {
    selected: files.length,
    associated,
    missing,
    problems,
    ready: keys.length > 0
      && associated === keys.length
      && missing === 0
      && problems === 0,
    articles,
    fileProblems,
  };
}
