export const publicEditorialStyles = `
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

  .public-top-stack {
    position: sticky;
    top: 0;
    z-index: 20;
    margin: 0 -24px;
    padding: 0 24px;
    border-bottom: 1px solid #e2e8f0;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.99) 0%, rgba(248, 250, 252, 0.98) 100%);
    box-shadow: 0 8px 20px rgba(12, 22, 34, 0.06);
  }

  .public-site-topbar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 22px;
    align-items: center;
    min-width: 0;
    min-height: 56px;
    max-width: 1512px;
    margin: 0 auto;
    padding: 0;
    border-bottom: 1px solid #dfe5ec;
  }

  .public-site-brand {
    display: inline-flex;
    align-items: baseline;
    gap: 2px;
    color: #2f343b;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 29px;
    font-weight: 900;
    line-height: 1;
    text-decoration: none;
    letter-spacing: -0.02em;
  }

  .public-site-brand span {
    color: #6b7480;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0;
  }

  .public-site-menu {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    min-width: 0;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .public-site-menu a[aria-current="page"] {
    color: #c40012;
  }

  .public-site-menu a,
  .public-site-actions a {
    color: #10151b;
    text-decoration: none;
  }

  .public-site-menu a[aria-current="page"] {
    color: #c40012;
  }

  .public-site-menu a[aria-current="page"] {
    color: #c40012;
  }

  .public-site-actions {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
    justify-content: flex-end;
    font-size: 13px;
    font-weight: 900;
  }

  .public-site-search {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 170px;
    padding: 6px 11px;
    border: 1px solid #d8dee6;
    border-radius: 999px;
    background: #ffffff;
    color: #66717f;
    font-size: 12px;
    font-weight: 900;
  }

  .public-site-search::before {
    content: "";
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: #ffe04f
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M10.5 18a7.5 7.5 0 1 1 5.3-12.8 7.5 7.5 0 0 1-5.3 12.8Zm5.7-1.8 4.1 4.1' fill='none' stroke='%2310151b' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E")
      center / 13px 13px no-repeat;
    color: #10151b;
    font-size: 13px;
  }

  .public-season-nav-bar {
    margin: 0;
    padding: 0;
    background: #ffffff;
  }

  .public-hidden-heading {
    display: none;
  }

  .public-season-label {
    color: #10151b;
    font-size: 14px;
    font-weight: 900;
    white-space: nowrap;
  }

  .public-season-select-wrap {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px 5px 10px;
    border: 1px solid #cfd7e1;
    background: #f8fafc;
    color: #263241;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .public-season-select {
    min-width: 118px;
    border: 0;
    background: transparent;
    color: #10151b;
    font: inherit;
    outline: none;
    cursor: pointer;
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

  .public-matchday-scoreboard-panel {
    margin-top: 0;
    padding: 6px 0 6px;
    border-top: 1px solid #dbe4ee;
    border-bottom: 1px solid #d4deea;
    border-left: 0;
    border-right: 0;
    border-radius: 0;
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 10px 22px rgba(15, 23, 42, 0.055);
    min-height: 0;
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

  .public-matchday-strip {
    display: grid;
    width: 100%;
    min-width: 0;
    gap: 7px;
    align-items: stretch;
    overflow-x: visible;
    padding: 6px 0;
    background: transparent;
  }

  .public-matchday-strip-shell {
    display: block;
    min-height: 94px;
    padding: 0 12px;
    background: transparent;
  }

  .public-matchday-strip-button {
    display: none;
  }

  .public-matchday-mini-card {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
    width: 100%;
    gap: 3px;
    align-items: start;
    min-height: 80px;
    padding: 7px 8px 8px;
    border: 1px solid #ccd8e5;
    border-radius: 8px;
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
    box-shadow: 0 10px 22px rgba(15, 23, 42, 0.085);
    font-size: 12px;
  }

  .public-matchday-mini-card + .public-matchday-mini-card::before {
    content: none;
    position: absolute;
    top: 10px;
    bottom: 10px;
    left: -5px;
    width: 1px;
    background: #dfe5ec;
  }

  .public-matchday-mini-card-halftime {
    border-color: #ccd8e5;
    background: linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
  }

  .public-matchday-mini-card-finished {
    border-color: #ccd8e5;
  }

  .public-matchday-mini-team {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px;
    overflow: visible;
    font-weight: 800;
    text-transform: none;
  }

  .public-matchday-mini-team:first-child {
    justify-content: flex-start;
  }

  .public-matchday-mini-team:last-child {
    justify-content: flex-start;
  }

  .public-matchday-mini-team > span:not([data-public-team-badge]) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .public-matchday-mini-score {
    min-width: 18px;
    color: #10151b;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 18px;
    font-weight: 900;
    line-height: 1;
    text-align: right;
  }

  .public-matchday-mini-card-live .public-matchday-mini-team:first-of-type .public-matchday-mini-score {
    padding-right: 0;
  }

  .public-matchday-mini-card .public-matchday-mini-status {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 0;
    overflow: visible;
    padding: 3px 0 0;
    border-radius: 0;
    background: transparent;
    color: #607086;
    font-size: 10px;
    font-weight: 800;
    line-height: 1.15;
    text-transform: none;
    white-space: nowrap;
  }

  .public-matchday-mini-card .public-matchday-mini-status > * {
    flex: 0 0 auto;
  }

  .public-matchday-mini-card .public-matchday-mini-status .public-matchday-mini-channel {
    flex: 0 1 auto;
  }

  .public-matchday-mini-card-live .public-matchday-mini-status > span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #10151b;
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

  .public-matchday-live-label,
  .public-matchday-mini-separator {
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

  .public-matchday-mini-time {
    color: #263241;
    white-space: nowrap;
  }

  .public-matchday-mini-channel {
    min-width: 0;
    overflow: visible;
    color: #263241;
    text-overflow: clip;
    white-space: nowrap;
  }

  .public-matchday-mini-separator {
    color: #9aa6b4;
  }

  .public-matchday-cover {
    --public-cover-rule-color: #10151b;
    --public-cover-rule-gap: 8px;
    --public-cover-rule-size: 4px;
    display: grid;
    grid-template-columns:
      minmax(220px, 240px)
      minmax(0, 1fr)
      minmax(240px, 280px);
    grid-template-areas: "feature main news";
    gap: 20px;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    margin: 0 auto;
    padding: 16px 0 18px;
    align-items: stretch;
    min-height: 408px;
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
    gap: 8px;
    padding: 0;
    border: 0;
    grid-template-rows: auto 1fr;
  }

  .public-matchday-editorial {
    align-content: start;
    min-height: 0;
    padding: 0;
    border: 0;
  }

  .public-matchday-feature {
    grid-area: feature;
    padding: 0 14px 14px;
  }

  .public-side-editorial-block {
    color: #263241;
  }

  .public-side-editorial-inner {
    display: grid;
    gap: 12px;
    align-content: start;
    min-width: 0;
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
    object-position: center;
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
    grid-area: news;
    min-height: 100%;
    padding-top: 0;
  }

  .public-matchday-editorial h2,
  .public-cover-support h4,
  .public-matchday-roundup h3,
  .public-matchday-cover-side h3,
  .public-matchday-news h3 {
    margin: 0;
  }

  .public-matchday-editorial h2 {
    color: #c40012;
    font-family: Georgia, "Times New Roman", serif;
    max-width: 100%;
    font-size: 30px;
    line-height: 1.02;
    letter-spacing: 0;
  }

  .public-cover-headline {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(260px, 0.95fr);
    gap: 16px;
    align-items: start;
    min-height: 0;
    overflow: visible;
    padding: 0 0 6px;
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

  .public-editorial-main-image {
    width: 100%;
    aspect-ratio: 16 / 9;
    max-height: 285px;
    overflow: hidden;
    border-radius: 6px;
    background: #eef2f6;
  }

  .public-editorial-main-image img,
  .public-editorial-main-image iframe,
  .public-editorial-main-image video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
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
    font-size: 14px;
    line-height: 1.35;
  }

  .public-matchday-main-lower {
    display: grid;
    grid-template-columns: minmax(0, 1.65fr) minmax(280px, 0.95fr);
    gap: 24px;
    align-items: stretch;
    min-width: 0;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) {
    --public-roundup-top-align: 0px;
    --public-roundup-video-top-offset: 28px;
    --public-roundup-scroll-control-height: 14px;
    --public-roundup-visible-list-height: 285px;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .public-roundup-video-layout {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: minmax(0, 340px) minmax(0, 372px);
    justify-content: end;
    gap: 14px;
    align-items: stretch;
    width: 100%;
    min-width: 0;
  }

  .public-roundup-video-layout > .public-matchday-roundup {
    justify-self: end;
    width: min(100%, 340px);
    margin-right: 0;
    margin-left: auto;
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
    justify-self: end;
    width: min(100%, 340px);
    margin-right: 0;
    margin-left: auto;
    padding: var(--public-roundup-top-align) 6px 0 0;
  }

  .public-matchday-main-lower:has(.public-roundup-video-panel) .public-roundup-video-panel {
    grid-column: 2;
    grid-row: 1;
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
    padding-top: var(--public-cover-rule-gap);
    border-top: var(--public-cover-rule-size) solid var(--public-cover-rule-color);
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
    object-position: center;
  }

  .public-below-headline-highlights .public-cover-story-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    padding-top: 0;
  }

  .public-below-headline-highlights .public-cover-story {
    display: grid;
    grid-template-columns: 1fr;
    gap: 7px;
    align-items: start;
    padding: 0;
    border-bottom: 0;
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
    object-position: center;
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
    padding: var(--public-roundup-video-top-offset) 0 0;
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
    object-position: center;
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
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
  }

  .public-matchday-news {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    min-height: 100%;
    padding-right: 0;
    border-right: 0;
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
    object-position: center;
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
    line-height: 1;
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

  .public-matchday-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    min-width: 0;
    padding: 0;
    overflow-x: auto;
    border-top: 2px solid #10151b;
    border-bottom: 0;
    background: #ffffff;
  }

  .public-matchday-nav a,
  .public-matchday-nav span {
    display: inline-block;
    flex: 0 0 auto;
    padding: 8px 13px;
    border: 0;
    border-right: 1px solid #dfe5ec;
    border-radius: 0;
    background: #ffffff;
    color: #263241;
    font-size: 12px;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
  }

  .public-matchday-nav a[aria-current="page"] {
    border-color: #c40012;
    background: #c40012;
    color: #ffffff;
  }

  .public-matchday-date-row {
    display: flex;
    flex: 0 0 auto;
    justify-content: flex-end;
    min-width: 0;
    margin-left: auto;
  }

  .public-matchday-date-context {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    color: #66717f;
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
    text-align: right;
    white-space: nowrap;
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
    .public-site-topbar {
      gap: 14px;
    }

    .public-site-menu {
      gap: 10px 12px;
      font-size: 11.5px;
    }

    .public-site-actions {
      gap: 8px;
      font-size: 12px;
    }

    .public-site-search {
      min-width: 132px;
      padding: 6px 9px;
    }

    .public-matchday-strip {
      grid-template-columns: repeat(auto-fit, minmax(min(128px, 100%), 1fr)) !important;
      overflow-x: visible;
    }

    .public-matchday-strip-shell {
      padding: 0 8px;
    }
  }

  @media (max-width: 980px) {
    .public-site-topbar {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .public-site-actions {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }

    .public-site-search {
      flex: 0 1 150px;
      min-width: 0;
    }

    .public-matchday-strip {
      grid-template-columns: repeat(auto-fit, minmax(min(142px, 100%), 1fr)) !important;
    }
  }

  @media (max-width: 760px) {
    .public-matchday-shell {
      padding: 0 16px 16px;
    }

    .public-top-stack {
      margin: 0 -16px;
      padding: 0 16px;
    }

    .public-matchday-panel[aria-label="Navegacao de jornadas"] {
      margin: 0 -16px;
    }

    .public-season-nav-inner {
      padding: 8px 16px 9px;
    }

    .public-matchday-hero h1 {
      font-size: 32px;
    }

    .public-site-topbar {
      grid-template-columns: 1fr;
    }

    .public-site-menu,
    .public-site-actions {
      display: flex;
      justify-content: flex-start;
    }

    .public-site-menu {
      gap: 9px 11px;
      font-size: 11px;
    }

    .public-site-actions {
      gap: 8px;
      font-size: 12px;
    }

    .public-matchday-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(148px, 100%), 1fr)) !important;
      overflow-x: visible;
      padding: 6px 0;
    }

    .public-matchday-strip::-webkit-scrollbar {
      display: none;
    }

    .public-matchday-strip-shell {
      margin: 0;
      padding: 0;
    }

    .public-matchday-mini-card {
      flex: 1 1 auto;
    }

  .public-season-nav-bar {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .public-matchday-card {
      grid-template-columns: 1fr;
      text-align: left;
    }

    .public-matchday-cover {
      grid-template-columns: 1fr;
      grid-template-areas:
        "feature"
        "main"
        "news";
    }

    .public-cover-headline,
    .public-matchday-main-lower {
      grid-template-columns: 1fr;
    }

    .public-matchday-main-lower:has(.public-roundup-video-panel) {
      grid-template-columns: 1fr;
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

    .public-cover-story-strip {
      grid-template-columns: 1fr;
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

  .public-matchday-panel[aria-label="Navegacao de jornadas"] {
    max-width: none;
    margin: 0 -24px;
    border: 0;
    border-radius: 0;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 10px 18px rgba(12, 22, 34, 0.06);
  }

  .public-matchday-panel[aria-label="Navegacao de jornadas"] header {
    display: none;
  }

  .public-season-nav-inner {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    align-items: center;
    min-height: 52px;
    max-width: 1512px;
    margin: 0 auto;
    padding: 0;
  }

  @media (max-width: 760px) {
    .public-matchday-panel[aria-label="Navegacao de jornadas"] {
      margin: 0 -16px;
    }

    .public-season-nav-inner {
      gap: 8px;
      padding: 8px 16px 9px;
    }

    .public-matchday-date-context {
      text-align: left;
    }

    .public-matchday-date-row {
      margin-left: 0;
      justify-content: flex-start;
    }
  }
`;
