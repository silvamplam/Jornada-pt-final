export const publicTopNavigationStyles = `
  .public-matchday-shell,
  .news-article-shell {
    --public-top-gutter: 24px;
  }

  .public-top-stack {
    position: sticky;
    top: 0;
    z-index: 20;
    margin: 0 calc(-1 * var(--public-top-gutter));
    padding: 0 var(--public-top-gutter);
    border-bottom: 1px solid #c8ccd0;
    background: #ffffff;
  }

  .public-site-topbar {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 20px;
    align-items: center;
    min-width: 0;
    min-height: 52px;
    max-width: none;
    margin: 0 auto;
    border-bottom: 1px solid #d8dbde;
  }

  .public-site-brand {
    display: inline-flex;
    align-items: baseline;
    gap: 2px;
    color: #202428;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 29px;
    font-weight: 900;
    line-height: 1;
    letter-spacing: -0.035em;
    text-decoration: none;
    white-space: nowrap;
  }

  .public-site-brand span {
    color: #6b7076;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .public-site-menu,
  .public-site-actions {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .public-site-menu {
    overflow-x: auto;
    text-transform: uppercase;
  }

  .public-site-actions {
    justify-content: flex-end;
  }

  .public-site-menu a,
  .public-site-actions a {
    color: #202428;
    text-decoration: none;
  }

  .public-site-menu a[aria-current="page"] {
    color: #b51220;
  }

  .public-site-search {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    padding-right: 14px;
    border-right: 1px solid #d8dbde;
    color: #777c82;
    font-size: 11px;
    font-weight: 400;
  }

  .public-site-search::before {
    content: "";
    width: 14px;
    height: 14px;
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M10.5 18a7.5 7.5 0 1 1 5.3-12.8 7.5 7.5 0 0 1-5.3 12.8Zm5.7-1.8 4.1 4.1' fill='none' stroke='%236b7076' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") center / contain no-repeat;
  }

  .public-home-games-transition-bar {
    height: 2px;
    max-width: none;
    margin: -1px calc(-1 * var(--public-top-gutter)) 0;
    background: #25292d;
  }

  .public-season-nav-bar {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #202428;
  }

  .public-season-nav-inner {
    box-sizing: border-box;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr) max-content;
    align-items: center;
    gap: 12px;
    min-width: 0;
    min-height: 40px;
    max-width: none;
    margin: 0 auto;
  }

  .public-hidden-heading {
    display: none;
  }

  .public-season-context-card {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .public-season-label,
  .public-season-select-wrap {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 7px;
    min-height: 30px;
    color: #71767c;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.035em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .public-season-select {
    width: auto;
    min-width: 82px;
    padding: 4px 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: #202428;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0;
    cursor: pointer;
  }

  .public-season-select option {
    background: #ffffff;
    color: #202428;
  }

  .public-matchday-leg-nav,
  .public-matchday-nav,
  .public-matchday-nav-compact {
    display: flex;
    align-items: stretch;
    min-width: 0;
    margin: 0;
    padding: 0;
    white-space: nowrap;
  }

  .public-matchday-leg-nav {
    flex-shrink: 0;
    padding-left: 6px;
    border-left: 1px solid #d8dbde;
  }

  .public-matchday-nav,
  .public-matchday-nav-compact {
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: #c8ccd0 transparent;
    overscroll-behavior-inline: contain;
  }

  .public-matchday-leg-nav a,
  .public-matchday-nav a,
  .public-matchday-nav span,
  .public-matchday-nav-compact a {
    box-sizing: border-box;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    min-height: 39px;
    padding: 2px 6px 0;
    border-bottom: 2px solid transparent;
    color: #666d75;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    text-decoration: none;
  }

  .public-matchday-leg-nav a {
    min-height: 30px;
    padding-right: 7px;
    padding-left: 7px;
    font-size: 10px;
  }

  .public-matchday-leg-nav a[aria-current="true"],
  .public-matchday-nav a[aria-current="page"],
  .public-matchday-nav-compact a[aria-current="page"] {
    border-bottom-color: var(--public-season-accent, #b51220);
    color: #202428;
    font-weight: 800;
  }

  .public-matchday-leg-nav a:hover,
  .public-matchday-nav a:hover,
  .public-matchday-nav-compact a:hover {
    color: #202428;
    background: #f4f4f3;
  }

  .public-top-stack a:focus-visible,
  .public-season-select:focus-visible {
    outline: 2px solid #202428;
    outline-offset: -2px;
  }

  .public-matchday-date-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
    padding-left: 12px;
    border-left: 1px solid #d8dbde;
  }

  .public-matchday-date-context {
    color: #747a81;
    font-size: 10px;
    font-weight: 400;
    line-height: 1.3;
    white-space: nowrap;
  }

  .public-matchday-date-context strong {
    color: #50575f;
    font-weight: 600;
  }

  .public-league-match-strip-scroll {
    width: 100%;
    max-width: 1232px;
    margin: 0 auto;
  }

  @media (max-width: 1180px) {
    .public-site-topbar {
      gap: 14px;
    }

    .public-site-actions {
      gap: 10px;
    }
  }

  @media (max-width: 980px) {
    .public-site-search {
      display: none;
    }

    .public-season-nav-inner {
      grid-template-columns: minmax(0, 1fr) max-content;
      gap: 0 12px;
    }

    .public-season-context-card {
      min-height: 39px;
    }

    .public-matchday-nav,
    .public-matchday-nav-compact {
      grid-column: 1 / -1;
      grid-row: 2;
      border-top: 1px solid #e7e8e9;
    }

    .public-matchday-date-row {
      grid-column: 2;
      grid-row: 1;
    }
  }

  @media (max-width: 900px) {
    .news-article-shell {
      --public-top-gutter: 14px;
    }
  }

  @media (max-width: 760px) {
    .public-matchday-shell {
      --public-top-gutter: 16px;
    }

    .public-site-topbar {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0 12px;
      padding-top: 10px;
    }

    .public-site-brand {
      font-size: 27px;
    }

    .public-site-topbar > nav {
      grid-column: 1 / -1;
      grid-row: 2;
      margin-top: 5px;
    }

    .public-site-actions {
      grid-column: 2;
      grid-row: 1;
    }
  }

  @media (max-width: 620px) {
    .public-season-nav-inner {
      grid-template-columns: minmax(0, 1fr);
    }

    .public-season-context-card {
      gap: 10px;
    }

    .public-matchday-date-row {
      grid-column: 1;
      grid-row: 3;
      justify-content: flex-start;
      min-height: 24px;
      padding: 0;
      border-left: 0;
    }

    .public-matchday-date-context {
      white-space: normal;
    }
  }
`;

