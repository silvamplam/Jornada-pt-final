import type { ReactNode } from "react";

import EditorialHorizontalNewsSourceSelect from "./EditorialHorizontalNewsSourceSelect";

export type EditorialHorizontalNewsAdminItem = {
  id: string;
  sortOrder: number;
  label: string | null;
  labelColor: string | null;
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  status: string | null;
};

export type EditorialHorizontalNewsSourceOption = {
  key: string;
  optionLabel: string;
  label: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
};

type HiddenField = {
  name: string;
  value: string;
};

const styles = `
  .horizontal-news-admin {
    display: grid;
    gap: 12px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #dce3eb;
  }

  .horizontal-news-admin header,
  .horizontal-news-admin header h4,
  .horizontal-news-admin header p {
    margin: 0;
  }

  .horizontal-news-admin header {
    display: grid;
    gap: 5px;
  }

  .horizontal-news-admin header h4 {
    font-size: 15px;
  }

  .horizontal-news-admin header p,
  .horizontal-news-admin-table,
  .horizontal-news-admin-note {
    color: #607086;
    font-size: 12px;
    line-height: 1.4;
  }

  .horizontal-news-admin-list {
    display: grid;
    gap: 8px;
  }

  .horizontal-news-admin-item {
    overflow: hidden;
    border: 1px solid #dce3eb;
    border-radius: 7px;
    background: #ffffff;
  }

  .horizontal-news-admin-item summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 11px 12px;
    cursor: pointer;
    list-style: none;
  }

  .horizontal-news-admin-item summary::-webkit-details-marker {
    display: none;
  }

  .horizontal-news-admin-item summary strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .horizontal-news-admin-status {
    color: #607086;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .horizontal-news-admin-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    padding: 12px;
    border-top: 1px solid #e5eaf0;
    background: #f8fafc;
  }

  .horizontal-news-admin-field {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .horizontal-news-admin-field.is-wide {
    grid-column: 1 / -1;
  }

  .horizontal-news-admin-field span {
    color: #354154;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .horizontal-news-admin-field input,
  .horizontal-news-admin-field select,
  .horizontal-news-admin-field textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 36px;
    border: 1px solid #cdd6e1;
    border-radius: 5px;
    background: #ffffff;
    color: #10151b;
    font: inherit;
    font-size: 12px;
  }

  .horizontal-news-admin-field textarea {
    min-height: 72px;
    resize: vertical;
  }

  .horizontal-news-admin-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    grid-column: 1 / -1;
  }

  .horizontal-news-admin-actions > div {
    display: flex;
    gap: 8px;
  }

  .horizontal-news-admin-actions button {
    padding: 9px 12px;
    border: 0;
    border-radius: 5px;
    background: #e5252a;
    color: #ffffff;
    font: inherit;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    cursor: pointer;
  }

  .horizontal-news-admin-actions button.secondary {
    border: 1px solid #cdd6e1;
    background: #ffffff;
    color: #354154;
  }

  @media (max-width: 720px) {
    .horizontal-news-admin-fields {
      grid-template-columns: 1fr;
    }

    .horizontal-news-admin-field.is-wide {
      grid-column: auto;
    }
  }
`;

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export default function EditorialHorizontalNewsEditor({
  id,
  title = "Faixa horizontal de noticias",
  description,
  tableName,
  items,
  orders,
  sources,
  formIdForOrder,
  hiddenFieldsForOrder,
  messageForOrder,
  openOrder
}: {
  id: string;
  title?: string;
  description: string;
  tableName: string;
  items: EditorialHorizontalNewsAdminItem[];
  orders: number[];
  sources: EditorialHorizontalNewsSourceOption[];
  formIdForOrder: (order: number) => string;
  hiddenFieldsForOrder: (order: number, item: EditorialHorizontalNewsAdminItem | null) => HiddenField[];
  messageForOrder?: (order: number) => ReactNode;
  openOrder?: number | null;
}) {
  return (
    <section className="horizontal-news-admin" id={id}>
      <style>{styles}</style>
      <header>
        <h4>{title}</h4>
        <p>{description}</p>
        <small className="horizontal-news-admin-table">{tableName}</small>
      </header>
      <div className="horizontal-news-admin-list">
        {orders.map((order) => {
          const item = items.find((candidate) => candidate.sortOrder === order) ?? null;
          const formId = formIdForOrder(order);
          const titleText = clean(item?.title) || "Rascunho vazio";

          return (
            <details
              className="horizontal-news-admin-item"
              data-horizontal-news-card
              id={`${id}-item-${String(order).padStart(2, "0")}`}
              key={order}
              open={openOrder === order}
            >
              <summary>
                <strong>#{String(order).padStart(2, "0")} - {titleText}</strong>
                <span className="horizontal-news-admin-status">
                  {item?.status === "published" ? "Publicado" : "Rascunho"}
                </span>
              </summary>
              <div className="horizontal-news-admin-fields">
                {hiddenFieldsForOrder(order, item).map((field) => (
                  <input form={formId} type="hidden" name={field.name} value={field.value} key={field.name} />
                ))}
                <input form={formId} type="hidden" name="horizontal_news_id" value={item?.id ?? ""} />
                <input form={formId} type="hidden" name="horizontal_news_sort_order" value={order} />
                <label className="horizontal-news-admin-field is-wide">
                  <span>Preencher com fonte publicada</span>
                  <EditorialHorizontalNewsSourceSelect sources={sources} />
                </label>
                <label className="horizontal-news-admin-field">
                  <span>Posicao</span>
                  <input value={order} readOnly aria-label={`Posicao ${order}`} />
                </label>
                <label className="horizontal-news-admin-field">
                  <span>Estado</span>
                  <select form={formId} name="horizontal_news_status" defaultValue={item?.status === "published" ? "published" : "draft"}>
                    <option value="draft">Rascunho</option>
                    <option value="published">Publicado</option>
                  </select>
                </label>
                <label className="horizontal-news-admin-field">
                  <span>Antetitulo</span>
                  <input form={formId} data-horizontal-news-field="label" name="horizontal_news_label" defaultValue={item?.label ?? ""} />
                </label>
                <label className="horizontal-news-admin-field">
                  <span>Cor do antetitulo</span>
                  <input
                    form={formId}
                    name="horizontal_news_label_color"
                    defaultValue={item?.labelColor ?? ""}
                    placeholder="#c40000"
                    pattern="^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$"
                  />
                </label>
                <label className="horizontal-news-admin-field is-wide">
                  <span>Titulo</span>
                  <input form={formId} data-horizontal-news-field="title" name="horizontal_news_title" defaultValue={item?.title ?? ""} />
                </label>
                <label className="horizontal-news-admin-field is-wide">
                  <span>Subtitulo / resumo</span>
                  <textarea form={formId} data-horizontal-news-field="subtitle" name="horizontal_news_subtitle" defaultValue={item?.subtitle ?? ""} />
                </label>
                <label className="horizontal-news-admin-field is-wide">
                  <span>Imagem</span>
                  <input form={formId} data-horizontal-news-field="image_url" name="horizontal_news_image_url" type="url" defaultValue={item?.imageUrl ?? ""} />
                </label>
                <label className="horizontal-news-admin-field is-wide">
                  <span>Link</span>
                  <input form={formId} data-horizontal-news-field="link_url" name="horizontal_news_link_url" defaultValue={item?.linkUrl ?? ""} />
                </label>
                {messageForOrder ? <div className="horizontal-news-admin-field is-wide">{messageForOrder(order)}</div> : null}
                <div className="horizontal-news-admin-actions">
                  <small className="horizontal-news-admin-note">Os itens novos sao acrescentados no fim. A grelha publica apresenta cinco noticias por linha.</small>
                  <div>
                    {item ? (
                      <button className="secondary" form={formId} name="horizontal_news_delete" value="1" type="submit">
                        Eliminar item
                      </button>
                    ) : null}
                    <button form={formId} type="submit">Guardar item #{String(order).padStart(2, "0")}</button>
                  </div>
                </div>
              </div>
            </details>
          );
        })}
      </div>
</section>
  );
}
