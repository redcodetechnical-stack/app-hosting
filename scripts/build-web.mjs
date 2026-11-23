// Builds the installable web app (PWA) from web/index.html into public/app/index.html.
// The same index.html also runs as a standalone preview; the injected meta tag switches it
// to "server mode": real accounts, data saved through this API, AI through /api/ai/*.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

let html = readFileSync('web/index.html', 'utf8');
const head = `<meta name="vitalora-api" content="same-origin">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#102A43">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Vitalora">
<meta name="description" content="Vitalora Healthcare: track activity, food, water, sleep, mood and habits, with an AI wellness coach.">`;
const sw = `<script>if('serviceWorker' in navigator){addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))}</script>`;
if (!html.includes('<meta name="vitalora-api"')) html = html.replace('<title>', `${head}\n<title>`);
html = html.replace('</body>', `${sw}\n</body>`);
mkdirSync('public/app', { recursive: true });
writeFileSync('public/app/index.html', html);
console.log('PWA built: public/app/index.html');
