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

## 2. Struttura del sito (fissa)
Il template viene applicato sempre alla stessa struttura, che **non devi cambiare**:

- **Header**: logo, menu con le 5 pagine (Home, Chi Siamo, Servizi, Galleria, Contatti); a seconda della variante anche telefono ed email e un pulsante verso *Contatti*.
- **Home**: Hero · Chi siamo (testo + immagine + pulsante "Scopri di più") · Perché sceglierci (4 punti di forza con icone) · Call to action (facoltativa) · I nostri servizi (3 servizi in evidenza + pulsante "Tutti i servizi") · Recensioni (3, **senza foto dei clienti**).
- **Chi Siamo**: subheader · un'unica sezione **"Chi siamo"** (testo esteso con storia, missione, valori ed esperienza, senza sottotitoli come "La nostra storia" o "La nostra missione") + immagine · Perché sceglierci · Call to action (facoltativa) · Recensioni (le stesse della Home).
- **Servizi**: subheader · griglia con tutti i servizi (immagine, titolo, breve estratto, link all'articolo).
- **Galleria**: subheader · galleria con tutte le immagini caricate, con lightbox.
- **Contatti**: subheader · dati di contatto (telefono, email, indirizzo) · modulo di contatto MetForm · mappa Google.
- **Footer** a 4 colonne: logo · Link (menu) · Servizi (tutti i servizi) · Contatti; in fondo il copyright.
- **Articolo singolo** dei servizi, con call to action finale verso *Contatti*.

---

## 3. Cosa devi progettare
1. **Palette colori** adatta alla categoria: primario, secondario (pulsanti e dettagli), accento, colore dei titoli, del testo, sfondo chiaro delle sezioni alternate e colore scuro (footer, overlay). Contrasto leggibile (WCAG AA) tra testo e sfondo. Palette armoniosa e moderna: un primario deciso, un secondario che lo faccia risaltare (complementare o caldo), sfondo chiaro appena tinto del primario, colore scuro profondo dello stesso tono; niente colori saturi accostati a caso.
   La palette deve seguire l'atmosfera della direzione di design ed essere **chiaramente diversa** da quelle degli altri template della categoria (altra famiglia di colore per il primario).
2. **Font, aspetto e layout delle sezioni**: sono già scelti dal generatore in base alla direzione di design (vedi sotto), in modo che ogni template sia diverso dagli altri; il tuo design deve essere coerente con queste scelte.
3. **Coerenza con la direzione**: descrizione, tono e testi devono rispecchiare la direzione (es. "industriale" = frasi brevi e decise; "editoriale" = tono raffinato).
4. **Icone** dei 4 punti di forza di "Perché sceglierci", pertinenti alla categoria.
5. **Tono di voce** del sito (es. "professionale e rassicurante", "caldo e familiare").
6. **Testi di esempio** per ogni sezione, nella lingua indicata: realistici per la categoria, senza nomi, telefoni, email o indirizzi. Servono come guida di tono e di lunghezza: per ogni cliente verranno riscritti. I 4 punti di forza di "Perché sceglierci" devono avere un titolo breve (2–4 parole) e una spiegazione concreta di 1–2 frasi, specifica per la categoria (mai testo generico o "lorem ipsum").
7. Una **descrizione** breve del concetto grafico (2–3 frasi).

## 4. Regole
- Il template usa **solo widget nativi di Elementor** (titoli, testi, pulsanti, immagini, box icona, box immagine, elenchi, recensioni, galleria) più il modulo **MetForm**: nessun altro addon. **Non usare UAE (Ultimate Addons for Elementor).**
- Nessuna immagine nel template: tutte le immagini arrivano dall'archivio del cliente.
- Le **recensioni non hanno foto dei clienti**: solo stelle, testo, nome e ruolo/città.
- Il template deve essere **esteticamente curato**: gerarchia chiara dei titoli, spazi generosi, sezioni alternate chiare/scure o su foto, call to action ben visibili. Scegli varianti di layout che creino ritmo (es. non tutte le sezioni sullo stesso sfondo).
- Nessun "lorem ipsum" e nessun dato di contatto inventato nei testi di esempio.
