# Restaurarea catalogului incomplet și corecția sincronizării

## Constatare

Pe 15 octombrie 2026, atât API-ul cât și o numărătoare SQL independentă arătau **1.003 carduri**, toate aparținând catalogului aprobat de 2.728. Repartizare înainte: 380, 347, 88, 58, 60, 70. Existau 25 recenzii. Luna 01 era ON, lunile 02–06 OFF.

Sincronizarea veche ștergea din cloud orice ID care nu apărea în copia locală. O copie locală incompletă putea astfel elimina carduri valide din baza de date. Nu există aici un jurnal care să identifice exact dispozitivul sau versiunea care a declanșat pierderea. Limita API și dimensiunea copiei locale nu trebuie tratate drept instrucțiuni de ștergere.

Backup înainte: `supabase/vlad-before-catalog-replacement-2026-10-15T10-48-32-597Z.json`.

## Remediere publicată

- Citirea cere numărul exact de rânduri, avansează cu dimensiunea efectiv primită și verifică toate paginile. Paginile scurte nu mai semnalează singure sfârșitul bibliotecii. O pagină repetată, o numărătoare schimbată sau o întrerupere prematură opresc salvarea în siguranță.
- Salvarea combină biblioteca din cloud cu datele locale și returnează colecția completă aplicației. O copie de 1.000 de carduri nu mai șterge celelalte carduri.
- Ștergerea este permisă numai pentru ID-uri eliminate printr-o acțiune explicită de ștergere, resetare, import sau anulare a recenziei. Lista acestor ID-uri se păstrează în datele locale pentru retry offline și nu se deduce dintr-o listă incompletă citită din cloud.
- Recenziile locale noi și setările ON/OFF sunt păstrate la reunire.
- Fișierul publicat `/assets/index-CxYM8tFD.js` coincide integral cu buildul local.

## Restaurare efectivă

Sursa completă: `supabase/vlad-before-catalog-replacement-2026-10-14T06-50-19-509Z.json`.

`scripts/prepare-missing-card-restore.mjs` a pregătit și a fost executată o tranzacție care **inserează numai ID-urile lipsă**, cu `ON CONFLICT(id) DO NOTHING`. Nu suprascrie și nu șterge carduri, recenzii, deck-uri sau setări.

Au fost restaurate 1.725 carduri. În aceeași tranzacție, egalitatea completă a rândurilor a confirmat că toate cardurile și programările deja existente, toate cele 25 recenzii și toate setările deck-urilor au rămas intacte.

| Deck | Carduri după restaurare | Studiu zilnic |
|---|---:|---|
| Luna 01 | 445 | ON |
| Luna 02 | 450 | OFF |
| Luna 03 | 449 | OFF |
| Luna 04 | 450 | OFF |
| Luna 05 | 450 | OFF |
| Luna 06 | 484 | OFF |
| MASTER | 2.728 | folosește deck-urile ON |

Backup după: `supabase/vlad-before-catalog-replacement-2026-10-15T10-59-24-321Z.json`, cu 2.728 carduri și 25 recenzii.

## Verificări

- 51 teste locale trec; compilarea și publicarea Firebase reușesc.
- Teste pentru cazul exact 1.000 local / 2.728 în cloud, limite de pagină mai mici decât cererea, lipsa numărătorii, răspuns întrerupt/repetat, păstrarea unei recenzii noi și ștergerea intenționată după un restart offline.
- O verificare separată, exclusiv în citire, folosește chiar `loadCloudData` din aplicație împreună cu SDK-ul Supabase real. A încărcat 2.728 carduri în trei cereri, cu offseturile 0, 1.000, 2.000.
- Toate textele și programările celor 1.003 carduri existente coincid cu backupul de dinaintea reparației. Cele 25 ID-uri de recenzie și setările ON/OFF coincid de asemenea.
- Rezultate: [catalog-repair-live-check.json](catalog-repair-live-check.json).

Comanda opt-in pentru verificarea numai în citire:

```powershell
$env:BONJOUR_LIVE_CHECK='1'
$env:BONJOUR_BEFORE_BACKUP='supabase/vlad-before-catalog-replacement-2026-10-15T10-48-32-597Z.json'
npx vitest run scripts/cloud-live-read.test.js
```

## Protecția suplimentară respinsă și alternativa folosită

Verificarea automată a respins instalarea unor trigger-e persistente care ar fi blocat scrierile versiunilor vechi, din cauza impactului asupra operațiilor legitime și lipsei aprobării explicite pentru acea blocare. Nu s-a instalat acel mecanism și nu s-a modificat headerul clientului.

Alternativa aplicată este corecția din aplicație și restaurarea strict prin inserare, fără blocări persistente pe server. Versiunile vechi ținute deschise pot păstra încă vechiul comportament; aplicația trebuie închisă și redeschisă pe dispozitivele folosite, apoi se poate apăsa „Actualizează din cloud”.
