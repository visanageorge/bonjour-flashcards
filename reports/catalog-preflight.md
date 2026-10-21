# Preflight — înlocuirea catalogului de franceză

Data: 9 octombrie 2026. Stare: **fără modificări în Supabase**. Acest raport este înaintea ștergerilor cerute de `INSTRUCTIUNI_CODEX.md` din arhiva nouă.

## Ținta aprobată pentru dubluri

Fișierul `Franceza_MASTER_revizuit.json` are 2.734 rânduri și poziții lunare complete (450, 450, 450, 450, 450, 484), dar numai **2.728 forme distincte** după normalizarea literelor mari, apostrofului și punctuației finale. Utilizatorul a ales explicit 2.728 carduri unice. Cele șase rânduri `FINAL-ADD-*` care dublează intrări `FR-*` se fuzionează cu intrarea mai veche:

SHA-256 al fișierului canonic: `b4b9614f66b65296e84cbbc4740bbdadd69a0c86cbb09201db2a0a15957de5ad`.

| Termen | Intrarea păstrată | Rând eliminat |
| --- | --- | --- |
| avec plaisir | FR-00526 | FINAL-ADD-0194 |
| bon appétit | FR-00560 | FINAL-ADD-0195 |
| bonne nuit | FR-00563 | FINAL-ADD-0198 |
| de rien | FR-00664 | FINAL-ADD-0224 |
| à bientôt | FR-01105 | FINAL-ADD-0192 |
| à tout à l’heure | FR-01276 | FINAL-ADD-0193 |

Planul canonic are Luna 01 **445**, Luna 02 **450**, Luna 03 **449**, Luna 04 **450**, Luna 05 **450**, Luna 06 **484**. Toate cele șase luni vor fi disponibile. MASTER va afișa aceleași 2.728 obiecte-card, nu încă o copie a lor. Ordinea introducerii în MASTER este Luna 01 → 06; cel mult 15 carduri noi pe zi pentru toate lunile împreună, iar recapitulările rămân disponibile.

## Situația actuală și potrivirea preliminară

În cont există un deck, „Assimil 1–5”, cu **461 carduri**, **74 recenzii** pentru 54 carduri, un template și o înregistrare de setări. Cele 461 carduri au traducere și exemple; catalogul nou conține doar termenii francezi și metadatele, fără traduceri sau exemple românești.

- **269 forme distincte** din catalog au potrivire textuală normalizată cu carduri vechi. Acestea corespund la **291 rânduri-card** vechi, deoarece 22 carduri vechi sunt variante de majusculă/punctuație ale acelorași termeni. Identitatea unui singur card vechi per termen poate fi reutilizată după controlul sensului.
- Alte **22 carduri vechi** au aceeași bază lexicală dar articol/formă diferită. Exemple: `un cadeau` / `le cadeau`, `une fleur` / `la fleur`. `le froid` / `froid`, `une personne` / `personne` și `un modèle` / `la modèle` necesită control semantic explicit; nu sunt echivalate automat.
- **148 carduri vechi** nu au nici măcar această potrivire simplă. Printre ele se află `un chat`, în timp ce catalogul are `ce chat`: sensul cardului nu este identic. Lista completă și maparea se pot regenera cu `scripts/audit-catalog.py` și `scripts/build-catalog-plan.py`.
- Fără a accepta încă potrivirile semantice, **2.459 intrări** din cele 2.728 necesită text nou de card în română. Numărul poate scădea după verificarea celor 22 forme înrudite. Niciun text provizoriu nu va fi importat ca traducere finală.
- Conform cererii curente, **toate cele 74 de recenzii vor fi șterse**, iar programarea FSRS a cardurilor păstrate va fi resetată. Aceasta înlocuiește recomandarea arhivei de a păstra istoricul.

## Intrări care necesită verificare

Din 489 completări, șase sunt duplicatele de mai sus, iar **483 rămân candidate**. Toate cele 489 au în JSON statusul `forma_de_verificat_in_context`; nu este marcată niciuna ca validată manual. Verificarea formei, articolului/genului, sensului și paginii sursă este obligatorie înainte de import.

Auditul automat al celor 171 pagini Vocabulaire citate de completări a găsit baza lexicală pe o pagină citată pentru **281 din 471** intrări cu referință Vocabulaire. Pentru **190** nu s-a găsit o potrivire OCR pe paginile citate; OCR-ul imperfect nu dovedește că termenul lipsește. **141 intrări diferite** au exact aceeași listă de 12 pagini Vocabulaire și 12 pagini Grammaire; doar 33 din cele 141 au potrivire lexicală OCR pe vreuna dintre paginile Vocabulaire declarate. Un exemplu controlat vizual: `une couverture` apare la pagina 54 în Vocabulaire, dar pagina 54 lipsește din lista declarată de catalog pentru acea intrare. Căutarea în stratul text Assimil confirmă automat baza lexicală pentru 283 din 489 completări. Pentru cele 63 rămase fără potrivire în aceste două surse, OCR-ul a găsit șase potriviri pe paginile de gramatică citate; **57 rămân fără confirmare automată**. Pot exista și aici ratări OCR sau forme flexionate.

