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
- **Nessuna sezione deve restare senza immagine** dove il template ne prevede una (hero, Chi siamo, Perché sceglierci, call to action, card dei servizi, sfondi, subheader). Se le immagini sono meno degli slot, riutilizza quelle disponibili scegliendo la più coerente con il contenuto della sezione, evitando per quanto possibile di ripetere la stessa immagine in sezioni vicine nella stessa pagina.
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
- Senza Elementor Pro, header e footer sono template di **UAE (Ultimate Addons for Elementor)** – Header Footer Builder, mostrati su tutto il sito.
- Elenca nella guida finale tutti i plugin necessari da installare/attivare prima dell'importazione.
- Dove possibile preferisci i widget nativi di Elementor per ridurre le dipendenze.

---

## 4. Header e Footer (template separati)

### Header
- Creato come template separato (Theme Builder → Header con Elementor Pro, altrimenti UAE → Header Footer Builder), secondo lo stile del template.
- Contiene: logo `{{LOGO}}`, menu di navigazione con le 5 pagine (Home, Chi Siamo, Servizi, Galleria, Contatti) e un pulsante verso *Contatti*.
- **Desktop**: logo, menu e pulsante allineati in orizzontale sulla stessa riga, con spaziature e proporzioni coerenti.
- **Mobile e tablet**: il menu diventa un **menu hamburger** che si apre e si chiude al tocco; logo e pulsante dell'hamburger restano allineati sulla stessa riga. Sul telefono il pulsante verso *Contatti* si trova dentro il menu aperto.
- Se il template lo prevede, mostra anche telefono ed email.

### Footer
- Creato come template separato (Theme Builder → Footer con Elementor Pro, altrimenti UAE → Header Footer Builder), secondo lo stile del template.
- Organizzato in **4 colonne/blocchi**:
  1. **Logo** `{{LOGO}}`.
  2. **Link** – titolo "Link" con il menu di navigazione (Home, Chi Siamo, Servizi, Galleria, Contatti).
  3. **Servizi** – titolo "Servizi" con l'elenco di **tutti i servizi**, ciascuno collegato al relativo articolo.
  4. **Contatti** – titolo "Contatti" con indirizzo, email (link `mailto:`) e telefono (link `tel:`).
- In fondo al footer: copyright `{{TESTO_COPYRIGHT}}`.

---

## 5. Pagine

### 5.1 Home
Prima l'**hero**, poi le sezioni del template in quest'ordine: {{SEZIONI_HOME}}.

Le sezioni **Chi siamo, Perché sceglierci, I nostri servizi, Galleria fotografica e Recensioni** ci sono sempre; le altre (call to action, numeri chiave, come lavoriamo, domande frequenti, fascia di garanzie) sono state scelte dal template in base alle convenzioni del settore.

