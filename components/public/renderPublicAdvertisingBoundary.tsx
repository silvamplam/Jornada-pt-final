import { Fragment, isValidElement, type ReactNode } from "react";

/** Presentation only: never inserts an advertising item into the editorial collection. */
export function renderPublicAdvertisingBoundary<Block extends { kind: string }>(
  blocks: readonly Block[],
  renderBlock: (block: Block) => ReactNode,
  advertisement: ReactNode,
  startsAfterNews = false,
) {
  let previousWasNews = startsAfterNews;
  let inserted = false;
  return blocks.map((block, index) => {
    const content = renderBlock(block);
    if (content === null || content === undefined || content === false)
      return null;
    const insertHere =
      Boolean(advertisement) &&
      !inserted &&
      previousWasNews &&
      block.kind === "video";
    previousWasNews = block.kind !== "video";
    if (insertHere) inserted = true;
    return (
      <Fragment key={isValidElement(content) ? content.key ?? index : index}>
        {insertHere ? advertisement : null}
        {content}
      </Fragment>
    );
  });
}
