# Prompt – Creazione sito web WordPress con Elementor

## Ruolo
Sei uno sviluppatore WordPress esperto di **Elementor**. Il tuo compito è creare un sito web completo partendo dal template Elementor `{{NOME_TEMPLATE}}` della categoria `{{CATEGORIA_TEMPLATE}}`, adattandolo ai dati, ai testi e alle immagini che ti fornisco qui sotto. Il risultato deve essere composto da file JSON di template Elementor pronti per essere importati.

---

## 1. Dati del sito

| Campo | Valore |
|---|---|
| Nome sito | `{{NOME_SITO}}` |
| Settore / tipo di cliente | `{{SETTORE_CLIENTE}}` |
| Numero di telefono | `{{TELEFONO}}` |
| Email | `{{EMAIL}}` |
| Indirizzo | `{{INDIRIZZO}}` |
| Copyright (footer) | `{{TESTO_COPYRIGHT}}` |

### Servizi
Elenco dei servizi offerti (nome + eventuale breve nota):

1. `{{SERVIZIO_1}}`
2. `{{SERVIZIO_2}}`
3. `{{SERVIZIO_3}}`
4. `{{SERVIZIO_4}}`
5. `{{SERVIZIO_N}}`

---

## 2. Immagini

Le immagini che ti fornisco formano un **unico archivio condiviso** (`{{ELENCO_IMMAGINI}}`). Non sono vincolate a una sola sezione: **ogni immagine può essere usata in qualsiasi punto del sito** (hero, Chi siamo, Perché sceglierci, servizi, call to action, subheader, articoli, ecc.), anche più volte se serve.

| Uso | File immagine |
|---|---|
| Logo | `{{LOGO}}` |
| Immagine principale Home (hero) | `{{IMG_HOME_HERO}}` |
| Immagine subheader pagine interne | `{{IMG_SUBHEADER}}` |
| Immagine in evidenza Servizio 1 – `{{SERVIZIO_1}}` | `{{IMG_SERVIZIO_1}}` |
| Immagine in evidenza Servizio 2 – `{{SERVIZIO_2}}` | `{{IMG_SERVIZIO_2}}` |
| Immagine in evidenza Servizio 3 – `{{SERVIZIO_3}}` | `{{IMG_SERVIZIO_3}}` |
| Immagine in evidenza Servizio N – `{{SERVIZIO_N}}` | `{{IMG_SERVIZIO_N}}` |
| Altre immagini | `{{ALTRE_IMMAGINI}}` |

Regole di utilizzo:
- Le immagini indicate come "immagine in evidenza" di un servizio sono quelle usate nell'articolo e nella card di quel servizio, ma **possono essere riutilizzate liberamente** in altre sezioni (es. Chi siamo, Perché sceglierci, call to action, sfondi di sezione).
- **Nessuna sezione deve restare senza immagine** dove il template ne prevede una (hero, Chi siamo, Perché sceglierci, call to action, card dei servizi, recensioni/avatar se previsti, sfondi, subheader). Se le immagini sono meno degli slot, riutilizza quelle disponibili scegliendo la più coerente con il contenuto della sezione, evitando per quanto possibile di ripetere la stessa immagine in sezioni vicine nella stessa pagina.
- **Nessuna immagine segnaposto del template deve rimanere nel sito**, né placeholder vuoti o immagini rotte.
- **Galleria automatica**: la pagina Galleria deve mostrare **tutte** le immagini caricate (logo escluso), indipendentemente da dove sono usate altrove nel sito.

---

## 3. Template e plugin
Usa come base grafica e strutturale il template `{{NOME_TEMPLATE}}`, generato e salvato per la categoria `{{CATEGORIA_TEMPLATE}}`.

Stile del template: {{STILE_TEMPLATE}}

Regole generali:
- Mantieni stile, colori, tipografia, spaziature e tono di voce del template.
- Il template contiene **solo le sezioni elencate** in questo prompt: non aggiungerne altre.
- Sostituisci tutti i testi di esempio del template con contenuti reali e coerenti con `{{NOME_SITO}}`, il suo settore e i suoi servizi.
- Tutti i testi devono essere in **italiano**, professionali e orientati alla conversione.
- Ogni pagina interna (tutte tranne la Home) deve avere il **subheader** del template con titolo della pagina e immagine `{{IMG_SUBHEADER}}`.

### Plugin e widget
- Il template usa i **widget nativi di Elementor** (titoli, testi, pulsanti, immagini, box icona, box immagine, elenchi, recensioni, galleria) e, per il modulo di contatto, **{{PLUGIN_MODULO}}**.
- **Non impostare UAE (Ultimate Addons for Elementor) in automatico**: il template non lo richiede, perché header e footer vengono mostrati senza addon aggiuntivi.
- Elenca nella guida finale tutti i plugin necessari da installare/attivare prima dell'importazione.
- Dove possibile preferisci i widget nativi di Elementor per ridurre le dipendenze.

---

## 4. Header e Footer (template separati)

### Header
- Creato come template separato (Theme Builder → Header), secondo lo stile del template.
- Contiene: logo `{{LOGO}}`, menu di navigazione con le 5 pagine (Home, Chi Siamo, Servizi, Galleria, Contatti).
- Se il template lo prevede, mostra anche telefono ed email.

### Footer
- Creato come template separato (Theme Builder → Footer), secondo lo stile del template.
- Organizzato in **4 colonne/blocchi**:
  1. **Logo** `{{LOGO}}`.
  2. **Link** – titolo "Link" con il menu di navigazione (Home, Chi Siamo, Servizi, Galleria, Contatti).
  3. **Servizi** – titolo "Servizi" con l'elenco di **tutti i servizi**, ciascuno collegato al relativo articolo.
  4. **Contatti** – titolo "Contatti" con indirizzo, email (link `mailto:`) e telefono (link `tel:`).
