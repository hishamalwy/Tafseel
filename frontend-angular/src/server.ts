import { AngularNodeAppEngine, createNodeRequestHandler, isMainModule, writeResponseToNodeResponse } from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

/**
 * SSR host. Serves the built browser bundle and renders anything the static
 * files do not cover.
 *
 * It sits in front of the Angular app only — `/api` stays with the .NET service,
 * so this process never becomes a second place where business rules live.
 */
const browserDistFolder = join(import.meta.dirname, '../browser');
const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.static(browserDistFolder, {
  maxAge: '1y',
  index: false,
  redirect: false
}));

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then(response => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] ? Number(process.env['PORT']) : 4000;
  app.listen(port, () => console.log(`Tafseel SSR listening on http://localhost:${port}`));
}

export const reqHandler = createNodeRequestHandler(app);
