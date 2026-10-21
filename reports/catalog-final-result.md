# Înlocuirea catalogului — rezultat final

Finalizat și verificat la 13 octombrie 2026, 09:48 ora României.

## Date efectiv publicate

- În contul vizat sunt **exact 2.728 carduri unice**, comparate integral cu payloadul aprobat: ID, deck, text francez, text românesc și programare SRS.
- Deck-ul vechi „Assimil 1–5” a fost eliminat. Din cele 461 identități vechi, 269 au fost reutilizate cu conținut revizuit; 192 nu mai există. Alte 2.459 identități sunt noi.
- Șase luni accesibile, inclusiv Luna 05. MASTER este o vizualizare asupra acelorași carduri, fără rânduri/carduri SRS suplimentare.
- Toate cele 74 recenzii vechi au fost eliminate. Toate cardurile au starea New, reps=0 și fără last_review.
- Maximum **15 carduri noi pe zi în total**. Verificarea cozii pe datele live confirmă că introducerea unui card consumă limita și în celelalte luni. Recapitulările SRS rămân active.
- Fiecare card are sens în română, două exemple franceze și traducerea fiecărui exemplu. 584 carduri includ conjugarea la prezent.
- Conținutul a fost redactat/revizuit prin Codex, fără Gemini API. Cele 17 surse suplimentare și corecția **une cotte → une cocotte** au aprobarea explicită înregistrată. În total sunt zece corecții de formă documentate.

| Deck | Carduri |
|---|---:|
| Luna 01 | 445 |
| Luna 02 | 450 |
| Luna 03 | 449 |
| Luna 04 | 450 |
| Luna 05 | 450 |
| Luna 06 | 484 |
| MASTER, vizualizare comună | 2.728 |

## Publicare și verificare

Aplicația publicată: https://flashcards-b5425.web.app

- Firebase Hosting a confirmat publicarea. HTML-ul live indică `/assets/index-Cp_EFWt1.js`, iar fișierul JavaScript servit coincide integral cu buildul local.
- 37/37 teste trec; compilarea de producție reușește.
- Validatorul de catalog: 0 forme/sensuri/texte neverificate, 0 texte malformate, 0 conjugări lipsă și 0 erori structurale.
- Supabase a aplicat înlocuirea într-o singură tranzacție, cu verificare că datele coincid cu backupul proaspăt înainte de orice modificare.
- Un trigger împiedică un client autentificat vechi să recreeze identitatea deck-ului eliminat. Comportamentul a fost verificat printr-o inserare de probă, anulată.
- Comparația integrală din Supabase a fost repetată după probele de rollback și de protecție: noul catalog este intact.

Rezultatele verificării automate sunt în [catalog-live-verification.json](catalog-live-verification.json). Nu a fost executată o verificare vizuală pe iPhone; versiunea și datele publicate au fost verificate direct.

## Backup și restaurare

- Backup complet al datelor contului: `supabase/vlad-before-catalog-replacement-2026-10-13T06-43-56-593Z.json` — 1 deck, 461 carduri, 74 recenzii, 1 template și setările.
- Copia în formatul aplicației: `supabase/vlad-before-catalog-replacement-app.json`.
- Restaurare SQL pregătită: `tmp/catalog-rollback.sql`.
- Restaurarea a fost executată într-o tranzacție și verificată prin egalitate completă a rândurilor din toate cele cinci tabele, inclusiv timestampurile. Tranzacția a fost anulată prin ROLLBACK: **datele vechi nu au fost reactivate**.
- Prima probă a descoperit că trigger-ele UPDATE schimbau `updated_at`. Restaurarea a fost corectată pentru a reinsera rândurile complete; a doua probă a trecut fără diferențe.
- Backupurile și fișierele SQL cu date private sunt păstrate local și excluse din Git.

Pentru repetarea verificării numai în citire:

```powershell
node scripts/verify-live-catalog.mjs supabase/vlad-before-catalog-replacement-2026-10-13T06-43-56-593Z.json
```

Pe iPhone, închide și redeschide aplicația din ecranul principal. Dacă mai apare biblioteca veche, folosește **Setări → Actualizează din cloud**.
