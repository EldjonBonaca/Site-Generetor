/**
 * Texts of the exported documentation (import guide, menu, final checks) in the site language.
 * Italian and English are provided; other languages use English.
 */
import { contactForm } from './plan.js';

const ORDER = { header: 0, footer: 1, single_post: 2, home: 3, about: 4, services: 5, gallery: 6, contact: 7 };
const sortedTemplates = (built) => [...built].sort((a, b) => (ORDER[a.page.role] ?? 9) - (ORDER[b.page.role] ?? 9));
const list = (arr) => arr.map((x) => `  - \`${x}\``).join('\n');
const PARTS = ['header', 'footer', 'single_post'];

// ---------------------------------------------------------------------------- IT
const IT = {
  instructionsFile: 'ISTRUZIONI.md',
  checksFile: 'CONTROLLI.md',

  chkDemoImages: (p, urls) => `**${p}**: immagini segnaposto del template ancora presenti (${urls.length}):\n${list(urls.slice(0, 8))}`,
  chkLinks: (p, urls) => `**${p}**: link che non puntano a pagine del sito:\n${list(urls.slice(0, 8))}`,
  chkLorem: (p) => `**${p}**: contiene ancora "Lorem ipsum".`,
  chkStats: '**Numeri chiave**: le cifre (anni di esperienza, clienti, tempi…) sono esempi realistici scritti dall\'AI: verificale con il cliente e correggile prima di pubblicare.',
  chkUnchanged: (p, n) => `**${p}**: ${n} testo/i non generato/i dall'AI (testo di esempio del template). Rigenera la pagina o modificali nell'anteprima.`,
  chkEmails: (p, vals) => `**${p}**: email diverse da quella del sito: ${vals.join(', ')}`,
  chkPostShort: (t, n) => `Articolo **${t}**: testo di soli ${n} caratteri (minimo 300).`,
  chkPostImage: (t) => `Articolo **${t}**: manca l'immagine in evidenza (assegna l'immagine al servizio).`,
  chkAllGood: 'Nessun problema trovato: nessuna immagine o testo di esempio, link interni corretti, contatti coerenti.',
  chkResponsive: 'Da verificare a mano dopo l\'importazione: layout responsive su desktop, tablet e mobile (Elementor → modalità responsive).',

  checksMd: (site, checks) => {
    const icon = { ok: '✅', info: 'ℹ️', warning: '⚠️', error: '❌' };
    return `# Controlli finali — ${site}\n\n${checks.map((c) => `- ${icon[c.level]} ${c.message}`).join('\n')}\n`;
  },

  menuMd: ({ ctx, menuItems }) =>
    `# Menu di navigazione — "${ctx.menu.name}"\n\nCreato automaticamente dal plugin o dal file \`wordpress-import.xml\` (slug \`${ctx.menu.slug}\`). L'header e il footer del template contengono già i link alle pagine.\n\n| # | Voce | Link |\n|---|---|---|\n${menuItems
      .map((m, i) => `| ${i + 1} | ${m.title} | \`${m.url}\` |`)
      .join('\n')}\n`,

  instructions: ({ ctx, built, posts, baseUrl, placeholder, category, menuItems, pluginFile, imageCount }) => {
    const templates = sortedTemplates(built);
    const parts = templates.filter((b) => PARTS.includes(b.page.role));
    const pages = templates.filter((b) => !PARTS.includes(b.page.role));
    const form = contactForm(ctx);
    const contact = pages.find((b) => b.page.role === 'contact');
    return `# Guida all'importazione — "${ctx.project.site_name}"

Questo pacchetto è stato generato da Elementor Site Generator con il template **${ctx.template.name}** (categoria *${ctx.template.category.name}*). Nulla è stato pubblicato.

Plugin necessari: **Elementor** e **${form.name}** (modulo di contatto). Il template usa solo widget nativi di Elementor: **non serve Ultimate Addons for Elementor (UAE)** né altri addon. Elementor Pro è facoltativo.

## Metodo rapido: plugin WordPress (consigliato)

