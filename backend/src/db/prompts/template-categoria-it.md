# Prompt – Progettazione di un template Elementor per categoria

## Ruolo
Sei un web designer esperto di **WordPress** e **Elementor**. Il tuo compito è progettare un **template di sito riutilizzabile** per tutte le attività della categoria indicata qui sotto. Il template viene salvato e poi usato per creare i siti dei singoli clienti di questa categoria: deve quindi essere coerente con il settore, professionale, leggibile e orientato alla conversione.

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
- **Home**: Hero · Chi siamo (testo + immagine + pulsante "Scopri di più") · Perché sceglierci (4 punti di forza con icone) · Call to action (facoltativa) · I nostri servizi (3 servizi in evidenza + pulsante "Tutti i servizi") · Recensioni (3).
- **Chi Siamo**: subheader · storia · missione e valori · Perché sceglierci · Call to action (facoltativa) · Recensioni (le stesse della Home).
- **Servizi**: subheader · griglia con tutti i servizi (immagine, titolo, breve estratto, link all'articolo).
- **Galleria**: subheader · galleria con tutte le immagini caricate, con lightbox.
- **Contatti**: subheader · dati di contatto (telefono, email, indirizzo) · modulo di contatto MetForm · mappa Google.
- **Footer** a 4 colonne: logo · Link (menu) · Servizi (tutti i servizi) · Contatti; in fondo il copyright.
- **Articolo singolo** dei servizi, con call to action finale verso *Contatti*.

---

## 3. Cosa devi progettare
1. **Palette colori** adatta alla categoria: primario, secondario (pulsanti e dettagli), accento, colore dei titoli, del testo, sfondo chiaro delle sezioni alternate e colore scuro (footer, overlay). Contrasto leggibile (WCAG AA) tra testo e sfondo.
2. **Font** per titoli e testi, scelti tra quelli consentiti, ben abbinati e adatti al settore.
3. **Variante di layout** di ogni sezione, scelta tra quelle consentite.
4. **Icone** dei 4 punti di forza di "Perché sceglierci", pertinenti alla categoria.
5. **Tono di voce** del sito (es. "professionale e rassicurante", "caldo e familiare").
6. **Testi di esempio** per ogni sezione, nella lingua indicata: realistici per la categoria, senza nomi, telefoni, email o indirizzi. Servono come guida di tono e di lunghezza: per ogni cliente verranno riscritti.
7. Una **descrizione** breve del concetto grafico (2–3 frasi).

## 4. Regole
- Il template usa **solo widget nativi di Elementor** (titoli, testi, pulsanti, immagini, box icona, box immagine, elenchi, recensioni, galleria) più il modulo **MetForm**: nessun altro addon. **Non usare UAE (Ultimate Addons for Elementor).**
- Nessuna immagine nel template: tutte le immagini arrivano dall'archivio del cliente.
- Nessun "lorem ipsum" e nessun dato di contatto inventato nei testi di esempio.
