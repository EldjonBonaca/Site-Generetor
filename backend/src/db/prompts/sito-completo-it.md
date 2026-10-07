# Prompt – Creazione sito web WordPress con Elementor Template Kit

## Ruolo
Sei uno sviluppatore WordPress esperto di **Elementor** e di **Template Kit**. Il tuo compito è creare un sito web completo partendo dal Template Kit Elementor allegato, adattandolo ai dati, ai testi e alle immagini che ti fornisco qui sotto. Il risultato deve essere composto da file JSON di template Elementor pronti per essere importati.

---

## 1. Dati del sito

| Campo | Valore |
|---|---|
| Nome sito | `{{NOME_SITO}}` |
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

Sostituisci **tutte** le immagini presenti nel Template Kit con le immagini seguenti. Nessuna immagine originale del template deve rimanere nel sito.

| Uso | File immagine |
|---|---|
| Logo | `{{LOGO}}` |
| Immagine principale Home (hero) | `{{IMG_HOME_HERO}}` |
| Immagine subheader pagine interne | `{{IMG_SUBHEADER}}` |
| Servizio 1 – `{{SERVIZIO_1}}` | `{{IMG_SERVIZIO_1}}` |
| Servizio 2 – `{{SERVIZIO_2}}` | `{{IMG_SERVIZIO_2}}` |
| Servizio 3 – `{{SERVIZIO_3}}` | `{{IMG_SERVIZIO_3}}` |
| Servizio N – `{{SERVIZIO_N}}` | `{{IMG_SERVIZIO_N}}` |
| Galleria | tutte le immagini fornite (`{{ELENCO_IMMAGINI_GALLERIA}}`) |

> Se una sezione del template richiede un'immagine non indicata sopra (es. sezione "Chi siamo" o "Perché sceglierci"), usa una delle immagini fornite più coerente con il contenuto, senza mai riutilizzare immagini del template originale.

---

## 3. Template Kit
Usa come base grafica e strutturale il Template Kit Elementor allegato: `{{NOME_FILE_TEMPLATE_KIT}}`.

Regole generali:
- Mantieni stile, colori, tipografia, spaziature e animazioni del Template Kit.
- **Rimuovi tutte le sezioni non elencate** in questo prompt.
- Sostituisci tutti i testi segnaposto (lorem ipsum, nomi fittizi, contatti demo) con contenuti reali e coerenti con `{{NOME_SITO}}` e i suoi servizi.
- Tutti i testi devono essere in **italiano**, professionali e orientati alla conversione.
- Ogni pagina interna (tutte tranne la Home) deve avere il **subheader** del Template Kit con titolo della pagina e immagine `{{IMG_SUBHEADER}}`.

---

## 4. Header e Footer (template separati)

### Header
- Creato come template separato (Theme Builder → Header), secondo lo stile del Template Kit.
- Contiene: logo `{{LOGO}}`, menu di navigazione con le 5 pagine (Home, Chi Siamo, Servizi, Galleria, Contatti).
- Se il template lo prevede, mostra anche telefono ed email.

### Footer
- Creato come template separato (Theme Builder → Footer), secondo lo stile del Template Kit.
- Contiene: logo, breve descrizione dell'attività, link rapidi alle pagine, contatti (telefono, email, indirizzo).
- In fondo al footer: copyright `{{TESTO_COPYRIGHT}}`.

---

## 5. Pagine

### 5.1 Home
Sezioni, in quest'ordine:
1. **Hero / prima sezione** – esattamente come nel Template Kit, con immagine `{{IMG_HOME_HERO}}` e testi adattati al sito.
2. **Chi siamo** – breve testo di presentazione + pulsante **"Scopri di più"** che porta alla pagina *Chi Siamo*.
3. **Perché sceglierci** – punti di forza dell'attività (icone/box come da template).
4. **Call to action** – *solo se presente nel Template Kit*; con invito a contattare e link a *Contatti* o al telefono.
5. **I nostri servizi** – 3 servizi in evidenza (immagine, titolo, breve descrizione, link all'articolo del servizio) + pulsante **"Tutti i servizi"** che porta alla pagina *Servizi*.
6. **Recensioni** – testimonianze dei clienti come da template.

### 5.2 Chi Siamo
1. Subheader (titolo "Chi Siamo" + `{{IMG_SUBHEADER}}`).
2. **Chi siamo** – versione estesa: storia, missione, valori, esperienza.
3. **Perché sceglierci**.
4. **Call to action** – *solo se presente nel Template Kit*.
5. **Recensioni**.

### 5.3 Servizi
1. Subheader (titolo "Servizi" + `{{IMG_SUBHEADER}}`).
2. **Unica sezione: tutti i servizi** – griglia con immagine, titolo, breve estratto e link all'articolo di ciascun servizio.

### 5.4 Galleria
1. Subheader (titolo "Galleria" + `{{IMG_SUBHEADER}}`).
2. **Unica sezione: galleria** con tutte le immagini fornite (widget Galleria di Elementor, con lightbox).

### 5.5 Contatti
1. Subheader (titolo "Contatti" + `{{IMG_SUBHEADER}}`).
2. **Dati di contatto** – telefono (link `tel:`), email (link `mailto:`), indirizzo.
3. **Modulo di contatto** – sezione con widget Shortcode contenente il segnaposto `[contact-form-7 id="INSERIRE_ID" title="Modulo di contatto"]` (lo shortcode definitivo verrà inserito manualmente).
4. **Mappa** – iframe di Google Maps con l'indirizzo `{{INDIRIZZO}}`:

```html
<iframe src="https://www.google.com/maps?q={{INDIRIZZO_URL_ENCODED}}&output=embed" width="100%" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
```

---

## 6. Servizi come articoli
Ogni servizio deve essere un **articolo (post) separato**, con:
- Titolo: nome del servizio.
- Immagine in evidenza: l'immagine associata al servizio (vedi tabella al punto 2).
- Testo descrittivo originale in italiano di **minimo 300 caratteri** (ottimizzato SEO, con cosa comprende il servizio, a chi si rivolge e i vantaggi).
- Categoria: "Servizi".
- Se il Template Kit include un template per il singolo articolo, usalo; alla fine dell'articolo aggiungi una call to action verso la pagina *Contatti*.

---

## 7. Output richiesto
Fornisci:
1. File JSON di template Elementor per: Header, Footer, Home, Chi Siamo, Servizi, Galleria, Contatti (e, se previsto, Single Post).
2. Contenuti degli articoli dei servizi (titolo, testo, immagine associata), pronti da inserire o in formato importabile (XML WordPress).
3. Struttura del menu di navigazione.
4. Breve guida all'importazione: ordine di importazione dei template, assegnazione di Header/Footer tramite Theme Builder, impostazione della Home come pagina iniziale, punto in cui inserire lo shortcode di Contact Form 7.

## 8. Controlli finali
- Nessuna immagine o testo demo del template rimasto.
- Nessuna sezione extra oltre a quelle elencate.
- Tutti i pulsanti e i link puntano alle pagine corrette.
- Telefono, email e indirizzo identici in header, footer e pagina Contatti.
- Layout responsive verificato su desktop, tablet e mobile.
