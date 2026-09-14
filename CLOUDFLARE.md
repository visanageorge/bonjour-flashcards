# Publicare pe Cloudflare Pages

Aplicația este un proiect Vite static. Configurația pentru Cloudflare Pages este:

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

În Settings → Environment variables, adaugă pentru Production:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_VLAD_EMAIL`
- `VITE_ANDREEA_EMAIL`

Primele trei primesc aceleași valori ca în `.env.local`. Ultima rămâne goală până este configurat contul Andreea. Nu adăuga o cheie Supabase Secret sau `service_role`.

După primul deploy, copiază URL-ul `https://<proiect>.pages.dev` și configurează în Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `https://<proiect>.pages.dev`
- Redirect URLs: `https://<proiect>.pages.dev/**`

Pentru instalare pe iPhone, deschide URL-ul în Safari, apasă Share și apoi Add to Home Screen. Deschide aplicația online cel puțin o dată pentru ca service worker-ul să salveze fișierele necesare utilizării offline.