- **Hero / prima sezione** – esattamente come nel template, con immagine `{{IMG_HOME_HERO}}` e testi adattati al sito.
- **Chi siamo** – breve testo di presentazione + immagine (scelta liberamente dall'archivio) + pulsante **"Scopri di più"** che porta alla pagina *Chi Siamo*.
- **Perché sceglierci** – i punti di forza dell'attività (da 3 a 6, quanti ne prevede il template; icone/box come da template, con eventuali immagini di sfondo o laterali prese dall'archivio), ciascuno con titolo e testo scritti per `{{NOME_SITO}}`: mai testo segnaposto o "lorem ipsum".
- **Call to action** – *solo se prevista dal template*; con invito a contattare e link a *Contatti* o al telefono; eventuale immagine di sfondo dall'archivio.
- **I nostri servizi** – 3 servizi in evidenza (immagine, titolo, breve descrizione, link all'articolo del servizio) + pulsante **"Tutti i servizi"** che porta alla pagina *Servizi*.
- **Galleria fotografica** – le foto dell'archivio (logo escluso) nel layout del template: carosello con frecce, scorrimento automatico e lightbox, mosaico (una foto grande e quattro piccole), striscia a tutta larghezza o colonne di foto sfalsate; sempre responsive, con le foto ritagliate in modo uniforme, + pulsante verso la pagina *Galleria*.
- **Recensioni** – 3 recensioni (vedi sezione 5.6).
- **Numeri chiave** (se previsti) – 4 cifre realistiche (es. anni di esperienza): sono esempi da verificare con il cliente, mai dati presentati come certi se non forniti.
- **Come lavoriamo** (se previsto) – il metodo in 4 passi numerati.
- **Domande frequenti** (se previste) – 4 domande tipiche dei clienti del settore con risposta, senza prezzi inventati.
- **Fascia di garanzie** (se prevista) – 4 punti brevi (es. preventivo gratuito).

### 5.2 Chi Siamo
1. Subheader (titolo "Chi Siamo" + `{{IMG_SUBHEADER}}`).
2. **Chi siamo** – il testo, lungo, è diviso in **due sezioni a layout alternato**, **senza sottotitoli** come "La nostra storia" o "La nostra missione":
   - prima sezione: titolo **"Chi siamo"** + testo (chi siamo, storia, esperienza) a sinistra, immagine dall'archivio a destra;
   - seconda sezione: immagine dall'archivio a sinistra, testo (valori, metodo, impegno verso i clienti) a destra, senza ripetere la prima parte.
3. **Numeri chiave** – *solo se previsti dal template*.
4. **Perché sceglierci**.
5. **Call to action** – *solo se prevista dal template*.
6. **Recensioni** (le stesse 3 della Home).

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
- Le recensioni sono **senza foto dei clienti**: nessun avatar e nessuna immagine, solo stelle, testo, nome e ruolo/città.
- Usa le stesse 3 recensioni in Home e in Chi Siamo.

---

## 6. Servizi come articoli
Ogni servizio deve essere un **articolo (post) separato**, con:
- Titolo: nome del servizio.
- Immagine in evidenza: l'immagine associata al servizio (vedi tabella al punto 2).
- Testo descrittivo originale in italiano di **minimo 300 caratteri** (ottimizzato SEO, con cosa comprende il servizio, a chi si rivolge e i vantaggi).
- Categoria: "Servizi".
- Usa il template del singolo articolo previsto dal template, curato e professionale:
  - **hero** in alto con l'immagine in evidenza dell'articolo come sfondo (con sovrapposizione scura), etichetta "Servizi" e titolo del servizio;
  - sotto, il **testo dell'articolo** e, alla fine, una call to action verso la pagina *Contatti*;
  - una **barra laterale** con **"Altri servizi"**, che elenca automaticamente tutti gli altri servizi del sito (escluso quello dell'articolo) con il link al loro articolo, e un riquadro con i contatti (telefono, email, indirizzo).
- **Commenti disattivati** su tutti gli articoli (nessun modulo commenti, commenti e pingback chiusi).

---

## 7. Output richiesto
Fornisci:
1. File JSON di template Elementor per: Header, Footer, Home, Chi Siamo, Servizi, Galleria, Contatti e Single Post.
2. Contenuti degli articoli dei servizi (titolo, testo, immagine associata), pronti da inserire o in formato importabile (XML WordPress).
3. Le 3 recensioni generate.
4. Struttura del menu di navigazione.
5. Breve guida all'importazione: elenco dei plugin da attivare, ordine di importazione dei template, assegnazione di Header/Footer tramite Theme Builder, impostazione della Home come pagina iniziale, configurazione del form {{PLUGIN_MODULO}}.

## 8. Controlli finali
- Nessuna immagine o testo di esempio del template rimasto (nemmeno "lorem ipsum" nei box di "Perché sceglierci"); nessun placeholder immagine vuoto o rotto.
- Recensioni senza foto dei clienti.
- Galleria fotografica presente in Home, con le foto dell'archivio ritagliate in modo uniforme e il link alla pagina *Galleria*.
- Pagina Chi Siamo divisa in due sezioni alternate (testo | immagine, immagine | testo).
- Articoli con hero, barra laterale "Altri servizi" e commenti disattivati.
- Numeri chiave (se presenti) verificati con il cliente.
- Ogni sezione che prevede un'immagine ne contiene una.
- La Galleria contiene tutte le immagini caricate.
- Nessuna sezione extra oltre a quelle elencate.
- Footer con: logo, Link (menu), Servizi (tutti i servizi), Contatti (indirizzo, email, telefono) e copyright.
- Tutti i pulsanti e i link puntano alle pagine corrette.
- Telefono, email e indirizzo identici in header, footer e pagina Contatti.
- Header e footer attivi su tutto il sito (Theme Builder o UAE).
- Layout responsive verificato su desktop, tablet e mobile.
