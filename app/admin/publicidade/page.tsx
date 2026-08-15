import { readPrimarySideAdvertisement } from "@/lib/site-advertising";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{
    saved?: string;
    error?: string;
  }>;
};

const styles = `
  body {
    margin: 0;
    background: #eef2f6;
  }

  .campaign-admin-shell {
    min-height: 100vh;
    box-sizing: border-box;
    padding: 28px;
    background: #eef2f6;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  .campaign-header,
  .campaign-panel {
    width: min(920px, 100%);
    box-sizing: border-box;
    margin-right: auto;
    margin-left: auto;
  }

  .campaign-header {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    align-items: flex-end;
    padding: 24px;
    border-radius: 8px;
    background: #10151b;
    color: #ffffff;
  }

  .campaign-header h1,
  .campaign-header p {
    margin: 0;
  }

  .campaign-header h1 {
    margin-top: 6px;
    font-size: 34px;
  }

  .campaign-header p {
    color: #cbd3dd;
    line-height: 1.4;
  }

  .campaign-header a {
    flex: 0 0 auto;
    color: #ffffff;
    font-size: 12px;
    font-weight: 900;
    text-decoration: none;
  }

  .campaign-panel {
    margin-top: 18px;
    padding: 24px;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(12, 22, 34, 0.07);
  }

  .campaign-form {
    display: grid;
    gap: 18px;
  }

  .campaign-field {
    display: grid;
    gap: 7px;
  }

  .campaign-field > span,
  .campaign-preview > strong {
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .campaign-field input[type="text"],
  .campaign-field input[type="url"],
  .campaign-field input[type="file"] {
    width: 100%;
    box-sizing: border-box;
    padding: 11px 12px;
    border: 1px solid #ccd5df;
    border-radius: 5px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
  }

  .campaign-file-help,
  .campaign-note {
    margin: 0;
    color: #657181;
    font-size: 13px;
    line-height: 1.45;
  }

  .campaign-preview {
    display: grid;
    gap: 8px;
  }

  .campaign-preview img {
    display: block;
    width: min(320px, 100%);
    height: auto;
  }

  .campaign-active {
    display: flex;
    gap: 8px;
    align-items: center;
    font-weight: 800;
  }

  .campaign-save {
    width: fit-content;
    padding: 12px 16px;
    border: 0;
    border-radius: 5px;
    background: #e5252a;
    color: #ffffff;
    font: inherit;
    font-size: 12px;
    font-weight: 900;
    cursor: pointer;
  }

  .campaign-message {
    margin: 0 0 18px;
    padding: 12px 14px;
    border-radius: 5px;
    background: #eef7ee;
    color: #24532a;
    font-weight: 800;
  }

  .campaign-message.warning {
    background: #fff6df;
    color: #654912;
  }

  .campaign-message.error {
    background: #fff0f0;
    color: #8e1820;
  }

  @media (max-width: 700px) {
    .campaign-admin-shell {
      padding: 14px;
    }

    .campaign-header {
      display: grid;
    }
  }
`;

function errorMessage(code?: string) {
  if (!code) return null;

  const messages: Record<string, string> = {
    "missing-image":
      "Uma publicidade ativa precisa de uma imagem.",
    "missing-target":
      "Uma publicidade ativa precisa de um link.",
    "invalid-image":
      "O endereço da imagem é inválido.",
    "invalid-target":
      "O link de destino é inválido.",
    "invalid-image-format":
      "A imagem deve ser JPG, PNG, WebP ou AVIF.",
    "image-too-large":
      "A imagem é demasiado grande.",
    "upload-failed":
      "Não foi possível carregar a nova imagem.",
    "missing-table":
      "A tabela de publicidade ainda não está disponível.",
    "save-failed":
      "Não foi possível guardar a publicidade.",
  };

  return messages[code] ?? messages["save-failed"];
}

export default async function AdvertisingPage({
  searchParams,
}: Props) {
  const params = searchParams ? await searchParams : {};
  const result = await readPrimarySideAdvertisement();
  const ad = result.advertisement;
  const error = errorMessage(params.error);

  return (
    <main className="campaign-admin-shell">
      <style>{styles}</style>

      <header className="campaign-header">
        <div>
          <p>Jornada.pt</p>
          <h1>Publicidade</h1>
          <p>
            Uma única campanha para a Jornada e para as notícias.
          </p>
        </div>

        <a href="/admin">VOLTAR AO BACKOFFICE</a>
      </header>

      <section className="campaign-panel">
        {params.saved ? (
          <p className="campaign-message">
            Publicidade guardada nos dois locais.
          </p>
        ) : null}

        {!result.storageReady ? (
          <p className="campaign-message warning">
            Não foi possível ler imediatamente a configuração.
            A campanha atual foi usada como fallback.
          </p>
        ) : null}

        {error ? (
          <p className="campaign-message error">{error}</p>
        ) : null}

        <p className="campaign-note">
          Alteras aqui uma vez. A mesma campanha aparece ao lado das
          Últimas e na lateral dos artigos.
        </p>

        <form
          className="campaign-form"
          action="/api/admin/publicidade"
          method="post"
          encType="multipart/form-data"
        >
          <label className="campaign-field">
            <span>Nome / campanha</span>
            <input
              type="text"
              name="name"
              defaultValue={ad.name}
            />
          </label>

          <label className="campaign-field">
            <span>Imagem atual / URL</span>
            <input
              type="text"
              name="image_url"
              defaultValue={ad.imageUrl}
            />
          </label>

          <label className="campaign-field">
            <span>Carregar nova imagem</span>
            <input
              type="file"
              name="image_file"
              accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
            />
            <span className="campaign-file-help">
              Se escolheres um ficheiro, ele substitui o URL da imagem
              quando guardares.
            </span>
          </label>

          {ad.imageUrl ? (
            <div className="campaign-preview">
              <strong>Imagem atual</strong>
              <img src={ad.imageUrl} alt="" />
            </div>
          ) : null}

          <label className="campaign-field">
            <span>Link de destino</span>
            <input
              type="text"
              name="target_url"
              defaultValue={ad.targetUrl}
            />
          </label>

          <label className="campaign-field">
            <span>Texto alternativo</span>
            <input
              type="text"
              name="alt_text"
              defaultValue={ad.altText}
            />
          </label>

          <label className="campaign-active">
            <input
              type="checkbox"
              name="is_active"
              value="true"
              defaultChecked={ad.isActive}
            />
            Publicidade ativa
          </label>

          <button className="campaign-save" type="submit">
            GUARDAR PUBLICIDADE
          </button>
        </form>
      </section>
    </main>
  );
}