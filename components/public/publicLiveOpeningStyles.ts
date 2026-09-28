// Only the live opening opts in. Shared cards, Home and historical compositions
// retain their existing presentation and editorial fields.
const opening = '.public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-lead-grid[data-live-opening="true"]';
const balancedOpening = `${opening}[data-top-columns="2"][data-has-latest="false"][data-has-context="true"]`;

export const publicLiveOpeningStyles = `
  ${opening} .public-below-headline-highlights .public-cover-story-strip {
    gap: 28px;
  }

  ${opening} .public-below-headline-highlights .public-cover-story {
    grid-template-rows: auto auto;
    gap: 12px;
    align-content: start;
  }

  ${opening} .public-below-headline-highlights .public-cover-story strong {
    font-size: 17px;
    line-height: 1.25;
  }

  @media (min-width: 841px) {
    /* Reuse the space released by the three summaries inside the original
       opening footprint; long headlines can still grow naturally. */
    ${balancedOpening} {
      grid-template-columns: minmax(0, 1fr) 260px;
      column-gap: 32px;
    }

    ${balancedOpening} .public-matchday-main-column {
      gap: 32px;
    }

    ${balancedOpening} .public-cover-headline {
      grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
      gap: 28px;
      min-height: 415px;
      padding-bottom: 24px;
    }

    ${balancedOpening} .public-cover-headline-copy,
    ${balancedOpening} .public-cover-headline-copy-link {
      gap: 14px;
    }

    ${balancedOpening} .public-cover-headline p {
      display: block;
      -webkit-line-clamp: unset;
      line-height: 1.5;
    }

    ${balancedOpening} .public-editorial-main-image {
      height: 312px;
      max-height: none;
    }

    ${balancedOpening} > .public-side-editorial-block {
      padding-left: 0;
      grid-template-rows: minmax(0, 1fr);
      align-content: stretch;
    }

    ${balancedOpening} > .public-side-editorial-block .public-side-editorial-inner:has(> .public-side-editorial-image) {
      height: auto;
      min-height: 0;
      align-self: stretch;
      grid-template-rows: minmax(0, 1fr) auto;
      align-content: stretch;
      gap: 14px;
    }

    ${balancedOpening} > .public-side-editorial-block .public-side-editorial-inner:has(> .public-side-editorial-image) > .public-side-editorial-image {
      height: 100%;
      min-height: 0;
      aspect-ratio: auto;
    }
  }

  @media (min-width: 1181px) {
    ${balancedOpening} {
      grid-template-columns: minmax(0, 1fr) 310px;
      column-gap: 48px;
    }

    ${balancedOpening} .public-cover-headline {
      grid-template-columns: minmax(0, 0.76fr) minmax(0, 1.24fr);
      gap: 32px;
      min-height: 348px;
      padding-bottom: 16px;
    }

    ${balancedOpening} .public-matchday-main-column {
      gap: 24px;
    }
  }

  @media (max-width: 760px) {
    /* Keep the existing reading order and landscape highlight images. The
       side story gets the portrait framing used by the desktop composition. */
    ${opening} {
      row-gap: 32px;
    }

    ${opening} .public-matchday-main-column {
      gap: 32px;
    }

    ${opening} .public-cover-headline {
      gap: 28px;
      padding-bottom: 28px;
    }

    ${opening} .public-cover-headline-copy,
    ${opening} .public-cover-headline-copy-link {
      gap: 16px;
    }

    ${opening} .public-cover-headline p {
      line-height: 1.6;
    }

    ${opening} .public-below-headline-highlights .public-cover-story-strip {
      gap: 32px;
    }

    ${opening} .public-below-headline-highlights .public-cover-story {
      gap: 14px;
      padding-bottom: 32px;
    }

    ${opening} .public-below-headline-highlights .public-cover-story:last-child {
      padding-bottom: 0;
    }

    ${opening} .public-below-headline-highlights .public-cover-story strong {
      font-size: 21px;
    }

    ${opening} > .public-side-editorial-block .public-side-editorial-image {
      aspect-ratio: 4 / 5;
    }

    ${opening} > .public-side-editorial-block .public-side-editorial-inner {
      gap: 14px;
    }
  }
`;
