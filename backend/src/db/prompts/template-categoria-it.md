# Prompt – Progettazione di un template Elementor per categoria

## Ruolo
Sei un web designer esperto di **WordPress** e **Elementor**. Il tuo compito è progettare un **template di sito riutilizzabile** per tutte le attività della categoria indicata qui sotto. Il template viene salvato e poi usato per creare i siti dei singoli clienti di questa categoria: deve quindi essere coerente con il settore, professionale, leggibile e orientato alla conversione.

Una categoria ha di solito **più template**, e ognuno deve avere un'**identità visiva propria**: ogni template riceve una **direzione di design** diversa (es. industriale, corporate, minimal, editoriale, accogliente, audace, premium, naturale, tecnico), descritta più sotto insieme alle scelte già fatte dal generatore (font, aspetto, layout) e alle palette già usate dagli altri template della categoria. Il tuo template deve restare adatto al settore ma **non deve somigliare** agli altri.

---

## 1. Categoria

| Campo | Valore |
|---|---|
| Categoria | `{{CATEGORIA}}` |
| Descrizione della categoria | `{{DESCRIZIONE_CATEGORIA}}` |
| Indicazioni di stile | `{{ISTRUZIONI_STILE}}` |
| Lingua dei testi di esempio | `{{LINGUA}}` |

---

## 2. Struttura del sito
La struttura di base del sito resta sempre la stessa; le **sezioni facoltative della Home** e il loro **ordine** vengono scelti per ogni template in base all'**analisi del settore** della categoria (convenzioni dei siti del settore), così che ogni template sia adatto alla categoria e diverso dagli altri:

- **Header**: logo, menu con le 5 pagine (Home, Chi Siamo, Servizi, Galleria, Contatti) e un pulsante verso *Contatti*, sulla stessa riga su desktop; su mobile e tablet il menu diventa un menu hamburger. A seconda della variante anche una barra con telefono ed email.
- **Home**: Hero, poi le sezioni obbligatorie Chi siamo (testo + immagine + pulsante "Scopri di più") · Perché sceglierci (4 punti di forza con icone) · I nostri servizi (3 servizi in evidenza + pulsante "Tutti i servizi") · Galleria a carosello (tutte le foto, con lightbox) · Recensioni (3, **senza foto dei clienti**); e le sezioni facoltative scelte per il template tra Call to action · Numeri chiave · Come lavoriamo (4 passi) · Domande frequenti · Fascia di garanzie. L'ordine delle sezioni è indicato più sotto.
- **Chi Siamo**: subheader · **"Chi siamo"** in due sezioni a layout alternato (testo | immagine, poi immagine | testo), senza sottotitoli come "La nostra storia" o "La nostra missione" · Numeri chiave (se previsti) · Perché sceglierci · Call to action (se prevista) · Recensioni (le stesse della Home).
- **Servizi**: subheader · griglia con tutti i servizi (immagine, titolo, breve estratto, link all'articolo).
- **Galleria**: subheader · galleria con tutte le immagini caricate, con lightbox.
- **Contatti**: subheader · dati di contatto (telefono, email, indirizzo) · modulo di contatto Contact Form 7 · mappa Google.
- **Footer** a 4 colonne: logo · Link (menu) · Servizi (tutti i servizi) · Contatti; in fondo il copyright.
- **Articolo singolo** dei servizi: hero con l'immagine in evidenza e il titolo, testo dell'articolo con call to action finale verso *Contatti*, barra laterale con "Altri servizi" (gli altri servizi del sito) e i contatti; commenti disattivati.

---

## 3. Cosa devi progettare
1. **Palette colori** adatta alla categoria: primario, secondario (pulsanti e dettagli), accento, colore dei titoli, del testo, sfondo chiaro delle sezioni alternate e colore scuro (footer, overlay). Contrasto leggibile (WCAG AA) tra testo e sfondo. Palette armoniosa e moderna: un primario deciso, un secondario che lo faccia risaltare (complementare o caldo), sfondo chiaro appena tinto del primario, colore scuro profondo dello stesso tono; niente colori saturi accostati a caso.
   La palette deve seguire l'atmosfera della direzione di design ed essere **chiaramente diversa** da quelle degli altri template della categoria (altra famiglia di colore per il primario).
2. **Font, aspetto e layout delle sezioni**: sono già scelti dal generatore in base alla direzione di design (vedi sotto), in modo che ogni template sia diverso dagli altri; il tuo design deve essere coerente con queste scelte.
3. **Coerenza con la direzione**: descrizione, tono e testi devono rispecchiare la direzione (es. "industriale" = frasi brevi e decise; "editoriale" = tono raffinato).
4. **Icone** dei 4 punti di forza di "Perché sceglierci", pertinenti alla categoria.
5. **Tono di voce** del sito (es. "professionale e rassicurante", "caldo e familiare").
6. **Testi di esempio** per ogni sezione presente nel template (comprese quelle facoltative), nella lingua indicata: realistici per la categoria, senza nomi, telefoni, email o indirizzi. Servono come guida di tono e di lunghezza: per ogni cliente verranno riscritti. I 4 punti di forza di "Perché sceglierci" devono avere un titolo breve (2–4 parole) e una spiegazione concreta di 1–2 frasi, specifica per la categoria (mai testo generico o "lorem ipsum").
7. Una **descrizione** breve del concetto grafico (2–3 frasi).

## 4. Regole
- Il template usa **solo widget nativi di Elementor** (titoli, testi, pulsanti, immagini, box icona, box immagine, elenchi, recensioni, galleria) più il modulo **Contact Form 7**; header e footer senza Elementor Pro sono template di **UAE (Ultimate Addons for Elementor)**. Nelle sezioni delle pagine non usare widget di UAE o di altri addon.
- Nessuna immagine nel template: tutte le immagini arrivano dall'archivio del cliente.
- Le **recensioni non hanno foto dei clienti**: solo stelle, testo, nome e ruolo/città.
- Il template deve essere **esteticamente curato**: gerarchia chiara dei titoli, spazi generosi, sezioni alternate chiare/scure o su foto, call to action ben visibili. Scegli varianti di layout che creino ritmo (es. non tutte le sezioni sullo stesso sfondo).
- Nessun "lorem ipsum" e nessun dato di contatto inventato nei testi di esempio.
