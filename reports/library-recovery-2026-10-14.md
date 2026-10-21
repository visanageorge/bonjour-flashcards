# Recuperarea bibliotecii blocate

## Problema confirmată

Utilizatorul vede „Nu putem deschide biblioteca”, cu mesajul generic privind citirea datelor locale. Butonul vechi doar reîncărca pagina. Din mesajul generic nu se poate determina dacă IndexedDB este inaccesibil sau dacă înregistrarea locală nu trece validarea.

Copia live din Supabase a fost citită fără modificări și salvată în `supabase/vlad-before-catalog-replacement-2026-10-14T06-24-34-987Z.json`. Trece validarea de restaurare: șase deck-uri, 2.728 carduri, un template, zero recenzii și setările 15/0,9. Cauza concretă de pe iPhone rămâne neconfirmată; această verificare confirmă integritatea datelor din cloud.

## Corecția

- Ecranul de eroare oferă reîncercarea citirii locale, detalii despre eroarea efectivă și descărcarea înregistrării locale fără parsare.
- Conectarea în cont rămâne accesibilă atunci când citirea locală a eșuat.
- „Recuperează din cloud” citește biblioteca contului conectat și o validează. Datele locale originale și informația privind progresul nesincronizat sunt arhivate în același IndexedDB, într-o singură tranzacție cu înlocuirea. Dacă tranzacția eșuează, biblioteca locală originală rămâne intactă.
- Recuperarea nu scrie în Supabase. Dacă nu există date valide în cloud sau contul se schimbă, înlocuirea este refuzată.
- Sincronizarea automată este blocată cât timp citirea inițială este incompletă sau biblioteca locală este în eroare. Astfel, biblioteca temporar goală din memorie nu poate fi trimisă în cloud.
- Citirea acceptă atât formatul JSON folosit acum, cât și o înregistrare structurată validă, fără resetarea progresului.
- Eticheta generală „Cloud indisponibil” devine „Sincronizare eșuată”, descriind rezultatul operației fără să presupună indisponibilitatea serviciului.

## Verificare și limite

42/42 teste trec; compilarea de producție reușește. Testele de recuperare acoperă JSON invalid, programare invalidă cu istoric nesincronizat, păstrarea byte cu byte a originalului, refuzul unei biblioteci cloud invalide, anularea atomică și citirea unei înregistrări structurate.

Nu s-au șters sau resetat date din Supabase. Recuperarea pe iPhone trebuie declanșată din noul ecran. Dacă sistemul blochează complet accesul la IndexedDB, recuperarea afișează acea eroare și nu suprascrie nimic. Progresul nesincronizat rămâne în copia arhivată; nu este fuzionat automat cu biblioteca din cloud.
