/**
 * The contact form of a copied page keeps its look.
 *
 * The form of the other site cannot work on the new one (it posts to that site), so the form of the new
 * site takes its place. A plain Contact Form 7 form there would lose the design: the CSS of the page is
 * written for the markup of its own form (its rows, columns and classes). So the markup of the original
 * form is kept as a template, with a marker where each field was:
 *
 *   <div class="contact-form-row"><div class="contact-form-col">⟨name⟩⟨email⟩⟨phone⟩</div>
 *   <div class="contact-form-col">⟨message⟩<div class="accetto-termini">⟨consent⟩</div></div></div>⟨submit⟩
 *
 * and the form of the new site is written from it: as a Contact Form 7 form (cf7FromTemplate: its tags in
 * the same places, with the classes of the original fields) or as plain HTML for a website made with code
 * (htmlFromTemplate). The texts of the fields are the ones of the generator, in the language of the site.
 */
import { parse } from 'node-html-parser';

const tagOf = (n) => (n.rawTagName || '').toLowerCase();
const MARK = (i) => `<esg-f i="${i}"></esg-f>`;
const MARK_RE = /<esg-f i="(\d+)"><\/esg-f>/g;

/** Classes of a field written by the designer of the site (the ones Contact Form 7 adds itself are left out). */
const ownClasses = (el) => (el.getAttribute('class') || '').split(/\s+/).filter((c) => c && /^[\w-]+$/.test(c) && !/^(wpcf7|init$|sent$|invalid$|failed$|has-spinner$|submitting$|resetting$)/.test(c));

