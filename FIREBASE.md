# Publicare pe Firebase Hosting

Aplicația folosește Firebase doar pentru găzduirea fișierelor web. Autentificarea și datele rămân în Supabase.

## Prima publicare

1. Creează un proiect pe https://console.firebase.google.com/ și păstrează planul Spark.
2. Din rădăcina proiectului rulează `npx firebase login`.
3. Leagă proiectul local folosind `npx firebase use --add` și alege proiectul creat.
4. Publică folosind `npm run deploy:firebase`.

Firebase va afișa adresa de producție, de forma `https://flashcards-b5425.web.app`.

## Supabase

În Supabase Dashboard, deschide **Authentication > URL Configuration**:

- setează **Site URL** la adresa Firebase;
- adaugă `https://flashcards-b5425.web.app/**` în **Redirect URLs**.

După această configurare, linkul primit prin email va reveni în aplicația publicată.

## Actualizări ulterioare

După orice modificare verificată, rulează din nou:

```bash
npm run deploy:firebase
```