- In fondo al footer: copyright `{{TESTO_COPYRIGHT}}`.

---

## 5. Pagine

### 5.1 Home
Sezioni, in quest'ordine:
1. **Hero / prima sezione** – esattamente come nel template, con immagine `{{IMG_HOME_HERO}}` e testi adattati al sito.
2. **Chi siamo** – breve testo di presentazione + immagine (scelta liberamente dall'archivio) + pulsante **"Scopri di più"** che porta alla pagina *Chi Siamo*.
3. **Perché sceglierci** – punti di forza dell'attività (icone/box come da template, con eventuali immagini di sfondo o laterali prese dall'archivio).
4. **Call to action** – *solo se prevista dal template*; con invito a contattare e link a *Contatti* o al telefono; eventuale immagine di sfondo dall'archivio.
5. **I nostri servizi** – 3 servizi in evidenza (immagine, titolo, breve descrizione, link all'articolo del servizio) + pulsante **"Tutti i servizi"** che porta alla pagina *Servizi*.
6. **Recensioni** – 3 recensioni (vedi sezione 5.6).

### 5.2 Chi Siamo
1. Subheader (titolo "Chi Siamo" + `{{IMG_SUBHEADER}}`).
2. **Chi siamo** – versione estesa: storia, missione, valori, esperienza, con immagini dall'archivio.
3. **Perché sceglierci**.
4. **Call to action** – *solo se prevista dal template*.
5. **Recensioni** (le stesse 3 della Home).

### 5.3 Servizi
1. Subheader (titolo "Servizi" + `{{IMG_SUBHEADER}}`).
2. **Unica sezione: tutti i servizi** – griglia con immagine, titolo, breve estratto e link all'articolo di ciascun servizio.

### 5.4 Galleria
1. Subheader (titolo "Galleria" + `{{IMG_SUBHEADER}}`).
2. **Unica sezione: galleria** con **tutte le immagini caricate** (escluso il logo), usando il widget Galleria di Elementor con lightbox. Ogni nuova immagine caricata deve poter essere aggiunta alla galleria senza modificare il layout.

### 5.5 Contatti
1. Subheader (titolo "Contatti" + `{{IMG_SUBHEADER}}`).
2. **Dati di contatto** – telefono (link `tel:`), email (link `mailto:`), indirizzo.
3. **Modulo di contatto** – sezione con il form realizzato con **{{PLUGIN_MODULO}}** con campi: nome, email, telefono, messaggio, consenso privacy e pulsante di invio, con stile coerente al template.
4. **Mappa** – iframe di Google Maps con l'indirizzo `{{INDIRIZZO}}`:

```html
<iframe src="https://www.google.com/maps?q={{INDIRIZZO_URL_ENCODED}}&output=embed" width="100%" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
```

### 5.6 Recensioni (generate da te)
Genera **3 recensioni di esempio** realistiche e coerenti con `{{SETTORE_CLIENTE}}`, `{{NOME_SITO}}` e i servizi offerti:
- Ogni recensione: nome e cognome italiano di fantasia, eventuale ruolo/città, valutazione a 5 stelle e testo di 2–3 frasi, naturale e non eccessivamente promozionale.
- Le tre recensioni devono toccare aspetti diversi (es. qualità del servizio, professionalità/puntualità, rapporto qualità-prezzo o assistenza).
- Se il template prevede un avatar/foto per le recensioni, usa immagini dall'archivio (mai segnaposto) o l'avatar generico/iniziali previsto dal widget, senza lasciare spazi vuoti.
- Usa le stesse 3 recensioni in Home e in Chi Siamo.

---

## 6. Servizi come articoli
Ogni servizio deve essere un **articolo (post) separato**, con:
- Titolo: nome del servizio.
- Immagine in evidenza: l'immagine associata al servizio (vedi tabella al punto 2).
- Testo descrittivo originale in italiano di **minimo 300 caratteri** (ottimizzato SEO, con cosa comprende il servizio, a chi si rivolge e i vantaggi).
- Categoria: "Servizi".
- Usa il template del singolo articolo previsto dal template; alla fine dell'articolo aggiungi una call to action verso la pagina *Contatti*.

---

## 7. Output richiesto
Fornisci:
1. File JSON di template Elementor per: Header, Footer, Home, Chi Siamo, Servizi, Galleria, Contatti e Single Post.
2. Contenuti degli articoli dei servizi (titolo, testo, immagine associata), pronti da inserire o in formato importabile (XML WordPress).
3. Le 3 recensioni generate.
4. Struttura del menu di navigazione.
5. Breve guida all'importazione: elenco dei plugin da attivare, ordine di importazione dei template, assegnazione di Header/Footer tramite Theme Builder, impostazione della Home come pagina iniziale, configurazione del form {{PLUGIN_MODULO}}.

## 8. Controlli finali
- Nessuna immagine o testo di esempio del template rimasto; nessun placeholder immagine vuoto o rotto.
- Ogni sezione che prevede un'immagine ne contiene una.
- La Galleria contiene tutte le immagini caricate.
- Nessuna sezione extra oltre a quelle elencate.
- Footer con: logo, Link (menu), Servizi (tutti i servizi), Contatti (indirizzo, email, telefono) e copyright.
- Tutti i pulsanti e i link puntano alle pagine corrette.
- Telefono, email e indirizzo identici in header, footer e pagina Contatti.
- UAE non attivato.
- Layout responsive verificato su desktop, tablet e mobile.
