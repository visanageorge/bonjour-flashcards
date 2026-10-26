# Cont Andreea — activare și progres personal

Finalizat pe 26 octombrie 2026. Butonul „Cont Andreea” este activ în aplicația publicată.

## Date create

- Contul passwordless a fost creat pentru adresa confirmată de utilizator. Adresa este configurată în `.env.local`, exclus din Git.
- Au fost create șase deck-uri lunare și 2.728 carduri cu aceleași texte ca la Vlad: 445, 450, 449, 450, 450 și 484 carduri.
- MASTER este o vizualizare asupra cardurilor Andreei, fără duplicarea lor.
- Deck-urile, cardurile și template-ul au ID-uri proprii. Programările sunt noi, fără recenzii copiate: progresul Andreei pornește de la zero.
- Limita este de 15 carduri noi/zi pentru Andreea, independent de activitatea lui Vlad.
- Setările ON/OFF inițiale sunt copiate din biblioteca lui Vlad: Luna 01 ON, lunile 02–06 OFF. Andreea le poate modifica independent.

## Izolare și păstrarea datelor

- Cache-ul IndexedDB, starea de sincronizare și metadatele backupului sunt separate pe cont. Schimbarea contului nu combină bibliotecile.
- Datele locale din versiunile vechi sunt copiate numai în cache-ul proprietarului înregistrat. Originalul este păstrat.
- Operațiile de sincronizare verifică atât contul activ, cât și proprietarul bibliotecii și modificările locale intervenite pe durata cererii.
- Tranzacția de copiere a verificat egalitatea integrală a datelor lui Vlad înainte și după inserările pentru Andreea. Cele 334 recenzii și toate programările lui Vlad au rămas intacte.
- Politicile RLS existente sunt păstrate. Nu s-au adăugat politici permisive sau mecanisme care să permită acces între conturi.

## Verificări

- 55 teste locale trec; două verificări live sunt opt-in.
- Verificarea live în citire a confirmat conținutul identic, ID-urile distincte, numerele lunare, MASTER cu 2.728 carduri, zero recenzii inițiale la Andreea și progresul lui Vlad neschimbat.
- O tranzacție de test cu rolul `authenticated` a confirmat că Andreea își poate salva o recenzie, nu poate citi sau modifica datele lui Vlad, iar Vlad nu vede datele ei. Tranzacția a fost anulată, fără progres de test rămas.
- Contul este confirmat pentru autentificare prin cod. Configurația SMTP personalizată existentă a fost verificată numai în citire; nu a fost schimbată și nu s-a trimis un email de test.
- Rezultate automate: [andreea-account-live-check.json](andreea-account-live-check.json).

Backup sursă: `supabase/vlad-before-catalog-replacement-2026-10-26T08-42-01-558Z.json`. Copia inițială a bibliotecii Andreei și fișierele SQL cu date sunt păstrate local, excluse din Git.

Pentru conectare: redeschide aplicația, alege „Cont Andreea” și introdu codul primit la adresa configurată. Dacă este conectat deja Vlad pe același dispozitiv, deconectează-l mai întâi din Setări.