1. Installa e attiva **Elementor**. Elementor Pro **non** è necessario.
2. **Plugin → Aggiungi nuovo plugin → Carica plugin** → scegli \`${pluginFile}\` → **Installa ora** → **Attiva**.
3. Si apre la pagina del plugin (**Strumenti → Sito ${ctx.project.site_name}**) e la creazione parte da sola. Il plugin:
   - installa da solo **${form.name}** e, se serve, il tema **Hello Elementor** (il tema per cui è pensato il template);
   - carica tutte le immagini (${imageCount}) nella Libreria Media;
   - crea le 5 pagine ${menuItems.map((m) => `**${m.title}**`).join(', ')} con Elementor (la Galleria mostra tutte le foto);
   - crea ${posts.length} articoli, uno per servizio, nella categoria **"${category.name}"** con immagine in evidenza, già impaginati con Elementor (hero con l'immagine, testo, barra laterale con **"Altri servizi"** e contatti) e con i **commenti disattivati**;
   - crea il modulo di contatto in ${form.name} (i messaggi arrivano a ${ctx.project.email}) e lo inserisce nella pagina **${contact?.page.title || 'Contatti'}**;
   - crea il menu **"${ctx.menu.name}"**, header e footer e applica i colori e i font del template. Con Elementor Pro usa il Theme Builder; **senza Pro header e footer vengono mostrati dal plugin stesso, che quindi deve restare attivo**;
   - imposta la Home come pagina iniziale e i permalink "Nome articolo".
4. Leggi i messaggi finali e controlla il sito su desktop, tablet e mobile (vedi \`CONTROLLI.md\`).

Puoi rieseguirlo da **Strumenti** ("Aggiorna il sito"): aggiorna le stesse pagine e gli stessi articoli senza duplicarli. Con il plugin l'URL base delle immagini **non serve**.

---

# Alternativa: importazione manuale

Segui i passaggi **in quest'ordine**.

## 0. Requisiti

- WordPress con **Elementor** attivo e **Elementor Pro** (Theme Builder per header, footer e articolo singolo), tema **Hello Elementor** consigliato.
- Plugin **${form.name}** (modulo contatti) e **WordPress Importer** (Strumenti → Importa → WordPress → Installa ora).
- **Impostazioni → Permalink → "Nome articolo"**: i link del sito usano indirizzi come \`/chi-siamo/\` e \`/${posts[0]?.slug || 'nome-servizio'}/\`.

## 1. Carica prima le immagini

I template usano questo indirizzo base per le immagini:

\`\`\`
${baseUrl}
\`\`\`
${placeholder ? "\n> ⚠️ Non è stato impostato un URL base: viene usato un indirizzo segnaposto (example.com). Imposta l'URL reale nel generatore (passo Download) ed esporta di nuovo.\n" : ''}
1. **Media → Aggiungi nuovo**: carica **tutti** i file della cartella \`images/\` (${imageCount} file) senza rinominarli.
2. Apri un'immagine caricata e controlla che l'URL sia \`${baseUrl}<nome-file>\`. Se WordPress l'ha messa in un'altra cartella mese (es. \`/2026/11/\`), cambia l'URL base nel generatore ed esporta di nuovo.

> Durante l'importazione Elementor e WordPress scaricano nella Libreria Media le immagini usate dai template e le immagini in evidenza: è normale vederle due volte. Puoi eliminare i doppioni caricati al punto 1 **dopo** aver completato tutti i passaggi.

## 2. Importa articoli, pagine e menu (\`wordpress-import.xml\`)

**Strumenti → Importa → WordPress** → seleziona \`wordpress-import.xml\` → assegna i contenuti al tuo utente → spunta **"Scarica e importa i file allegati"** → Invia.

Vengono creati:
- la categoria **"${category.name}"** e ${posts.length} articoli (uno per servizio) con testo e **immagine in evidenza**;
- le pagine vuote ${menuItems.map((m) => `**${m.title}**`).join(', ')} con i loro slug;
- il menu **"${ctx.menu.name}"** (vedi \`menu.md\`).

## 3. Importa i template Elementor (\`templates/*.json\`)

**Template → Template salvati → Importa template**, nell'ordine:

${templates.map((b, i) => `${i + 1}. \`templates/${b.page.key}.json\` — ${b.page.title}`).join('\n')}

