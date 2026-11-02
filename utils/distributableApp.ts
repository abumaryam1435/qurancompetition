import { FullBackupData } from '../types';
import { INITIAL_USERS, DEFAULT_APP_NAME } from '../constants';

export const utf8ToBase64 = (str: string): string => {
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (e) {
    console.error("Base64 Encoding Error:", e);
    return "";
  }
};

const serviceWorkerCode = `
const CACHE_NAME = 'competition-app-cache-v1';
const ASSETS_TO_CACHE = ['./', './index.html', './manifest.json'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS_TO_CACHE))); self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (url.includes('/api/') || url.includes('firebaseio.com')) return;
  e.respondWith(
    caches.match(e.request).then((r) => {
      return r || fetch(e.request).catch(() => new Response('Offline', { status: 503 }));
    }).catch(() => new Response('Offline', { status: 503 }))
  );
});
`;

export const getDistributableHtmlString = async (
  appData: FullBackupData,
  exportType: 'empty' | 'snapshot'
): Promise<string> => {
  const docClone = document.documentElement.cloneNode(true) as HTMLElement;
  const rootElement = docClone.querySelector('#root');
  if (rootElement) rootElement.innerHTML = '';

  const oldScripts = docClone.querySelectorAll('script');
  oldScripts.forEach(s => {
    if (s.textContent?.includes('window.embeddedAppData') || s.textContent?.includes('serviceWorker.register')) {
      s.remove();
    }
  });

  let appDataForEmbedding: FullBackupData;
  if (exportType === 'empty') {
    appDataForEmbedding = {
      users: INITIAL_USERS,
      competitions: [],
      customLogo: null,
      supervisorPassword: '123',
      appName: appData.appName || DEFAULT_APP_NAME,
      isDistributable: true,
      isPublishedConnected: false,
      firebaseConfig: null,
    };
  } else {
    appDataForEmbedding = {
      ...appData,
      isDistributable: true,
      isPublishedConnected: true,
    };
  }

  const encodedData = utf8ToBase64(JSON.stringify(appDataForEmbedding));
  const swRegistrationScript = `if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); }); }`;
  const dataScript = `\n<script type="text/javascript">window.embeddedAppData = '${encodedData}'; ${swRegistrationScript}</script>\n`;

  const bodyEndTag = '</body>';
  const htmlContentRaw = docClone.outerHTML;
  const bodyEndIndex = htmlContentRaw.toLowerCase().lastIndexOf(bodyEndTag);

  const htmlContent = (bodyEndIndex !== -1)
    ? htmlContentRaw.slice(0, bodyEndIndex) + dataScript + htmlContentRaw.slice(bodyEndIndex)
    : htmlContentRaw + dataScript;

  return '<!DOCTYPE html>\n' + htmlContent;
};