Această verificare automată **nu certifică sensul ori genul**. Intrări cu sensuri multiple precum `une couverture`, `une ampoule`, `une bourse`, `un vol`, `un rapport`, `un fond`, `assister à` și `repasser` vor fi controlate în context. `un modèle` din deck-ul vechi nu va fi tratat automat ca `la modèle` din catalog. Cele 483 candidate rămân `needs_review` până la validare; nu vor fi importate în această stare.

**Actualizare 13 octombrie 2026:** am reluat cele 57 fără potrivire automată căutând separat formele de masculin/feminin și eliminând notațiile de gen dintre paranteze. Pentru 31 s-a găsit cel puțin o formă în sursele extrase, dintre care 26 au toate formele găsite; **26 intrări nu au încă nicio potrivire automată**. Cinci adjective au numai una dintre cele două forme atestată automat. Acest control nu schimbă statutul `needs_review`, deoarece o apariție textuală nu certifică sensul, genul și pagina declarată.

## Backup și rollback

- Copie brută, filtrată la contul Vlad: `supabase/vlad-before-catalog-replacement.json` (deck, carduri, recenzii, template, setări).
- Copie în format importabil direct în aplicație: `supabase/vlad-before-catalog-replacement-app.json`.
- Copia a trecut validarea completă `parseData` a aplicației: 1 deck, 461 carduri, 74 recenzii, 1 template și setările inițiale. Relațiile card–deck și review–card sunt valide. Nu s-a executat un rollback real asupra bazei live.
- Scenariul de revenire după migrare: se importă copia în formatul aplicației, iar sincronizarea pe loturi reface în Supabase vechiul deck și șterge noile rânduri. Copia brută rămâne disponibilă. Aceasta este o copie completă **a datelor contului vizat**, nu un dump al altor conturi sau al întregului proiect Supabase.

## Aplicația pregătită local

Codul local afișează MASTER ca vizualizare virtuală, impune limita globală de 15 carduri noi și păstrează recapitulările SRS pentru toate lunile. Sincronizarea încarcă toate paginile de date și scrie pe loturi, pentru a evita trunchierea la 1.000 de rânduri. Testele și compilarea trec. Aceste schimbări **nu sunt încă publicate**, iar baza de date nu a fost modificată.

## Condiții înainte de import

1. Finalizarea verificării celor 483 completări unice și a sensurilor ambigue; intrările nevalidate nu se importă.
2. Pregătirea și controlul traducerilor/exemplelor românești pentru cardurile care nu le au, fără Gemini API.
3. Recalcularea numărului final de carduri și a ID-urilor păstrate după verificarea semantică.
4. Aprobarea expresă a raportului de preflight înainte de orice ștergere sau scriere în Supabase, conform `INSTRUCTIUNI_CODEX.md`.
5. După aprobare: actualizarea datelor, verificarea numărului unic, a tuturor celor șase subseturi, a celor 15 noi/zi, a istoricului resetat și a posibilității de rollback.

Sursa canonică este exclusiv `Franceza_MASTER_revizuit.json`. Fișierele de candidați/OCR din arhivă nu sunt liste de import.

## Stare după aprobarea din 13 octombrie 2026

Utilizatorul a aprobat raportul de preflight și ținta de 2.728 carduri unice. Aprobarea nu înlocuiește verificarea de conținut cerută explicit de arhivă. Baza de date **nu a fost încă modificată**.

Un backup proaspăt al contului vizat, `supabase/vlad-before-catalog-replacement-2026-10-13T02-26-04-352Z.json`, conține 461 carduri, 74 recenzii, un deck, un template și setările. Conținutul este identic cu backupul precedent și trece `parseData` în modul de restaurare, fără suprascrierea copiei existente.

`scripts/stage-catalog-content.py` a creat lista editorială locală `tmp/catalog-content-review.json`. Toate cele 2.728 poziții corespund planului canonic și repartiției lunare aprobate. Cele 269 texte vechi cu potrivire exactă sunt doar candidați; niciunul nu este declarat verificat semantic automat. Cele 483 completări unice rămân neverificate în context, iar 2.459 carduri nu au nici măcar un text românesc candidat din backup. Traducerea automată FR→RO încercată local a greșit inclusiv termeni A1 precum `un gâteau` și `une couverture`; rezultatele ei nu au fost promovate în carduri.

`scripts/validate-catalog-content.py` verifică hashul fișierului canonic, pozițiile, numărul de carduri, lipsa dublurilor, câmpurile românești și confirmările editoriale. Înainte de primul lot redactat, 483 forme, 2.728 sensuri și 2.728 texte de card necesitau revizie. Importul trebuie să aștepte până când această verificare trece. Testele aplicației: 34/34; compilarea de producție: reușită. Aplicația nu a fost încă publicată.