## 4. Header, Footer e Articolo singolo (Theme Builder)

**Template → Theme Builder**:
${parts
  .map((b) =>
    b.page.role === 'header'
      ? '- **Header**: apri il template importato "Header" (o crea un Header e inseriscilo dalla cartella *I miei template*) → **Pubblica** → condizione **Intero sito**.'
      : b.page.role === 'footer'
        ? '- **Footer**: come sopra, condizione **Intero sito**. Logo, link, servizi, contatti e copyright sono già inseriti.'
        : `- **Articolo singolo**: crea un template *Single Post*, inserisci "${b.page.title}" → condizione **Articoli → nella categoria "${category.name}"** (hero con l'immagine in evidenza, barra laterale "Altri servizi"). Senza Elementor Pro puoi invece aprire ogni articolo con Elementor e importare il suo file \`templates/post-<servizio>.json\`, già impaginato.\n- **Commenti**: gli articoli importati hanno i commenti chiusi; per i nuovi articoli vai in **Impostazioni → Discussione** e togli "Permetti alle persone di inviare commenti sui nuovi articoli".`
  )
  .join('\n')}

## 5. Contenuto delle pagine

Per ogni pagina creata al punto 2: **Pagine → modifica con Elementor** → icona cartella → **I miei template** → **Inserisci** il template corrispondente → **Aggiorna**.

| Pagina | Template | Indirizzo |
|---|---|---|
${pages.map((b) => `| ${b.page.title} | \`templates/${b.page.key}.json\` | \`/${b.page.seo?.slug ? `${b.page.seo.slug}/` : ''}\` |`).join('\n')}

## 6. Home come pagina iniziale

**Impostazioni → Lettura** → "La homepage mostra: **Una pagina statica**" → Homepage: **${pages.find((b) => b.page.role === 'home')?.page.title || 'Home'}**.

## 7. Modulo di contatto (${form.name})

1. ${form.plugin === 'metform' ? '**MetForm → Forms → Add New**: crea il modulo con i campi nome, email, telefono, messaggio, consenso privacy e pulsante di invio, imposta la notifica email' : '**Contatto → Aggiungi nuovo**: crea il modulo con i campi nome, email, telefono, messaggio e consenso privacy, imposta il destinatario'} a ${ctx.project.email} e copia il suo shortcode.
2. Pagina **${contact?.page.title || 'Contatti'}** → modifica con Elementor → nella sezione del modulo c'è un **widget Shortcode** con il segnaposto:
   \`${form.placeholder}\`
3. Sostituiscilo con lo shortcode reale (o metti l'ID corretto al posto di \`INSERIRE_ID\`) → **Aggiorna**.

La mappa Google è già impostata con l'indirizzo: ${ctx.project.address.replace(/\n+/g, ', ')}.

## 8. Menu, SEO e controlli finali

- **Aspetto → Menu**: verifica il menu "${ctx.menu.name}".
- **SEO**: \`seo.csv\` contiene titolo, meta description e slug di ogni pagina e articolo (Yoast, Rank Math…).
- **Controlli**: leggi \`CONTROLLI.md\` e verifica il layout su desktop, tablet e mobile.
- Tutti i testi generati sono in \`content.md\`.

## Dati di contatto usati

- Nome: ${ctx.project.site_name}
- Telefono: ${ctx.project.phone}
- Email: ${ctx.project.email}
- Indirizzo: ${ctx.project.address.replace(/\n+/g, ', ')}
`;
  },
};

