# ON/OFF pentru studiul zilnic al deck-urilor

Implementat și publicat pe 14 octombrie 2026 la https://flashcards-b5425.web.app.

- Comutator pe fiecare deck din bibliotecă și în pagina deck-ului, cu rol accesibil `switch`, stare ON/OFF și țintă tactilă de minimum 44 px.
- OFF elimină atât cardurile noi, cât și recapitulările deck-ului din coada zilnică individuală și MASTER. Cardurile rămân vizibile în colecție; practica manuală rămâne disponibilă.
- ON reia studiul cu programarea SRS și istoricul păstrate. Cardurile scadente în perioada de pauză sunt din nou disponibile la reactivare.
- Limita rămâne 15 carduri noi/zi global. Cardurile introduse deja azi consumă în continuare limita chiar dacă deck-ul lor este ulterior oprit.
- Setarea este păstrată în backupul local și în `public.decks.enabled`, pentru sincronizarea între dispozitive. Backupurile vechi fără acest câmp sunt tratate ca ON.
- Migrarea `supabase/deck-enabled.sql` adaugă doar coloana booleană cu valoarea inițială ON; nu oprește automat niciun deck. Utilizatorul alege ce deck-uri oprește.

## Verificări

- 45/45 teste trec; buildul de producție reușește.
- Teste pentru OFF în MASTER, pauza tuturor deck-urilor, reactivare fără resetare, limita globală după pauză, round-trip de backup și salvarea/încărcarea stării în cloud.
- În Supabase, ON și OFF au fost verificate cu rolul `authenticated` și politicile reale ale contului, într-o tranzacție anulată.
- Fișierul JavaScript publicat `/assets/index-BfRIXtBe.js` coincide integral cu buildul local.
- Copiile înainte și după migrare confirmă egalitatea integrală a celor 2.728 de carduri, programărilor SRS și istoricului. Toate cele șase deck-uri rămân inițial ON.
- Backup înainte: `supabase/vlad-before-catalog-replacement-2026-10-14T06-46-55-091Z.json`; după: `supabase/vlad-before-catalog-replacement-2026-10-14T06-50-19-509Z.json`. Ambele sunt verificate ca restaurabile; copia nouă include starea deck-urilor.
- Rollbackul catalogului a fost actualizat pentru coloana nouă și testat prin restaurare exactă într-o tranzacție anulată. Biblioteca actuală a rămas intactă.

Pe iPhone, închide și redeschide aplicația pentru a încărca versiunea nouă. Lasă ON deck-ul din care vrei să înveți și comută celelalte pe OFF.