Primul lot redactat direct de Codex este în `content/franceza-reviewed.json`: 15 carduri cu sens delimitat, două exemple franceze și traducerea română a fiecărui exemplu. După includerea lor în lista de lucru, rămân 2.713 sensuri și texte de card de revizuit; cele 483 completări necesită în continuare verificare în surse. Validatorul respinge în continuare importul. Baza de date rămâne neschimbată.

**Progres ulterior, 13 octombrie:** conținutul revizuit ajunge la **518 carduri** (`content/franceza-reviewed.json`, fișierele `content/franceza-reviewed-batch-*.tsv` și lista explicită de reutilizări aprobate). Dintre cele 489 completări din arhivă, șase dubluri au fost fuzionate, iar **60 dintre cele 483 unice** au forma, sensul și pagina de sursă consemnate în `content/franceza-source-reviewed.tsv`; 423 rămân pentru revizie în surse. Luna 01 are 422 din 445 texte de card pregătite; cele 23 lipsă sunt completări încă nevalidate. Restul catalogului mai are 2.210 texte de card de pregătit. Importatorul offline `scripts/build-catalog-import.mjs` a fost testat pe starea incompletă și se oprește înainte de producerea unui payload. Nu s-a importat și nu s-a publicat nimic.

**Progres curent, 13 octombrie:** 1.266 din 2.728 carduri au sensul și textul din spate revizuite; 1.462 rămân. Revizia celor 483 completări unice rămâne la 60 validate în surse și 423 în `needs_review`. Validatorul confirmă repartiția lunară și lipsa erorilor structurale, dar refuză importul din cauza conținutului incomplet. Testele aplicației trec (34/34), iar compilarea de producție reușește. Baza de date și versiunea publicată nu au fost modificate.

**Control editorial suplimentar:** 1.531 carduri au textul complet revizuit; 1.197 rămân. Trei forme din catalogul original au greșeli/inconsecvențe confirmate prin textul Assimil și sunt corectate explicit, fără a schimba ID-ul sau luna: `guide (m I fi)` → `un guide / une guide`, `la lotterie` → `la loterie`, `la pizzéria` → `la pizzeria`. Corecțiile sunt în `content/franceza-front-corrections.tsv`; validatorul verifică atât forma din arhivă, cât și forma finală și lipsa dublurilor. Baza de date nu a fost modificată.

**Stare după reluare:** toate cele 2.245 intrări originale au textul pregătit. Împreună cu 338 completări validate în surse, sunt **2.583 carduri pregătite**, iar **145 completări** mai cer verificare și redactare. Lunile 02, 04 și 05 au tot conținutul complet. Registrul corecțiilor are nouă forme documentate, inclusiv `désagréable`, `le modèle`, `la vaisselle`, `la billetterie` și `spectacle`. Ținta rămâne 2.728 de ID-uri unice. Importul și publicarea nu au fost executate.

**Checkpoint final de pregătire, 13 octombrie:** 2.710 carduri sunt redactate și verificate; cele 18 rămase au propuneri complete într-un fișier separat. Toate cele 176 pagini ale cărții de gramatică sunt acum citite. Validatorul nu găsește erori structurale sau conjugări lipsă; 18 forme/sensuri rămân neaprobate pentru import. Cele 577 de carduri verbale pregătite au conjugări la prezent. `reports/catalog-final-source-decisions.md` documentează cele 18 probleme și alegerea necesară: verificare suplimentară în dicționare + corectarea cotte în cocotte pentru 2.728 de carduri, sau excluderea celor 18 pentru 2.710. Întrebarea a fost prezentată utilizatorului; încă nu a fost înregistrată o alegere.

Backupul proaspăt `supabase/vlad-before-catalog-replacement-2026-10-13T05-56-26-149Z.json` este verificat ca restaurabil: 461 carduri, 74 recenzii, un deck, un template, setări. Sunt pregătite generatoare pentru înlocuire SQL atomică și rollback, cu verificare că backupul nu a devenit învechit și protecție împotriva rescrierii vechiului deck de către un client neactualizat. Generatoarele refuză să producă migrarea cât timp validatorul de conținut nu trece. Accesul Management API a fost verificat numai prin SELECT. Testele aplicației și importatorului: 37/37; compilarea de producție reușită. Baza de date și versiunea publicată nu au fost modificate.
> **Finalizat, 13 octombrie 2026:** înlocuirea aprobată a fost executată și verificată. În cont sunt exclusiv 2.728 de carduri, șase luni active și MASTER virtual; istoricul este resetat și limita este 15 noi/zi global. Aplicația este publicată. Vezi [raportul final](catalog-final-result.md). Secțiunile de mai jos păstrează istoricul preflightului și al etapelor de lucru.
