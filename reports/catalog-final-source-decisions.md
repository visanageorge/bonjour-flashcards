# Cele 18 intrări rămase — decizie de catalog

Stare finală: **2.728 carduri validate și importate în Supabase; aplicația publicată și verificată.** Cele 18 cazuri au fost aprobate explicit: „Păstrează 2.728: accept verificarea suplimentară și corecția cotte → cocotte (recomandat)”. Aprobarea este păstrată în `content/franceza-source-exceptions-approved.json`. Nu s-a utilizat Gemini API pentru conținut.

Am verificat toate cele 176 pagini ale cărții de gramatică, cache-ul complet Vocabulaire și stratul text al întregului Assimil. Absența din OCR nu dovedește absența absolută din carte; totuși, paginile declarate de arhivă nu oferă o atestare franceză suficientă pentru cele 18 intrări de mai jos.

Instrucțiunile arhivei cer: „Dacă există dubii, marchează-i `needs_review` și NU îi importa până nu sunt validați.” Pentru diferențele de sens cer: „Pentru diferențe și schimbări de sens, cere verificare.” Aprobarea anterioară pentru înlocuirea deck-ului este înregistrată; această decizie privește numai rezolvarea erorilor de sursă.

## Propunerea recomandată

Păstrăm **2.728 ID-uri**, lunile și pozițiile existente. Corectăm **une cotte → une cocotte**, forma efectiv vizibilă în Vocabulaire pagina 76, cu sensul oală cu capac. Pentru celelalte 17, păstrăm forma din catalog și consemnăm validarea lingvistică suplimentară în dicționare; nu pretindem că sunt citate din paginile cărților. Aceasta necesită acceptarea explicită a sursei suplimentare în locul atestării de pagină cerute de arhivă.

Utilizatorul a ales păstrarea celor 2.728 de carduri, cu verificarea suplimentară și corecția cocotte. Varianta de excludere a celor 18 nu a fost aleasă.

| ID FINAL-ADD | Formă finală propusă | Sensul cardului | Problemă de audit / sursă suplimentară |
|---|---|---|---|
| 0054 | un fruit sec | fruct uscat sau oleaginos | Neconfirmat în cărți; [Larousse — fruit](https://www.larousse.fr/dictionnaires/college/fruit/17421). |
| 0158 | allergique | alergic | Neconfirmat în cărți; [Académie — allergique](https://www.dictionnaire-academie.fr/article/A9A1229). |
| 0220 | se coucher tard | a se culca târziu | Componente corecte, fără expresia integrală; [Académie — couche-tard](https://www.dictionnaire-academie.fr/article/A9C4495). |
| 0223 | à la prochaine | pe data viitoare | Neconfirmat în cărți; [Larousse — prochain](https://www.larousse.fr/dictionnaires/francais/prochain/64068). |
| 0248 | **une cocotte** | oală cu capac | Candidatul cotte este o potrivire greșită cu cocotte. Verificare vizuală Vocabulaire 76 și [Académie — cocotte](https://www.dictionnaire-academie.fr/article/A9C2772). |
| 0304 | un rapport | raport/document | Potrivirea OCR nu confirmă substantivul; [Académie — rapport](https://www.dictionnaire-academie.fr/article/A9R0497). |
| 0317 | une technique | tehnică/metodă | Cartea atestă adjectivul, nu sensul substantival; [Académie — technique](https://www.dictionnaire-academie.fr/article/A9T0481). |
| 0333 | être satisfait de | a fi mulțumit de | Expresia integrală neconfirmată; [Larousse — satisfaire](https://www.larousse.fr/dictionnaires/francais/satisfaire/71087). |
| 0338 | louer une chambre | a închiria o cameră | Expresia integrală neconfirmată; [Académie — louer](https://www.dictionnaire-academie.fr/article/A9L1254?history=0). |
| 0343 | rouler à vélo | a merge cu bicicleta | Potrivirile automate sunt fragmente din cuvinte engleze; construcție editorială corectă din rouler + à vélo. |
| 0344 | se servir de | a folosi | Indexul cărții atestă doar servir; [Académie — servir](https://www.dictionnaire-academie.fr/article/A8S0856) confirmă forma pronominală și sensul. |
| 0346 | travailler en équipe | a lucra în echipă | Potrivirea din carte este équipée, nu en équipe; [Académie — équipe](https://www.dictionnaire-academie.fr/article/A9E2415). |
| 0429 | une génération | generație | Potrivirile sunt în engleză; [Académie — génération](https://www.dictionnaire-academie.fr/article/A9G0487). |
| 0433 | un historique | istoric/prezentare cronologică | În carte apare adjectivul; sensul substantival este confirmat de [Académie — historique](https://www.dictionnaire-academie.fr/article/A9H0770). |
| 0441 | une réparation | reparație | OCR a potrivit préparation; [Académie — réparation](https://dictionnaire-academie.fr/article/A9R1819). |
| 0469 | prendre des notes | a lua notițe | În carte notes sunt note școlare sau titluri; [Académie — note](https://dictionnaire-academie.fr/article/A9N0694) confirmă expresia pentru notițe. |
| 0352 | une conséquence | consecință | Potrivire numai în text englez; [Académie — conséquence](https://www.dictionnaire-academie.fr/article/A9C3684). |
| 0358 | une amélioration | îmbunătățire | Neconfirmat în cărți; [Académie — amélioration](https://www.dictionnaire-academie.fr/article/A9A1430). |

Cele 18 texte aprobate au fost promovate în `content/franceza-reviewed-batch-42.tsv`. Fișierul inițial `content/franceza-pending-decisions.tsv` rămâne ca istoric al propunerii. Cele 17 excepții au sursele suplimentare și aprobarea consemnate distinct; cocotte are atestarea de pagină în Vocabulaire 76. Validatorul permite numai aceste 17 excepții explicite.

Textul complet, inclusiv conjugările, poate fi citit în [previzualizarea cardurilor](catalog-pending-cards.md).

## Pregătirea tehnică verificată

- 584 de carduri verbale au conjugarea la prezent, cu pronume reflexive și note pentru verbele impersonale/defective.
- Importatorul are teste pentru 2.728 de UUID-uri valide și stabile, cele șase subseturi, MASTER fără copii, 15 noi/zi și resetarea tuturor programărilor.
- 37 de teste trec. Importul complet, resetarea istoricului, publicarea și restaurarea exactă într-o tranzacție anulată au fost verificate. Vezi [raportul final](catalog-final-result.md).