// ---------------------------------------------------------------------------- EN
const EN = {
  instructionsFile: 'INSTRUCTIONS.md',
  checksFile: 'CHECKS.md',

  chkDemoImages: (p, urls) => `**${p}**: template placeholder images still present (${urls.length}):\n${list(urls.slice(0, 8))}`,
  chkLinks: (p, urls) => `**${p}**: links not pointing to site pages:\n${list(urls.slice(0, 8))}`,
  chkLorem: (p) => `**${p}**: still contains "Lorem ipsum".`,
  chkStats: '**Key figures**: the numbers (years of experience, customers, times…) are realistic examples written by the AI: check them with the client and fix them before publishing.',
  chkUnchanged: (p, n) => `**${p}**: ${n} text(s) not generated by the AI (sample text of the template). Regenerate the page or edit them in the preview.`,
  chkEmails: (p, vals) => `**${p}**: emails different from the site email: ${vals.join(', ')}`,
  chkPostShort: (t, n) => `Article **${t}**: text is only ${n} characters (minimum 300).`,
  chkPostImage: (t) => `Article **${t}**: featured image missing (assign an image to the service).`,
  chkAllGood: 'No problems found: no sample images or texts, internal links valid, consistent contacts.',
  chkResponsive: 'To check by hand after importing: responsive layout on desktop, tablet and mobile (Elementor responsive mode).',

  checksMd: (site, checks) => {
    const icon = { ok: '✅', info: 'ℹ️', warning: '⚠️', error: '❌' };
    return `# Final checks — ${site}\n\n${checks.map((c) => `- ${icon[c.level]} ${c.message}`).join('\n')}\n`;
  },

  menuMd: ({ ctx, menuItems }) =>
    `# Navigation menu — "${ctx.menu.name}"\n\nCreated by the plugin or by \`wordpress-import.xml\` (slug \`${ctx.menu.slug}\`). The header and footer of the template already link to the pages.\n\n| # | Item | Link |\n|---|---|---|\n${menuItems
      .map((m, i) => `| ${i + 1} | ${m.title} | \`${m.url}\` |`)
      .join('\n')}\n`,

  instructions: ({ ctx, built, posts, baseUrl, placeholder, category, menuItems, pluginFile, imageCount }) => {
    const templates = sortedTemplates(built);
    const parts = templates.filter((b) => PARTS.includes(b.page.role));
    const pages = templates.filter((b) => !PARTS.includes(b.page.role));
    const form = contactForm(ctx);
    const contact = pages.find((b) => b.page.role === 'contact');
    return `# How to import "${ctx.project.site_name}" into WordPress + Elementor

This package was generated by Elementor Site Generator with the template **${ctx.template.name}** (category *${ctx.template.category.name}*). Nothing has been published.

Required plugins: **Elementor** and **${form.name}** (contact form). The template only uses native Elementor widgets: **Ultimate Addons for Elementor (UAE) and other addons are not needed**. Elementor Pro is optional.

## Fastest way: the WordPress plugin (recommended)