export const publicEditorialStyles = `
  ${publicTopNavigationStyles}

  body {
    margin: 0;
    overflow-x: hidden;
    background: #ffffff;
    color: #10151b;
    font-family: Arial, Helvetica, sans-serif;
  }

  .public-matchday-shell {
    min-height: 100vh;
    padding: 0 24px 28px;
  }

  .public-home-editorial-region {
    --public-home-editorial-max-width: 1200px;
    width: min(100%, var(--public-home-editorial-max-width));
    max-width: var(--public-home-editorial-max-width);
    min-width: 0;
    margin: 0 auto;
  }

  .public-home-editorial-region > .public-matchday-panel {
    width: 100%;
    max-width: none;
  }

  .public-home-editorial-region > .public-matchday-panel[aria-label="Capa da jornada"] {
    max-width: none;
  }

  .public-home-editorial-region :where(article, aside, section, div, ul, li) {
    min-width: 0;
  }

  .public-home-editorial-region :where(h1, h2, h3, h4, p, strong, a, span, time, small) {
    overflow-wrap: break-word;
  }

  .public-home-editorial-region :where(img, iframe, video) {
    max-width: 100%;
  }

  .public-matchday-hero,
  .public-matchday-panel {
    border: 1px solid #dde4ec;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 14px 28px rgba(12, 22, 34, 0.08);
  }

  .public-matchday-hero {
    display: none;
  }

  .public-matchday-hero p,
  .public-matchday-hero h1 {
    margin: 0;
  }

  .public-matchday-hero p {
    color: #e5252a;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-matchday-hero h1 {
    margin-top: 6px;
    font-size: 34px;
    line-height: 1;
  }

  .public-matchday-hero span {
    display: block;
    margin-top: 8px;
    color: #526174;
    font-size: 15px;
  }

  .public-matchday-panel {
    max-width: 1512px;
    margin-left: auto;
    margin-right: auto;
    margin-top: 12px;
    overflow: hidden;
  }

  #classificacao {
    scroll-margin-top: 140px;
  }

  .public-matchday-scoreboard-panel + .public-matchday-panel {
    margin-top: 4px;
  }

  .public-matchday-panel[aria-label="Capa da jornada"] {
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    overflow: visible;
    max-width: 1512px;
    width: 100%;
  }

  .public-matchday-panel header {
    padding: 18px 20px;
    border-bottom: 1px solid #e6ebf1;
    background: #f8fafc;
  }

  .public-matchday-panel h2,
  .public-matchday-panel h3,
  .public-matchday-panel p {
    margin: 0;
  }

  .public-matchday-panel h2 {
    font-size: 24px;
    text-transform: uppercase;
  }

  .public-matchday-panel p {
    margin-top: 6px;
    color: #607086;
  }

  .public-matchday-list {
    display: grid;
    gap: 18px;
    padding: 20px;
  }

  .home-live-pulse-dots {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-left: 5px;
    vertical-align: middle;
  }

  .home-live-pulse-dots span {
    width: 4px;
    height: 4px;
    border-radius: 999px;
    background: #16a34a;
    opacity: 0.35;
    animation: home-live-dot-alternate 1.15s infinite ease-in-out;
  }

  .home-live-pulse-dots span:nth-child(2) {
    animation-delay: 0.55s;
  }

  .home-live-minute-prime {
    display: inline-block;
    color: inherit;
  }

  .home-live-minute-prime-active {
    animation: home-live-prime-pulse 1s infinite ease-in-out;
  }

  .public-matchday-live-label {
    color: #10151b;
  }

  .public-matchday-live-minute {
    color: #16a34a;
  }

  @keyframes home-live-dot-alternate {
    0%,
    100% {
      opacity: 0.35;
    }

    50% {
      opacity: 1;
    }
  }

  @keyframes home-live-prime-pulse {
    0%,
    100% {
      opacity: 0.35;
    }

    50% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .home-live-pulse-dots span {
      animation: none;
      opacity: 0.75;
      transform: none;
    }

    .home-live-minute-prime-active {
      animation: none;
      opacity: 1;
    }
  }

  .public-matchday-cover {
    --public-cover-rule-color: #10151b;
    --public-cover-rule-gap: 8px;
    --public-cover-rule-size: 4px;
    display: grid;
    gap: 20px;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    margin: 0 auto;
    padding: 18px 0 22px;
    align-items: start;
    min-height: 0;
  }

  .public-matchday-lead-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 235px) minmax(190px, 205px);
    grid-template-areas: "main latest context";
    column-gap: 20px;
    row-gap: 20px;
    align-items: stretch;
    min-width: 0;
  }

  .public-matchday-lead-grid > .public-matchday-main-column {
    grid-area: main;
  }

  .public-matchday-lead-grid > .public-matchday-news {
    grid-area: latest;
  }

  .public-matchday-lead-grid > .public-side-editorial-block {
    grid-area: context;
  }

  .public-matchday-depth-row {
    display: grid;
    grid-template-columns: minmax(0, 1.72fr) minmax(280px, 0.78fr);
    gap: 24px;
    align-items: start;
    min-width: 0;
    padding-top: 0;
    border-top: 1px solid #dbe4ee;
  }

  .public-matchday-depth-row-complement-only {
    grid-template-columns: minmax(0, 1fr);
  }

  .public-matchday-editorial,
  .public-matchday-feature,
  .public-matchday-main-column,
  .public-matchday-roundup,
  .public-matchday-cover-side,
  .public-matchday-news {
    display: grid;
    gap: 10px;
    align-content: start;
    min-width: 0;
    box-sizing: border-box;
    padding: 16px;
    border: 1px solid #dbe4ee;
    background: #ffffff;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.045);
  }

  .public-matchday-main-column {
    grid-area: main;
    gap: 20px;
    padding: 0;
    border: 0;
    grid-template-rows: auto;
  }

  .public-matchday-editorial {
    align-content: start;
    min-height: 0;
    padding: 0;
    border: 0;
  }

  .public-matchday-feature {
    grid-area: auto;
    padding: 0;
  }

  .public-matchday-lead-grid > .public-matchday-news,
  .public-matchday-lead-grid > .public-side-editorial-block {
    align-self: stretch;
    height: 100%;
    min-height: 100%;
    padding: 0 0 0 20px;
    border: 0;
    border-left: 1px solid #dbe4ee;
    background: transparent;
    box-shadow: none;
  }

  .public-matchday-lead-grid > .public-editorial-highlights-section,
  .public-matchday-depth-row > .public-matchday-cover-side {
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .public-side-editorial-block {
    color: #263241;
  }

  .public-context-title,
  .public-editorial-section-title {
    margin: 0;
    padding-top: 0;
    border-top: 0;
    color: #10151b;
    font-size: 14px;
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
  }

  .public-side-editorial-inner {
    display: grid;
    grid-template-columns: minmax(180px, 0.82fr) minmax(0, 1fr);
    gap: 12px;
    align-content: start;
    align-items: start;
    min-width: 0;
  }

  .public-matchday-lead-grid > .public-side-editorial-block .public-side-editorial-inner {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    min-height: 100%;
    align-content: start;
  }

  .public-matchday-lead-grid > .public-side-editorial-block .public-side-editorial-image {
    aspect-ratio: 4 / 3;
  }

  .public-side-editorial-image {
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 6px;
    background: #eef2f6;
  }

  .public-side-editorial-image img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .public-side-editorial-copy {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .public-side-editorial-label {
    color: #c40012;
    font-size: 10.5px;
    font-weight: 900;
    line-height: 1;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .public-side-editorial-copy strong {
    display: block;
    color: #10151b;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 16.5px;
    font-weight: 700;
    line-height: 1.18;
  }

  .public-side-editorial-copy small {
    color: #607086;
    font-size: 12px;
    font-weight: 800;
    line-height: 1.2;
  }

  .public-side-editorial-copy p {
    margin: 0;
    color: #526174;
    font-size: 13px;
    line-height: 1.48;
  }

  .public-matchday-lead-grid > .public-side-editorial-block .public-side-editorial-copy strong,
  .public-matchday-lead-grid > .public-side-editorial-block .public-side-editorial-copy p {
    overflow: visible;
  }

  .public-side-editorial-title-link {
    color: inherit;
    text-decoration: none;
  }

  .public-side-editorial-title-link:hover {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .public-side-editorial-block .public-editorial-more-link {
    justify-content: flex-start;
    gap: 6px;
    width: fit-content;
    margin-top: 2px;
    color: #263241;
    font-size: 10.5px;
    letter-spacing: 0.03em;
  }

  .public-side-editorial-placeholder {
    padding: 10px 0;
    color: #7a8796;
    font-size: 12px;
    font-weight: 800;
    line-height: 1.35;
  }

  .public-matchday-cover-side {
    min-height: 100%;
  }

  .public-matchday-news {
    grid-area: auto;
    min-height: 100%;
    padding: 0;
  }

  .public-matchday-editorial h1,
  .public-matchday-editorial h2,
  .public-cover-support h4,
  .public-matchday-roundup h3,
  .public-matchday-cover-side h3,
  .public-matchday-news h3 {
    margin: 0;
  }

  .public-matchday-editorial h1,
  .public-matchday-editorial h2 {
    overflow: visible;
    color: #c40012;
    font-family: Georgia, "Times New Roman", serif;
    max-width: 100%;
    font-size: clamp(30px, 1.9vw, 34px);
    line-height: 1.15;
    letter-spacing: -0.015em;
    text-transform: none;
  }

  .public-cover-headline {
    position: relative;
    display: grid;
    grid-template-columns: minmax(250px, 1fr) minmax(0, 420px);
    grid-template-areas: "copy media";
    gap: 18px;
    align-items: start;
    min-height: 285px;
    overflow: visible;
    padding: 0 0 10px;
    border-bottom: 1px solid #dfe5ec;
    background: #ffffff;
    color: #10151b;
  }

  .public-cover-headline::before {
    content: none;
  }

  .public-cover-headline > div {
    position: relative;
    z-index: 1;
  }

  .public-cover-headline-copy,
  .public-cover-headline-copy-link {
    grid-area: copy;
    display: grid;
    gap: 10px;
    align-content: start;
    min-width: 0;
  }

  .public-cover-headline-copy-link {
    color: inherit;
    text-decoration: none;
  }

  .public-editorial-main-image {
    grid-area: media;
    width: 100%;
    height: 300px;
    max-height: 300px;
    overflow: hidden;
    border-radius: 6px;
    background: #eef2f6;
  }

  .public-matchday-editorial h1 {
    display: block;
    -webkit-box-orient: initial;
    -webkit-line-clamp: unset;
    overflow: visible;
    text-overflow: clip;
    line-height: 1.15;
  }

  .public-cover-headline p {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 6;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .public-editorial-main-image img,
  .public-editorial-main-image iframe,
  .public-editorial-main-image video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .public-editorial-main-image iframe {
    border: 0;
    background: #0f141b;
  }

  .public-editorial-main-image video {
    background: #0f141b;
    object-fit: contain;
  }

  .public-cover-headline p {
    max-width: 100%;
    color: #526174;
    font-size: 15px;
    line-height: 1.4;
  }

  .public-matchday-main-lower {
    display: block;
    min-width: 0;
    padding: 0;
    border: 0;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) {
    --public-roundup-top-align: 0px;
    --public-roundup-scroll-control-height: 14px;
    --public-roundup-visible-list-height: 285px;
  }

  .public-roundup-video-layout {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: minmax(0, 340px) minmax(0, 1fr);
    justify-content: start;
    gap: 24px;
    align-items: stretch;
    width: 100%;
    min-width: 0;
  }

  .public-roundup-video-layout > .public-matchday-roundup {
    justify-self: start;
    width: min(100%, 340px);
    margin-right: 0;
    margin-left: 0;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup,
  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-roundup-video-panel {
    border: 0;
    background: transparent;
    height: 100%;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup {
    --public-roundup-visible-list-height: 285px;
    grid-column: 1;
    grid-row: 1;
    grid-template-rows: auto 1fr;
    align-content: stretch;
    justify-self: start;
    width: min(100%, 340px);
    margin-right: 0;
    margin-left: 0;
    padding: var(--public-roundup-top-align) 0 0 0;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-roundup-video-panel {
    grid-column: 2;
    grid-row: 1;
    justify-self: stretch;
    width: 100%;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-roundup-scroll-window {
    max-height: var(--public-roundup-visible-list-height);
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-roundup-scroll-frame {
    border-color: #edf2f7;
  }

  .public-editorial-flex-block {
    position: relative;
  }

  .public-cover-support h4,
  .public-editorial-block-head,
  .public-matchday-news h3 {
    padding-top: 0;
    border-top: 0;
  }

  .public-editorial-block-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .public-matchday-roundup .public-editorial-block-head {
    justify-content: flex-end;
  }

  .public-below-headline-highlights .public-editorial-block-head {
    justify-content: flex-start;
    padding: 0 0 8px;
    border-top: 0;
  }

  .public-editorial-highlights-section .public-editorial-block-head {
    padding-top: 0;
    border-top: 0;
  }

  .public-editorial-highlights-section .public-roundup-matchday-label {
    color: #10151b;
    font-size: 14px;
  }

  .public-matchday-depth-row .public-below-headline-side {
    display: grid;
    gap: 12px;
    align-content: start;
    min-height: 0;
  }

  .public-matchday-depth-row-complement-only .public-below-headline-side {
    max-width: 760px;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup .public-editorial-block-head {
    padding-top: 0;
    padding-right: 6px;
    padding-bottom: 1px;
    padding-left: 6px;
    border-top: 0;
    justify-content: flex-start;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-editorial-block-head .public-roundup-matchday-label {
    color: #263241;
    font-size: 10.5px;
  }

  .public-editorial-block-head h3,
  .public-matchday-roundup h3 {
    font-size: 14px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-editorial-block-head a,
  .public-editorial-block-head .public-roundup-matchday-label,
  .public-editorial-more-link {
    color: #003f8f;
    font-size: 11px;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
  }

  .public-matchday-feature {
    color: #263241;
  }

  .public-matchday-feature p {
    font-size: 13px;
  }

  .public-cover-support {
    display: grid;
    gap: 10px;
    align-content: start;
    height: auto;
    padding: 0;
    border: 0;
    background: #ffffff;
  }

  .public-cover-support h4 {
    margin: 0;
    padding-top: 0;
    border-top: 0;
    font-size: 13px;
    font-weight: 900;
    line-height: 1.05;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .public-cover-support p {
    margin: 0;
    color: #607086;
    font-size: 13px;
    line-height: 1.35;
  }

  .public-cover-story-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    padding-top: 4px;
  }

  .public-matchday-roundup .public-cover-story-strip {
    grid-template-columns: 1fr;
    gap: 0;
    padding-top: 0;
  }

  .public-matchday-roundup {
    --public-roundup-scroll-control-height: 14px;
    --public-roundup-visible-list-height: 224px;
  }

  .public-roundup-scroll-frame {
    position: relative;
    height: 100%;
    min-height: 0;
    overflow: visible;
    border-top: 1px solid #eef2f6;
    border-bottom: 1px solid #eef2f6;
  }

  .public-roundup-has-scroll .public-roundup-scroll-frame {
    display: block;
    height: var(--public-roundup-visible-list-height);
    max-height: var(--public-roundup-visible-list-height);
  }

  .public-roundup-has-scroll .public-roundup-scroll-frame::before,
  .public-roundup-has-scroll .public-roundup-scroll-frame::after {
    content: none;
    position: absolute;
    right: 0;
    left: 0;
    z-index: 1;
    height: 30px;
    pointer-events: none;
  }

  .public-roundup-has-scroll .public-roundup-scroll-frame::before {
    top: 0;
    background: linear-gradient(#ffffff, rgba(255, 255, 255, 0));
  }

  .public-roundup-has-scroll .public-roundup-scroll-frame::after {
    bottom: 0;
    background: linear-gradient(rgba(255, 255, 255, 0), #ffffff);
  }

  .public-matchday-roundup .public-roundup-scroll-window {
    height: 100%;
    max-height: var(--public-roundup-visible-list-height);
    overflow-y: auto;
    scroll-behavior: smooth;
    scrollbar-color: rgba(96, 112, 134, 0.32) transparent;
    scrollbar-width: thin;
  }

  .public-roundup-has-scroll .public-roundup-scroll-window {
    height: var(--public-roundup-visible-list-height);
    max-height: var(--public-roundup-visible-list-height);
    padding-right: 4px;
    box-sizing: border-box;
    scrollbar-gutter: stable;
  }

  .public-matchday-roundup .public-roundup-scroll-window::-webkit-scrollbar {
    width: 4px;
  }

  .public-matchday-roundup .public-roundup-scroll-window::-webkit-scrollbar-track {
    background: transparent;
  }

  .public-matchday-roundup .public-roundup-scroll-window::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: rgba(96, 112, 134, 0.28);
  }

  .public-roundup-scroll-button {
    position: absolute;
    right: 4px;
    left: 0;
    z-index: 2;
    display: grid;
    place-items: center;
    width: auto;
    height: var(--public-roundup-scroll-control-height);
    border: 0;
    border-radius: 0;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0), #f5f7fa 18%, #f5f7fa 82%, rgba(255, 255, 255, 0));
    color: #526174;
    font-size: 10px;
    font-weight: 900;
    line-height: 1;
    cursor: pointer;
    box-shadow: none;
  }

  .public-roundup-scroll-button-top {
    top: 0;
    border-bottom: 1px solid #edf2f7;
  }

  .public-roundup-scroll-button-bottom {
    bottom: 0;
    border-top: 1px solid #edf2f7;
  }

  .public-cover-story {
    display: grid;
    gap: 6px;
    align-content: start;
  }

  .public-matchday-roundup .public-cover-story {
    grid-template-columns: 44px minmax(0, 1fr) auto auto;
    gap: 2px 9px;
    align-items: center;
    box-sizing: border-box;
    min-height: 56px;
    padding: 5px 0;
    border-bottom: 1px solid #e6ebf1;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup .public-cover-story {
    min-height: calc(var(--public-roundup-visible-list-height) / 5);
    gap: 3px 14px;
    padding: 7px 6px;
    border-bottom-color: #edf2f7;
  }

  .public-roundup-has-scroll .public-cover-story {
    min-height: calc(var(--public-roundup-visible-list-height) / 5);
  }

  .public-matchday-roundup .public-highlight-image {
    position: relative;
    grid-column: 1 / 2;
    grid-row: 1 / 4;
    width: 44px;
    height: 44px;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    background: #eef2f6;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup .public-highlight-image {
    width: 48px;
    height: 48px;
    border-radius: 4px;
  }

  .public-matchday-roundup .public-highlight-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .public-below-headline-highlights .public-cover-story-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    padding-top: 0;
  }

  .public-below-headline-highlights .public-cover-story {
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto 1fr;
    gap: 7px;
    align-items: start;
    height: 100%;
    padding: 0;
    border-bottom: 0;
  }

  .public-matchday-lead-grid > .public-editorial-highlights-section .public-cover-story-strip {
    align-items: stretch;
  }

  .public-matchday-lead-grid > .public-editorial-highlights-section .public-cover-story strong,
  .public-matchday-lead-grid > .public-editorial-highlights-section .public-cover-story small {
    overflow: visible;
  }

  .public-below-headline-highlights .public-highlight-image {
    grid-column: auto;
    grid-row: auto;
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 9;
    border-radius: 4px;
  }

  .public-media-play {
    position: absolute;
    inset: 50% auto auto 50%;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.9);
    color: #10151b;
    font-size: 11px;
    font-weight: 900;
    transform: translate(-50%, -50%);
  }

  .public-media-play-icon-only::before {
    content: "";
    width: 0;
    height: 0;
    margin-left: 2px;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
    border-left: 7px solid currentColor;
  }

  .public-matchday-roundup .public-highlight-image .public-media-play {
    width: 18px;
    height: 18px;
    background: rgba(255, 255, 255, 0.76);
    color: rgba(16, 21, 27, 0.62);
    font-size: 8px;
    font-weight: 800;
    text-transform: uppercase;
    box-shadow: 0 1px 2px rgba(16, 21, 27, 0.08);
  }

  .public-matchday-roundup .public-highlight-image .public-media-play-icon-only::before {
    margin-left: 1px;
    border-top-width: 4px;
    border-bottom-width: 4px;
    border-left-width: 6px;
  }

  .public-matchday-roundup .public-cover-story span,
  .public-matchday-roundup .public-cover-story strong,
  .public-matchday-roundup .public-cover-story small {
    min-width: 0;
  }

  .public-matchday-roundup .public-cover-story span {
    grid-column: 2 / 5;
    grid-row: 1 / 2;
  }

  .public-matchday-roundup .public-cover-story .public-roundup-meta {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 5px;
    grid-column: 2 / 5;
    grid-row: 1 / 2;
    min-width: 0;
    line-height: 1;
  }

  .public-matchday-roundup .public-cover-story .public-roundup-meta span {
    grid-column: auto;
    grid-row: auto;
    min-width: 0;
  }

  .public-matchday-roundup .public-cover-story strong {
    grid-column: 2 / 3;
    grid-row: 2 / 3;
    font-size: 13px;
    line-height: 1.1;
  }

  .public-matchday-roundup .public-cover-story small {
    grid-column: 2 / 5;
    grid-row: 3 / 4;
    color: #607086;
    font-size: 11px;
    font-weight: 800;
    line-height: 1.15;
  }

  .public-roundup-duration,
  .public-roundup-arrow {
    color: #263241;
    font-size: 11px;
    font-weight: 900;
    white-space: nowrap;
  }

  .public-roundup-duration {
    grid-column: auto;
    grid-row: auto;
    justify-self: end;
  }

  .public-roundup-arrow {
    grid-column: 4 / 5;
    grid-row: 2 / 3;
    text-decoration: none;
  }

  .public-roundup-switch-item {
    width: 100%;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .public-roundup-switch-item[aria-pressed="true"] {
    border-radius: 4px;
    background: #f8fafc;
    outline: 1px solid #dde5ed;
    outline-offset: -1px;
    box-shadow: inset 2px 0 0 rgba(96, 112, 134, 0.36), 0 1px 4px rgba(16, 21, 27, 0.03);
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup .public-cover-story strong {
    grid-column: 2 / 4;
    font-size: 13.5px;
    line-height: 1.14;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup .public-cover-story small {
    color: #6b7786;
    line-height: 1.2;
  }

  .public-below-headline-highlights .public-cover-story span,
  .public-below-headline-highlights .public-cover-story strong,
  .public-below-headline-highlights .public-cover-story small {
    grid-column: auto;
    grid-row: auto;
  }

  .public-below-headline-highlights .public-cover-story strong {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 16px;
    line-height: 1.15;
  }

  .public-below-headline-highlights .public-cover-story small {
    color: #607086;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.35;
  }

  .public-matchday-main-lower:has(.public-below-headline-highlights) .public-below-headline-side {
    padding-top: 22px;
  }

  .public-editorial-more-link {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
  }

  .public-complement-media {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 6px;
    background:
      linear-gradient(rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.62)),
      url("https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=700&q=80") center / cover;
  }

  .public-complement-media img,
  .public-complement-media iframe,
  .public-complement-media video {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
  }

  .public-complement-media img,
  .public-complement-media video {
    object-fit: cover;
  }

  .public-complement-media video {
    background: #0f141b;
    object-fit: contain;
  }

  .public-roundup-video-panel {
    align-self: stretch;
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
    padding: 0;
  }

  .public-roundup-video-block {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 372px;
    margin-left: auto;
    overflow: hidden;
  }

  .public-roundup-video-panel .public-complement-media {
    width: 100%;
    max-height: 210px;
    aspect-ratio: 16 / 9;
    overflow: hidden;
  }

  .public-roundup-video-panel .public-roundup-active-body {
    gap: 4px;
    width: 100%;
    box-sizing: border-box;
    padding: 7px 0 0;
  }

  .public-roundup-active-meta {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding-bottom: 5px;
    border-bottom: 1px solid #eef2f6;
    color: #263241;
    font-size: 11px;
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
  }

  .public-roundup-active-meta span:last-child {
    color: #607086;
    white-space: nowrap;
  }

  .public-complement-body {
    display: grid;
    gap: 6px;
  }

  .public-complement-label {
    color: #c40012;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-complement-body strong {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 17px;
    line-height: 1.18;
  }

  .public-roundup-video-panel .public-complement-body strong {
    margin-top: 2px;
    font-size: 16.5px;
  }

  .public-roundup-video-panel .public-complement-body p {
    max-width: 96%;
    color: #526174;
    line-height: 1.28;
  }

  .public-complement-title-link {
    color: inherit;
    text-decoration: none;
  }

  .public-complement-title-link:hover {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .public-complement-body p {
    margin: 0;
    color: #607086;
    font-size: 13px;
    line-height: 1.35;
  }

  .public-highlight-image {
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 4px;
    background: #eef2f6;
  }

  .public-highlight-image img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .public-cover-story span {
    color: #c40012;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-cover-story strong {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 16px;
    line-height: 1.15;
  }

  .public-matchday-editorial p,
  .public-matchday-feature p,
  .public-matchday-cover-side p {
    margin: 0;
    color: #607086;
  }

  .public-matchday-cover-side h3 {
    padding-top: 8px;
    border-top: 4px solid #10151b;
    font-size: 14px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-matchday-news h3 {
    padding-top: 0;
    border-top: 0;
    font-size: 14px;
    font-weight: 800;
    line-height: 1.1;
    text-transform: none;
  }

  .public-matchday-news {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    min-height: 100%;
    max-height: 420px;
    padding-right: 0;
    border-right: 0;
    overflow: hidden;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-lead-grid > .public-matchday-news {
    min-height: 0;
    max-height: 100%;
    overflow: hidden;
    contain: size;
  }

  .public-news-list {
    display: grid;
    gap: 0;
    align-content: start;
    min-height: 0;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
    scrollbar-width: none;
  }

  .public-news-list::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .public-news-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .public-news-list::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: rgba(96, 112, 134, 0.28);
  }

  .public-news-item {
    display: grid;
    gap: 7px;
    padding: 0 0 14px;
    border-bottom: 1px solid #e6ebf1;
  }

  .public-news-item + .public-news-item {
    padding-top: 14px;
  }

  .public-news-item:not(:first-child) .public-news-thumb,
  .public-news-item:not(:first-child) .public-news-subtitle {
    display: none;
  }

  .public-news-thumb {
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 4px;
    background: #eef2f6;
  }

  .public-news-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .public-news-copy {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .public-news-list time {
    display: block;
    color: #c40012;
    font-size: 12px;
    font-weight: 900;
    line-height: 1.2;
  }

  .public-news-title {
    display: block;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 16px;
    line-height: 1.15;
  }

  .public-news-subtitle {
    margin: 0;
    color: #607086;
    font-size: 13px;
    line-height: 1.35;
  }

  .public-matchday-lead-grid > .public-matchday-news .public-news-list {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-lead-grid > .public-matchday-news .public-news-list {
    overflow: hidden;
  }

  .public-matchday-lead-grid > .public-matchday-news .public-news-item {
    align-content: start;
  }

  .public-matchday-lead-grid > .public-matchday-news .public-news-title {
    font-size: 16px;
    line-height: 1.15;
  }

  .public-matchday-summary {
    display: grid;
    gap: 0;
  }

  .public-matchday-summary span {
    padding: 8px 0;
    border-bottom: 1px solid #e6ebf1;
    border-radius: 0;
    background: transparent;
    color: #34404d;
    font-size: 13px;
    font-weight: 900;
    line-height: 1.32;
  }

  .public-matchday-feature-game {
    display: grid;
    grid-template-columns: 1fr;
    gap: 9px;
    align-items: center;
    min-height: 210px;
    padding: 14px;
    border: 1px solid #dde4ec;
    border-radius: 0;
    background: #f8fafc;
  }

  .public-matchday-feature-team {
    display: grid;
    justify-items: center;
    gap: 8px;
    text-align: center;
    font-weight: 900;
  }

  .public-matchday-feature-score {
    min-width: 74px;
    text-align: center;
  }

  .public-matchday-feature-score strong {
    display: block;
    font-size: 24px;
  }

  .public-matchday-future {
    padding: 20px;
    color: #607086;
  }

  .public-matchday-group {
    display: grid;
    gap: 10px;
  }

  .public-matchday-group h3 {
    color: #263241;
    font-size: 14px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-matchday-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    width: min(820px, 100%);
    margin: 0 auto;
    padding: 14px 16px;
    border: 1px solid #e3e9f0;
    border-radius: 8px;
    background: #ffffff;
  }

  .public-matchday-card-finished {
    border-color: #cfe5d7;
    background: #fbfffc;
  }

  .public-matchday-card-live {
    border-color: #f5c2c7;
    background: #fff8f8;
  }

  .public-matchday-team:first-child {
    text-align: right;
  }

  .public-matchday-team:last-of-type {
    text-align: left;
  }

  .public-matchday-team {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .public-matchday-team:first-child {
    justify-content: flex-end;
  }

  .public-matchday-team:last-of-type {
    justify-content: flex-start;
  }

  .public-matchday-team-copy {
    min-width: 0;
  }

  .public-matchday-team strong,
  .public-matchday-score strong {
    display: block;
    font-size: 18px;
  }

  .public-matchday-team small,
  .public-matchday-score small {
    display: block;
    margin-top: 4px;
    color: #66717f;
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .public-matchday-team-winner strong {
    color: #137a3a;
  }

  .public-matchday-score {
    min-width: 86px;
    text-align: center;
  }

  .public-matchday-score strong {
    font-size: 24px;
    letter-spacing: 0;
  }

  .public-matchday-status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 8px;
    border-radius: 999px;
    background: #eef2f6;
  }

  .public-matchday-status-finished {
    background: #eaf7ef;
    color: #137a3a;
  }

  .public-matchday-status-live {
    background: #fee2e2;
    color: #b4232b;
  }

  .public-matchday-status-halftime {
    background: #fff0d8;
    color: #8a3a00;
  }

  .public-matchday-status-scheduled {
    background: #eef2f6;
    color: #506075;
  }

  .public-matchday-meta {
    grid-column: 1 / -1;
    justify-content: center;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    color: #607086;
    font-size: 13px;
  }

  .public-matchday-tv {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 7px;
    border: 1px solid #dce3eb;
    border-radius: 999px;
    background: #ffffff;
    color: #263241;
    font-weight: 800;
  }

  .public-matchday-tv img {
    width: 28px;
    height: 18px;
    object-fit: contain;
  }

  .public-table-wrap {
    overflow-x: auto;
    padding: 20px;
  }

  .public-table {
    width: 100%;
    min-width: 1080px;
    border-collapse: collapse;
    font-size: 13px;
  }

  .public-table th,
  .public-table td {
    padding: 10px 8px;
    border-bottom: 1px solid #e6ebf1;
    text-align: right;
    white-space: nowrap;
  }

  .public-table th {
    color: #506075;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-table-club {
    min-width: 300px;
    text-align: left;
  }

  .public-club-cell {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
  }

  .public-club-name {
    min-width: 0;
    overflow: hidden;
    font-weight: 900;
    text-overflow: ellipsis;
  }

  .public-club-form {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin-left: auto;
    color: #66717f;
    font-size: 11px;
    font-weight: 800;
    text-align: right;
    white-space: nowrap;
  }

  .public-table-divider {
    border-left: 2px solid #d8dee6;
  }

  .public-points {
    font-weight: 900;
  }

  .public-gd-positive {
    color: #137a3a;
    font-weight: 900;
  }

  .public-gd-negative {
    color: #b4232b;
    font-weight: 900;
  }

  .public-gd-neutral {
    color: #607086;
    font-weight: 900;
  }

  .public-form-list {
    display: inline-flex;
    gap: 4px;
  }

  .public-form-list span {
    padding: 3px 5px;
    border-radius: 999px;
    background: #eef2f6;
    font-size: 11px;
    font-weight: 900;
  }

  .public-form-win {
    color: #137a3a;
  }

  .public-form-draw {
    color: #607086;
  }

  .public-form-loss {
    color: #b4232b;
  }

  .public-diagnostic {
    margin-top: 18px;
    padding: 18px 20px;
    border: 1px solid #ffd3a3;
    border-radius: 8px;
    background: #fff8ee;
    color: #4a2d00;
  }

  .public-diagnostic h2,
  .public-diagnostic p {
    margin: 0;
  }

  .public-diagnostic p {
    margin-top: 8px;
  }

  .public-diagnostic pre {
    overflow-x: auto;
    margin: 14px 0 0;
    padding: 14px;
    border-radius: 6px;
    background: #ffffff;
    color: #10151b;
    font-size: 13px;
    white-space: pre-wrap;
  }

  .public-logo-diagnostic {
    margin-top: 18px;
    padding: 16px;
    border: 1px solid #d8dee6;
    border-radius: 8px;
    background: #f8fafc;
    color: #26313d;
  }

  .public-logo-diagnostic h2,
  .public-logo-diagnostic p {
    margin: 0;
  }

  .public-logo-diagnostic p {
    margin-top: 6px;
    color: #667282;
    font-size: 13px;
  }

  .public-logo-diagnostic table {
    width: 100%;
    margin-top: 12px;
    border-collapse: collapse;
    font-size: 12px;
  }

  .public-logo-diagnostic th,
  .public-logo-diagnostic td {
    padding: 8px;
    border-top: 1px solid #e1e6ed;
    text-align: left;
    vertical-align: top;
  }

  .public-logo-diagnostic code {
    word-break: break-all;
  }

  @media (max-width: 1180px) {
    .public-matchday-lead-grid {
      grid-template-columns: minmax(0, 1fr) minmax(210px, 230px);
      grid-template-areas:
        "main context"
        "latest latest";
      gap: 22px 20px;
    }

    .public-matchday-lead-grid > .public-matchday-news,
    .public-matchday-lead-grid > .public-side-editorial-block {
      min-height: 0;
    }

    .public-matchday-lead-grid > .public-matchday-news {
      padding: 20px 0 0;
      border-left: 0;
      border-top: 1px solid #dbe4ee;
    }

    .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-lead-grid > .public-matchday-news {
      height: auto !important;
      max-height: none !important;
      overflow: visible;
      contain: none;
    }

    .public-editorial-layout-panel[data-editorial-scope="matchday"] .public-matchday-lead-grid > .public-matchday-news .public-news-list {
      overflow: visible;
    }

    .public-matchday-depth-row {
      grid-template-columns: minmax(0, 1fr);
    }

    .public-side-editorial-inner {
      grid-template-columns: minmax(220px, 0.36fr) minmax(0, 1fr);
      gap: 18px;
    }
  }

  @media (max-width: 840px) {
    .public-matchday-cover {
      gap: 24px;
      min-height: 0;
    }

    .public-matchday-lead-grid,
    .public-matchday-depth-row {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "main"
        "latest"
        "context";
      gap: 24px;
    }

    .public-matchday-lead-grid > .public-matchday-news,
    .public-matchday-lead-grid > .public-side-editorial-block {
      min-height: 0;
      padding: 20px 0 0;
      border-left: 0;
      border-top: 1px solid #dbe4ee;
    }

    .public-matchday-news {
      max-height: none;
      overflow: visible;
    }

    .public-news-list {
      overflow-y: visible;
    }

    .public-roundup-video-layout {
      grid-template-columns: 1fr;
    }

    .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup,
    .public-matchday-main-lower:has(.public-roundup-video-panel) .public-roundup-video-panel {
      grid-column: auto;
      grid-row: auto;
    }

    .public-matchday-main-lower:has(.public-roundup-video-panel) .public-matchday-roundup {
      justify-self: stretch;
      width: 100%;
      margin-left: 0;
    }

    .public-side-editorial-inner {
      grid-template-columns: minmax(180px, 0.42fr) minmax(0, 1fr);
    }

    .public-matchday-lead-grid > .public-side-editorial-block .public-side-editorial-inner {
      grid-template-columns: minmax(180px, 0.42fr) minmax(0, 1fr);
    }

    .public-matchday-lead-grid > .public-side-editorial-block .public-side-editorial-image {
      aspect-ratio: 16 / 9;
    }

    .public-cover-story-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 680px) {
    .public-cover-headline {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "copy"
        "media";
    }

    .public-side-editorial-inner,
    .public-matchday-lead-grid > .public-side-editorial-block .public-side-editorial-inner,
    .public-cover-story-strip {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 760px) {
    .public-matchday-shell {
      padding: 0 16px 16px;
    }

    .public-matchday-hero h1 {
      font-size: 32px;
    }

    .public-matchday-card {
      grid-template-columns: 1fr;
      text-align: left;
    }

    .public-matchday-editorial,
    .public-matchday-feature,
    .public-matchday-cover-side,
    .public-matchday-news {
      padding-right: 0;
      border-right: 0;
    }

    .public-matchday-team:first-child,
    .public-matchday-team:last-of-type,
    .public-matchday-score {
      text-align: left;
    }
  }
`;