/** The contact form of a piece of HTML: the first form with a message box or at least three fields. { start, end, html } or null. */
export function contactFormRegion(html) {
  const re = /<form\b[^>]*>[\s\S]*?<\/form>/gi;
  for (let m; (m = re.exec(html)); ) {
    const fields = (m[0].match(/<(input|textarea|select)\b[^>]*>/gi) || []).filter((f) => !/type=["']?(hidden|submit|button|image|reset)/i.test(f));
    if (/<textarea\b/i.test(m[0]) || fields.length >= 3) return { start: m.index, end: m.index + m[0].length, html: m[0] };
  }
  return null;
}

/**
 * The template of a form: { wrapClass, markup, fields }.
 * fields[i]: { kind: 'name' | 'email' | 'phone' | 'message' | 'consent' | 'submit' | 'extra', classes, required, placeholder, plainType }
 * Null when the form has no e-mail field or nothing to write in (not a contact form the site can answer).
 */
export function formTemplate(formHtml) {
  const root = parse(formHtml);
  const form = root.querySelector('form');
  if (!form) return null;
  // What Contact Form 7, anti-spam plugins and scripts add around the fields
  for (const el of form.querySelectorAll('input[type="hidden"], fieldset.hidden-fields-container, .akismet-fields-container, .wpcf7-response-output, .wpcf7-spinner, .screen-reader-response, .wpcf7-not-valid-tip, [class*="captcha" i], [class*="honeypot" i], select, input[type="radio"], input[type="file"], input[type="reset"], script, style')) el.remove();
  for (const el of form.querySelectorAll('[style]')) if (/display\s*:\s*none/i.test(el.getAttribute('style'))) el.remove();

  const fields = [];
  const used = new Set();
  const put = (el, field) => {
    fields.push(field);
    el.parentNode.exchangeChild(el, parse(MARK(fields.length - 1)).firstChild);
  };
  const once = (kind) => (used.has(kind) ? 'extra' : (used.add(kind), kind));
  for (const el of form.querySelectorAll('input, textarea, button')) {
    if (!el.parentNode) continue; // removed with its wrapper
    const tag = tagOf(el);
    const type = (el.getAttribute('type') || (tag === 'button' ? 'submit' : 'text')).toLowerCase();
    const hint = `${el.getAttribute('name') || ''} ${el.getAttribute('placeholder') || ''} ${el.getAttribute('id') || ''} ${el.getAttribute('autocomplete') || ''}`.toLowerCase();
    const required = el.getAttribute('required') !== undefined || el.getAttribute('aria-required') === 'true' || /required|richiesto|\*/.test(hint);
    // plainType: the phone was a plain text field on the page (its CSS may style input[type=text] only)
    const base = { classes: ownClasses(el), required, placeholder: (el.getAttribute('placeholder') || '').trim(), plainType: type !== 'tel' };
    if (type === 'submit' || tag === 'button') {
      if (used.has('submit')) el.remove();
      else put(el, { ...base, kind: once('submit') });
    } else if (type === 'checkbox') {
      // The consent: the whole control with its label
      const whole = el.closest('.wpcf7-acceptance') || el.closest('label') || el;
      if (used.has('consent')) whole.remove();
      else put(whole.closest('.wpcf7-form-control-wrap') || whole, { ...base, kind: once('consent'), classes: [] });
    } else if (tag === 'textarea') put(el, { ...base, kind: once('message') });
    else if (type === 'email' || /e-?mail/.test(hint)) put(el, { ...base, kind: once('email') });
    else if (type === 'tel' || /tel|phone|cell|mobile|numero|number/.test(hint)) put(el, { ...base, kind: once('phone') });
    else if (/^(text|search|url|number|)$/.test(type)) put(el, { ...base, kind: once('name') });
    else el.remove();
  }
  if (!used.has('email') || !(used.has('message') || used.has('name'))) return null;
  // A form without button gets one at the end
  if (!used.has('submit')) {
    fields.push({ kind: 'submit', classes: [], required: false, placeholder: '' });
    form.appendChild(parse(MARK(fields.length - 1)).firstChild);
  }
  const markup = form.innerHTML
    .replace(/<span class="wpcf7-form-control-wrap"[^>]*>\s*(<esg-f i="\d+"><\/esg-f>)\s*<\/span>/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return { wrapClass: ownClasses(form).join(' '), markup, fields };
}

const cf7Text = (s) => String(s).replace(/"/g, "'").replace(/[\[\]]/g, '');

/**
 * The Contact Form 7 form written from a template: { form, body, replyTo } (form: its tags inside the markup of the
 * original form, on one line so Contact Form 7 adds no paragraphs).
 * texts: { name: [label, placeholder], email, phone, message, consent, submit } in the language of the site.
 */
export function cf7FromTemplate(template, texts) {
  const cls = (f) => f.classes.map((c) => ` class:${c}`).join('');
  let extra = 0;
  const extras = [];
  const tag = (f) => {
    if (f.kind === 'name') return `[text* your-name autocomplete:name${cls(f)} placeholder "${cf7Text(texts.name[1])}"]`;
    if (f.kind === 'email') return `[email* your-email autocomplete:email${cls(f)} placeholder "${cf7Text(texts.email[1])}"]`;
    if (f.kind === 'phone') return `[${f.plainType ? 'text' : 'tel'} your-phone autocomplete:tel${cls(f)} placeholder "${cf7Text(texts.phone[1])}"]`;
    if (f.kind === 'message') return `[textarea* your-message${cls(f)} placeholder "${cf7Text(texts.message[1])}"]`;
    if (f.kind === 'consent') return `[acceptance your-consent] ${texts.consent} [/acceptance]`;
    if (f.kind === 'submit') return `[submit${cls(f)} "${cf7Text(texts.submit)}"]`;
    extra += 1;
    extras.push({ name: `your-field-${extra}`, label: f.placeholder || `Campo ${extra}` });
    return `[text your-field-${extra}${cls(f)}${f.placeholder ? ` placeholder "${cf7Text(f.placeholder)}"` : ''}]`;
  };
  const form = template.markup.replace(MARK_RE, (m, i) => tag(template.fields[Number(i)]));
  const has = (kind) => template.fields.some((f) => f.kind === kind);
  const body = [
    has('name') ? `${texts.name[0]}: [your-name]` : null,
    `${texts.email[0]}: [your-email]`,
    has('phone') ? `${texts.phone[0]}: [your-phone]` : null,
    ...extras.map((e) => `${cf7Text(e.label)}: [${e.name}]`),
    ...(has('message') ? ['', `${texts.message[0]}:`, '[your-message]'] : []),
  ]
    .filter((line) => line !== null)
    .join('\n');
  return { form, body, replyTo: has('name') ? 'Reply-To: [your-name] <[your-email]>' : 'Reply-To: [your-email]' };
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The same form as plain HTML (a website made with code), in the markup Contact Form 7 writes, so the
 * CSS of the page styles it the same way. Field names: name, email, phone, message, privacy (send.php).
 * texts: { name, email, phone, message, privacy, send } (static/render.js).
 */
export function htmlFromTemplate(template, texts) {
  const cls = (f, own) => ['wpcf7-form-control', own, ...f.classes].filter(Boolean).join(' ');
  let extra = 0;
  const control = (f) => {
    if (f.kind === 'name') return `<input class="${cls(f, 'wpcf7-text')}" type="text" name="name" autocomplete="name" placeholder="${esc(texts.name)}" required>`;
    if (f.kind === 'email') return `<input class="${cls(f, 'wpcf7-text wpcf7-email')}" type="email" name="email" autocomplete="email" placeholder="${esc(texts.email)}" required>`;
    if (f.kind === 'phone') return `<input class="${cls(f, f.plainType ? 'wpcf7-text' : 'wpcf7-text wpcf7-tel')}" type="${f.plainType ? 'text' : 'tel'}" inputmode="tel" name="phone" autocomplete="tel" placeholder="${esc(texts.phone)}">`;
    if (f.kind === 'message') return `<textarea class="${cls(f, 'wpcf7-textarea')}" name="message" rows="6" placeholder="${esc(texts.message)}" required></textarea>`;
    if (f.kind === 'consent') return `<span class="wpcf7-form-control wpcf7-acceptance"><span class="wpcf7-list-item"><label><input type="checkbox" name="privacy" value="1" required><span class="wpcf7-list-item-label">${esc(texts.privacy)}</span></label></span></span>`;
    if (f.kind === 'submit') return `<input class="${cls(f, 'wpcf7-submit')}" type="submit" value="${esc(texts.send)}">`;
    extra += 1;
    return `<input class="${cls(f, 'wpcf7-text')}" type="text" name="field${extra}" placeholder="${esc(f.placeholder)}">`;
  };
  return template.markup.replace(MARK_RE, (m, i) => `<span class="wpcf7-form-control-wrap">${control(template.fields[Number(i)])}</span>`);
}
