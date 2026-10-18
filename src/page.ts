/** The one HTML shell for the two human-facing pages (privacy): tokens from DESIGN.md, no JavaScript. */

export const BASE_CSS = `
:root {
  color-scheme: light dark;
  --bg: oklch(98% 0.004 90);
  --surface: oklch(96% 0.006 90);
  --border: oklch(88% 0.008 90);
  --text: oklch(22% 0.01 262);
  --text-2: oklch(48% 0.01 262);
  --accent: oklch(44% 0.13 262);
  --font-sans: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --fs-sm: 14px;
  --fs-body: 16px;
  --fs-h2: 20px;
  --fs-h1: 39px;
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 16px;
  --s-4: 24px;
  --s-5: 32px;
  --s-6: 48px;
  --s-7: 96px;
  --radius: 4px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: oklch(18% 0.01 262);
    --surface: oklch(22% 0.01 262);
    --border: oklch(32% 0.01 262);
    --text: oklch(92% 0.005 90);
    --text-2: oklch(68% 0.01 262);
    --accent: oklch(72% 0.11 262);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 400 var(--fs-body)/1.5 var(--font-sans);
}
main { max-width: 720px; margin: 0 auto; padding: var(--s-6) var(--s-3) var(--s-7); }
h1, h2 { font-family: var(--font-mono); font-weight: 500; line-height: 1.2; margin: 0; overflow-wrap: anywhere; }
h1 { font-size: var(--fs-h1); }
h2 { font-size: var(--fs-h2); margin-bottom: var(--s-2); }
.lede { margin: var(--s-3) 0 0; color: var(--text-2); }
section { margin-top: var(--s-6); }
p { margin: 0; }
.note, figcaption, caption, .meta, footer { font-size: var(--fs-sm); color: var(--text-2); }
.note { margin-top: var(--s-2); }
.empty { color: var(--text-2); }
.mono { font-family: var(--font-mono); overflow-wrap: anywhere; }
.unknown { color: var(--text-2); }
table { width: 100%; border-collapse: collapse; margin-top: var(--s-2); }
caption { text-align: left; padding-bottom: var(--s-2); }
th, td { padding: var(--s-2) 0; text-align: left; font-weight: 400; vertical-align: baseline; border-bottom: 1px solid var(--border); }
thead th { font-size: var(--fs-sm); font-weight: 500; color: var(--text-2); }
tbody th { overflow-wrap: anywhere; padding-right: var(--s-3); }
a { color: var(--text); text-decoration-thickness: 1px; text-underline-offset: 4px; overflow-wrap: anywhere; }
a:hover { text-decoration-thickness: 2px; }
a:active { opacity: 0.7; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius); }
footer { margin-top: var(--s-6); }
`;

export interface PageOptions {
  lang: "nl" | "en";
  title: string;
  /** Page-specific CSS, appended after BASE_CSS. */
  css?: string;
  /** Adds <meta name="robots" content="noindex">. */
  noindex?: boolean;
  /** Inner HTML of <main>. */
  body: string;
}

export function htmlPage(o: PageOptions): string {
  return `<!doctype html>
<html lang="${o.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${o.noindex ? '<meta name="robots" content="noindex">\n' : ""}<title>${o.title}</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap">
<style>${BASE_CSS}${o.css ?? ""}</style>
</head>
<body>
<main>
${o.body}
</main>
</body>
</html>
`;
}
