import type { Plugin } from 'vite';

export function devConfirmPlugin(): Plugin {
  return {
    name: 'dev-confirm-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        if (req.url.startsWith('/__dev_confirm')) {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: true, env: process.env.NODE_ENV || 'development' }));
          return;
        }
        next();
      });
    },
  };
}
