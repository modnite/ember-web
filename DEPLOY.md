# Deploy

The site is static. Caddy on the OMV box serves `/opt/ember-web/site` on port 8093 and proxies `/api` and `/ws` to Hearth. `lan-caddy` routes `ember.cdsrv.com` to that port. A Cloudflare tunnel public hostname points to `https://localhost:443` with No TLS Verify on.

```bash
npm run build
tar czf ember-web-dist.tgz -C dist .
scp ember-web-dist.tgz cdsrv:/tmp/
ssh cdsrv 'cd /opt/ember-web && rm -rf site/* && tar xzf /tmp/ember-web-dist.tgz -C site'
```

Check that `sw.js` and `manifest.webmanifest` are served with `Cache-Control: no-store`.
