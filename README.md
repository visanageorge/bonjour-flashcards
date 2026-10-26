# Bonjour

Aplicație personală de flashcarduri pentru franceză. React, TypeScript, Vite, ts-fsrs, IndexedDB și sincronizare opțională prin Supabase.

## Pornire locală pe Windows

```powershell
npm.cmd install
npm.cmd run dev
```

Deschide http://localhost:5173. Pentru a testa de pe telefon în aceeași rețea Wi-Fi, folosește adresa Network afișată de Vite. Calculatorul trebuie să rămână pornit; firewall-ul trebuie să permită conexiunea. PWA/offline necesită HTTPS sau localhost, deci accesul prin IP local HTTP nu activează service worker-ul pe iPhone.

## Verificări

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

Preview: http://localhost:4173. Buildul de producție include service worker pentru utilizare offline după prima încărcare completă. Modul dev nu activează cache-ul offline.

Instrucțiunile de publicare și variabilele necesare pentru Cloudflare Pages sunt în `CLOUDFLARE.md`.

## Funcții

- Deck-uri și carduri front/back: creare, editare, ștergere cu confirmare.
- Căutare fără diferențiere de diacritice și filtre.
- FSRS, intervale calculate și istoric; anularea ultimului răspuns în sesiune.
- Limită zilnică de carduri noi per deck, retenție țintă și resetarea progresului.
- Progres zilnic, starea deck-ului și progresul sesiunii.
- Salvare în IndexedDB, export/import JSON validat și sincronizare cloud opțională cu magic link.
- Layout pentru desktop și telefon, PWA de producție.

Datele sunt separate pentru fiecare browser și adresă (inclusiv port). Fără autentificare, folosește export/import pentru transfer între dev, preview și site-ul publicat. După conectarea cu magic link, fiecare modificare se salvează local și se sincronizează în Supabase. Folosește o singură filă activă pentru editare; sincronizarea simultană între file nu este implementată.

FSRS utilizează parametrii impliciți ai bibliotecii, cu retenție inițială 90%. Nu include încă optimizarea personalizată a parametrilor. Again/Hard/Good/Easy folosesc pașii impliciți și intervalele calculate, nu intervale fixe.

AI-ul și publicarea sunt etape ulterioare.

## Pregătire Supabase

Proiectul conține deja clientul Supabase opțional și schema PostgreSQL în `supabase/schema.sql`. Aplicația rămâne locală dacă nu sunt setate variabilele de mediu.

1. Creează un proiect pe Supabase.
2. În Dashboard, deschide SQL Editor și rulează `supabase/schema.sql`.
3. Copiază `.env.example` în `.env.local` și completează Project URL și cheia Publishable (`sb_publishable_...`). Pentru proiectele vechi este acceptată și cheia `anon`.
4. Repornește serverul Vite după modificarea `.env.local`.

> Cheia secretă (`sb_secret_...` / `service_role`) nu trebuie pusă niciodată în browser sau în repository. Schema folosește RLS, iar datele sunt accesibile doar după autentificarea utilizatorului.

Pe ecranul de autentificare, alege unul dintre conturile configurate prin `VITE_VLAD_EMAIL` și `VITE_ANDREEA_EMAIL` și introdu codul primit pe email. Sesiunea rămâne persistentă în browser. Fiecare cont are biblioteca, progresul, copia locală și modificările nesincronizate separate. Copia locală din versiunile vechi se migrează numai pentru proprietarul ei înregistrat și rămâne păstrată.

## Acces privat

Aplicația afișează biblioteca numai după autentificare și nu creează automat utilizatori. Pentru a permite accesul exact celor două persoane:

1. În Supabase Dashboard, mergi la Authentication → Users.
2. Adaugă sau invită cele două adrese de email.
3. În Authentication → General Configuration, dezactivează „Allow new users to sign up”.

După această configurare, adresele existente se pot conecta cu un cod pe email, iar alte adrese nu pot crea utilizatori. Politicile RLS păstrează bibliotecile celor două persoane separate, inclusiv cardurile, istoricul și setările ON/OFF. Pentru două conturi cu același vocabular se creează identități noi pentru deck-uri și carduri; nu se copiază programările sau recenziile din contul sursă.
