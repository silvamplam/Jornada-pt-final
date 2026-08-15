import AdvertisingImageUpload from "./AdvertisingImageUpload";

import { readPrimarySideAdvertisement } from "@/lib/site-advertising";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{
    saved?: string;
    error?: string;
  }>;
};

const styles = `
  body { margin: 0; background: #eef2f6; }

  .ad-admin {
    min-height: 100vh;
    padding: 28px;
    box-sizing: border-box;
    font-family: Arial, Helvetica, sans-serif;
    color: #10151b;
  }

  .ad-header,
  .ad-panel {
    width: min(920px, 100%);
    box-sizing: border-box;
    margin: 0 auto;
  }

  .ad-header {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    align-items: end;
    padding: 24px;
    border-radius: 8px;
    background: #10151b;
    color: white;
  }

  .ad-header h1 { margin: 4px 0 0; }
  .ad-header p { margin: 0; color: #cbd3dd; }

  .ad-header a {
    color: white;
    text-decoration: none;
    font-size: 12px;
    font-weight: 900;
  }

  .ad-panel {
    margin-top: 18px;
    padding: 24px;
    border: 1px solid #dce3eb;
    border-radius: 8px;
    background: white;
  }

  .ad-form,
  .ad-field,
  .ad-image-manager,
  .ad-preview {
    display: grid;
    gap: 8px;
  }

  .ad-form { gap: 18px; }

  .ad-field span,
  .ad-preview strong {
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .ad-field input[type="text"] {
    box-sizing: border-box;
    width: 100%;
    padding: 11px;
    border: 1px solid #ccd5df;
    border-radius: 5px;
    font: inherit;
  }

  .ad-upload {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px;
    border: 1px dashed #c6d0db;
    background: #f8fafc;
  }

  .ad-upload button,
  .ad-save {
    padding: 10px 14px;
    border: 0;
    border-radius: 5px;
    background: #10151b;
    color: white;
    font-weight: 900;
    cursor: pointer;
  }

  .ad-save {
    width: fit-content;
    background: #e5252a;
  }

  .ad-status,
  .ad-note {
    margin: 0;
    color: #657181;
    font-size: 13px;
  }

  .ad-preview img {
    display: block;
    width: min(320px, 100%);
    height: auto;
  }

  .ad-active {
    display: flex;
    gap: 8px;
    align-items: center;
    font-weight: 800;
  }

  .ad-message {
    padding: 12px;
    border-radius: 5px;
    background: #eef7ee;
    color: #24532a;
  }

  .ad-message.warning {
    background: #fff6df;
    color: #654912;
  }

  .ad-message.error {
    background: #fff0f0;
    color: #8e1820;
  }
`;

function errorMessage(code?: string) {
  const messages: Record<string, string> = {
    "missing-table":
      "A tabela de publicidade ainda não está instalada no Supabase.",
    "missing-image":
      "Uma publicidade ativa precisa de imagem.",
    "missing-target":
      "Uma publicidade ativa precisa de link.",
    "invalid-image":
      "O endereço da imagem é inválido.",
    "invalid-target":
      "O link de destino é inválido.",
    "save-failed":
      "Não foi possível guardar a publicidade.",
  };

  return code ? messages[code] ?? messages["save-failed"] : null;
}

export default async function AdvertisingPage({
  searchParams,
}: Props) {
  const params = searchParams ? await searchParams : {};
  const result = await readPrimarySideAdvertisement();
  const ad = result.advertisement;
  const error = errorMessage(params.error);

  return (
    <main className="ad-admin">
      <style>{styles}</style>

      <header className="ad-header">
        <div>
          <p>Jornada.pt</p>
          <h1>Publicidade</h1>
          <p>
            Uma única campanha para a Jornada e para as notícias.
          </p>
        </div>

        <a href="/admin">VOLTAR AO BACKOFFICE</a>
      </header>

      <section className="ad-panel">
        {params.saved ? (
          <p className="ad-message">
            Publicidade guardada nos dois locais.
          </p>
        ) : null}

        {!result.storageReady ? (
          <p className="ad-message warning">
            A persistência ainda não está disponível. A Startup Madeira
            continua como fallback.
          </p>
        ) : null}

        {error ? (
          <p className="ad-message error">{error}</p>
        ) : null}

        <p className="ad-note">
          Alteras aqui uma vez. A mesma campanha aparece ao lado das
          Últimas e na lateral dos artigos.
        </p>

        <form
          className="ad-form"
          action="/api/admin/publicidade"
          method="post"
        >
          <label className="ad-field">
            <span>Nome / campanha</span>
            <input
              type="text"
              name="name"
              defaultValue={ad.name}
            />
          </label>

          <AdvertisingImageUpload
            initialImageUrl={ad.imageUrl}
          />

          <label className="ad-field">
            <span>Link de destino</span>
            <input
              type="text"
              name="target_url"
              defaultValue={ad.targetUrl}
            />
          </label>

          <label className="ad-field">
            <span>Texto alternativo</span>
            <input
              type="text"
              name="alt_text"
              defaultValue={ad.altText}
            />
          </label>

          <label className="ad-active">
            <input
              type="checkbox"
              name="is_active"
              value="true"
              defaultChecked={ad.isActive}
            />
            Publicidade ativa
          </label>

          <button className="ad-save" type="submit">
            GUARDAR PUBLICIDADE
          </button>
        </form>
      </section>
    </main>
  );
}