1. Install and activate **Elementor**. Elementor Pro is **not** needed.
2. **Plugins → Add New Plugin → Upload Plugin** → choose \`${pluginFile}\` → **Install Now** → **Activate**.
3. The plugin page opens (**Tools → Site ${ctx.project.site_name}**) and starts by itself. The plugin:
   - installs **${form.name}** by itself and, when needed, the **Hello Elementor** theme (the theme the template is designed for);
   - uploads all the images (${imageCount}) to the Media Library;
   - creates the 5 pages ${menuItems.map((m) => `**${m.title}**`).join(', ')} with Elementor (the Gallery shows every photo);
   - creates ${posts.length} articles, one per service, in the category **"${category.name}"** with a featured image, already designed with Elementor (hero with the image, text, sidebar with **"Other services"** and contacts) and with **comments disabled**;
   - creates the contact form in ${form.name} (messages are sent to ${ctx.project.email}) and puts it on the **${contact?.page.title || 'Contact'}** page;
   - creates the menu **"${ctx.menu.name}"**, the header and footer and applies the template colors and fonts. With Elementor Pro it uses the Theme Builder; **without Pro the header and footer are displayed by the plugin itself, so keep it active**;
   - sets Home as the front page and "Post name" permalinks.
4. Read the final messages and check the site on desktop, tablet and mobile (see \`CHECKS.md\`).

You can run it again from **Tools** ("Update the website"): it updates the same pages and articles without duplicating them. The images base URL is **not** needed with the plugin.

---

# Alternative: manual import

Follow the steps **in this order**.

## 0. Requirements

- WordPress with **Elementor** and **Elementor Pro** (Theme Builder for header, footer and single post); the **Hello Elementor** theme is recommended.
- **${form.name}** and the **WordPress Importer** (Tools → Import → WordPress → Install now).
- **Settings → Permalinks → "Post name"**: site links use addresses such as \`/${posts[0]?.slug || 'service-name'}/\`.

## 1. Upload the images first

Templates use this images base URL:

\`\`\`
${baseUrl}
\`\`\`
${placeholder ? '\n> ⚠️ No base URL was configured: a placeholder (example.com) is used. Set your real uploads URL in the generator (Download step) and export again.\n' : ''}
1. **Media → Add New**: upload **all** files in \`images/\` (${imageCount} files) keeping their names.
2. Check that an uploaded image URL is \`${baseUrl}<file-name>\`; if WordPress used another month folder, change the base URL in the generator and export again.

> While importing, Elementor and WordPress download the images used by templates and featured images into the Media Library, so you may see each image twice. You can delete the copies from step 1 **after** finishing.

## 2. Import articles, pages and menu (\`wordpress-import.xml\`)

**Tools → Import → WordPress** → choose \`wordpress-import.xml\` → assign to your user → tick **"Download and import file attachments"** → Submit.

This creates the category **"${category.name}"** with ${posts.length} articles (one per service, with **featured image**), the empty pages ${menuItems.map((m) => `**${m.title}**`).join(', ')} and the menu **"${ctx.menu.name}"** (see \`menu.md\`).

## 3. Import the Elementor templates (\`templates/*.json\`)

**Templates → Saved Templates → Import Templates**, in this order:

${templates.map((b, i) => `${i + 1}. \`templates/${b.page.key}.json\` — ${b.page.title}`).join('\n')}

## 4. Header, footer and single post (Theme Builder)

${parts
  .map((b) =>
    b.page.role === 'header'
      ? '- **Header**: open/insert the imported "Header" template → **Publish** → condition **Entire Site**.'
      : b.page.role === 'footer'
        ? '- **Footer**: same, condition **Entire Site**. Logo, links, services, contacts and copyright are already in it.'
        : `- **Single post**: create a *Single Post* template, insert "${b.page.title}" → condition **Posts → in category "${category.name}"** (hero with the featured image, "Other services" sidebar). Without Elementor Pro you can instead open each article with Elementor and import its file \`templates/post-<service>.json\`, already designed.\n- **Comments**: the imported articles have comments closed; for new articles go to **Settings → Discussion** and untick "Allow people to submit comments on new posts".`
  )
  .join('\n')}

## 5. Page content

For each page created in step 2: **Pages → Edit with Elementor** → folder icon → **My Templates** → **Insert** the matching template → **Update**.

| Page | Template | Address |
|---|---|---|
${pages.map((b) => `| ${b.page.title} | \`templates/${b.page.key}.json\` | \`/${b.page.seo?.slug ? `${b.page.seo.slug}/` : ''}\` |`).join('\n')}

## 6. Home as front page

**Settings → Reading** → "Your homepage displays: **A static page**" → Homepage: **${pages.find((b) => b.page.role === 'home')?.page.title || 'Home'}**.

## 7. Contact form (${form.name})

Create the form in ${form.name} (name, email, phone, message, privacy consent, send button; notifications to ${ctx.project.email}), copy its shortcode, then edit **${contact?.page.title || 'Contact'}** with Elementor: replace the placeholder in the **Shortcode widget** \`${form.placeholder}\` with the real shortcode. The Google map already uses your address.

## 8. Menu, SEO and final checks

- **Appearance → Menus**: check "${ctx.menu.name}".
- \`seo.csv\`: title, meta description and slug of every page and article.
- Read \`CHECKS.md\` and check the layout on desktop, tablet and mobile. All texts are in \`content.md\`.
`;
  },
};

export const docsText = (lang) => (lang === 'it' ? IT : EN);
