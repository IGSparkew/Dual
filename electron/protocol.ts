import { net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getCoreLayoutsDir, getCoreSamplesDir, getUserDataRoot } from './paths';

// dual://core/samples/<p> → core samples, dual://core/layouts/<p> → core layouts,
// dual://user/<p> → userdata/<p>. Lets the renderer fetch() local resources — plain
// file:// fetches are blocked by Chromium.
export const DUAL_SCHEME = 'dual';

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

/** Must run before app.whenReady(). */
export function registerDualSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: DUAL_SCHEME,
      // corsEnabled lets pages on other origins (the dev server, file://) fetch
      // this scheme; the handler answers with Access-Control-Allow-Origin: *.
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
    },
  ]);
}

/** Must run after app.whenReady(). */
export function registerDualProtocolHandler(): void {
  protocol.handle(DUAL_SCHEME, async (request) => {
    const filePath = resolveDualPath(new URL(request.url));
    if (!filePath) return new Response('Not found', { status: 404, headers: CORS_HEADERS });

    const response = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(response.body, { status: response.status, headers });
  });
}

function resolveDualPath(url: URL): string | null {
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  let root: string | null = null;
  let sub = rel;

  if (url.host === 'user') {
    root = getUserDataRoot();
  } else if (url.host === 'core') {
    const [head, ...rest] = rel.split('/');
    if (head === 'samples') root = getCoreSamplesDir();
    else if (head === 'layouts') root = getCoreLayoutsDir();
    sub = rest.join('/');
  }
  if (!root || !sub) return null;

  // Path-traversal guard: the resolved file must stay under its root.
  const abs = path.resolve(root, sub);
  return abs.startsWith(path.resolve(root) + path.sep) ? abs : null;
}
