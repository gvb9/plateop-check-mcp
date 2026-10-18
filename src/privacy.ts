import { htmlPage } from "./page.js";

export const PRIVACY_DATE = "2026-10-18";
export const KEEPER_EMAIL = "jon@plateop.com";
export const PLATEOP_PRIVACY_URL = "https://nederland.plateop.com/privacy";

const CSS = `
.lede { max-width: 65ch; }
p + p { margin-top: var(--s-3); }
ul { margin: var(--s-2) 0 0; padding-left: var(--s-4); }
li + li { margin-top: var(--s-1); }
th[scope="row"] { font-family: var(--font-mono); width: 1%; white-space: nowrap; padding-right: var(--s-3); }
`;

/** The privacy policy, written by the keeper in the first person. Facts mirror limits.ts, mcp.ts (log line) and the server setup. */
export function renderPrivacy(): string {
  const body = `<header>
<h1>Privacy</h1>
<p class="lede">Plateop vehicle check lets AI agents ask for the free facts about a used car. This page says what this service keeps. Policy dated ${PRIVACY_DATE}.</p>
</header>

<section aria-labelledby="h-who">
<h2 id="h-who">Who runs it</h2>
<p>Jon Mase, a private individual, on a rented server in Europe. Nothing here is sold. Questions and requests: <!--email_off--><a href="mailto:${KEEPER_EMAIL}">${KEEPER_EMAIL}</a><!--/email_off-->.</p>
</section>

<section aria-labelledby="h-what">
<h2 id="h-what">What is kept</h2>
<table>
<caption>Everything this service keeps, and how long.</caption>
<thead><tr><th scope="col">Record</th><th scope="col">Contents and retention</th></tr></thead>
<tbody>
<tr><th scope="row">rate limit</th><td>A salted hash of the caller's IP address with a count per time window, in memory only, to enforce the limits. Gone when the window has passed or the service restarts. No database and no files.</td></tr>
<tr><th scope="row">call log</th><td>One line per call in the system journal: tool, country, result and the first 12 characters of the hash. No plate, no brand, no model, no raw address. The journal keeps it for at most 30 days.</td></tr>
</tbody>
</table>
</section>

<section aria-labelledby="h-passed">
<h2 id="h-passed">What is passed on</h2>
<p>A plate or model is looked up by the Plateop application on the same server. For that, the caller's IP address (so Plateop's own limit applies per caller) and the plate or model are sent to it, and an Authorization header if the caller sent one. How Plateop handles requests is in <a href="${PLATEOP_PRIVACY_URL}">its privacy policy</a>.</p>
<p>The nginx web server in front of this service keeps a standard access log (IP address, time, path, user agent, status), rotated daily and kept for 14 days. The path of an MCP call is always <span class="mono">/mcp</span>; the plate travels in the request body, not in a URL. Requests pass through Cloudflare, which filters abuse under <a href="https://www.cloudflare.com/privacypolicy/">its own policy</a>.</p>
<p>This page loads the IBM Plex fonts from Google Fonts, so a person opening it contacts Google. Agents calling the MCP endpoint or the text routes never do.</p>
</section>

<section aria-labelledby="h-not">
<h2 id="h-not">What it does not do</h2>
<ul>
<li>No accounts, no cookies, no tracking scripts, no analytics, no advertising.</li>
<li>No storage of the plates that are looked up.</li>
<li>No sharing or selling of any of the above.</li>
</ul>
</section>

<section aria-labelledby="h-changes">
<h2 id="h-changes">Changes</h2>
<p>When this policy changes, the date at the top changes with it. Earlier versions can be requested by email.</p>
</section>

<footer><p><a href="/">Plateop vehicle check</a> · <a href="/llms.txt">Guide for agents</a> · MCP endpoint <span class="mono">/mcp</span></p></footer>`;
  return htmlPage({ lang: "en", title: "Plateop vehicle check, privacy", css: CSS, body });
}
