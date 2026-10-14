/**
 * Visual sketch of a template (its Home page) drawn from the spec: colors, fonts, the look of the
 * site (theme, buttons, cards, titles, images) and the layout of every section, like the site
 * builder (backend/src/templates/builder.js). Fonts are only named (no request to Google Fonts)
 * and photos are drawn as gradients: the real site uses the project images.
 */
import { ImageIcon, Quote, Star } from 'lucide-react';
import { cx } from './ui.jsx';

// Same color rules as the site builder (backend/src/templates/spec.js)
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => `rgb(${rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t)).join(',')})`;
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const onColor = (bg, dark) => (1.05 / (luminance(bg) + 0.05) >= 3 ? '#fff' : dark);

const Lines = ({ n = 2, color, width = '100%', center = false }) => (
  <div className={cx('space-y-1', center && 'flex flex-col items-center')} style={{ width }}>
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="h-1 rounded-full" style={{ background: color, opacity: 0.35, width: i === n - 1 ? '70%' : '100%' }} />
    ))}
  </div>
);

/** Bottom edge of the hero ("divider" layout), in the color of the next section. */
const Edge = ({ shape, color }) => {
  const paths = {
    curve: 'M0 20 Q50 0 100 20 Z',
    tilt: 'M0 20 L100 4 L100 20 Z',
    waves: 'M0 20 L0 12 Q12.5 4 25 12 T50 12 T75 12 T100 12 L100 20 Z',
  };
  if (!paths[shape]) return null;
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-3 w-full">
      <path d={paths[shape]} fill={color} />
    </svg>
  );
};

export function TemplatePreview({ spec, compact = false, className }) {
  if (!spec) return null;
  const st = spec.style;
  const { colors: c, fonts, radius, headingWeight } = st;
  const l = spec.layout;
  const copy = spec.copy;
  const dark = st.theme === 'dark';
  const ink = dark
    ? { bg: c.dark, alt: mix(c.dark, '#ffffff', 0.04), card: mix(c.dark, '#ffffff', 0.08), tint: mix(c.dark, c.primary, 0.3), heading: '#fff', text: '#ffffff', kicker: c.secondary, border: '#ffffff26' }
    : { bg: '#fff', alt: c.background, card: '#fff', tint: mix(c.primary, '#ffffff', 0.93), heading: c.heading, text: c.text, kicker: c.primary, border: mix(c.heading, '#ffffff', 0.86) };
  const r = Math.min(radius, 10);
  const btnR = st.buttons === 'pill' ? 999 : st.buttons === 'square' ? 0 : r;
  const imgR = st.images === 'rounded' ? Math.max(r, 4) : 0;
  const scale = { normal: 1, large: 1.12, xl: 1.28 }[st.scale] || 1;
  const upper = st.titleCase === 'upper' ? 'uppercase' : 'none';
  const left = st.align === 'left' || st.titles === 'bar';
  const head = { fontFamily: `'${fonts.heading}', ui-sans-serif, system-ui, sans-serif`, fontWeight: Number(headingWeight), color: ink.heading };
  const body = { fontFamily: `'${fonts.body}', ui-sans-serif, system-ui, sans-serif`, color: ink.text };
  const mainBg = dark ? c.secondary : c.primary;
  const pad = { compact: 'py-3', normal: 'py-4', airy: 'py-6' }[st.spacing] || 'py-4';

  const btn = (bg, label, outline, fg) => (
    <span
      className="inline-block px-2 py-1 text-[8px] font-semibold"
      style={{ background: outline ? 'transparent' : bg, color: fg || (outline ? bg : onColor(bg, c.dark)), borderRadius: btnR, border: outline ? `1px solid ${fg || bg}` : 'none', textTransform: st.uppercase ? 'uppercase' : 'none' }}
    >
      {label}
    </span>
  );
  const Photo = ({ className: cls, style, frame }) => (
    <div
      className={cx('flex shrink-0 items-center justify-center', cls)}
      style={{ background: `linear-gradient(135deg, ${c.dark}, ${c.primary})`, borderRadius: imgR, boxShadow: frame && st.images === 'framed' ? `5px 5px 0 ${c.secondary}` : undefined, ...style }}
    >
      <ImageIcon className="size-4 text-white/40" />
    </div>
  );
  /** Card look: shadow, outline, tinted or accent border (on: 'alt' | 'photo' | 'base'). */
  const card = (on = 'base') => {
    const tinted = st.cards === 'tinted' && on !== 'photo';
    return {
      background: tinted ? (on === 'alt' ? ink.card : ink.tint) : ink.card,
      borderRadius: st.buttons === 'square' && st.images !== 'rounded' ? Math.min(r, 2) : r,
      boxShadow: st.cards === 'shadow' ? '0 2px 6px rgba(0,0,0,.14)' : st.cards === 'accent' ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
      border: st.cards === 'outline' ? `1px solid ${ink.border}` : 'none',
      borderTop: st.cards === 'accent' ? `2px solid ${c.secondary}` : st.cards === 'outline' ? `1px solid ${ink.border}` : 'none',
    };
  };
  /** Section title: small label, title + accent line / side bar / nothing. */
  const title = (kicker, text, { light = false, center = !left } = {}) => (
    <div className={cx('flex flex-col gap-0.5', center ? 'items-center text-center' : 'items-start')}>
      {kicker && (
        <p className="text-[6px] font-bold tracking-wider uppercase" style={{ color: light ? c.secondary : ink.kicker }}>
          {kicker}
        </p>
      )}
      <p
        className="leading-tight"
        style={{ ...head, fontSize: 10 * scale, color: light ? '#fff' : ink.heading, textTransform: upper, ...(st.titles === 'bar' ? { borderLeft: `2px solid ${c.secondary}`, paddingLeft: 4 } : {}) }}
      >
        {text}
      </p>
      {st.titles === 'line' && <span className="mt-0.5 h-0.5 w-4 rounded-full" style={{ background: c.secondary }} />}
    </div>
  );
  const menu = (color) => (
    <div className="flex gap-2 text-[7px] font-semibold" style={{ ...body, color }}>
      {['Home', 'Chi Siamo', 'Servizi', 'Galleria', 'Contatti'].map((m) => (
        <span key={m}>{m}</span>
      ))}
    </div>
  );

  // --- Header ---
  const bold = l.header === 'bold';
  const headerBg = bold ? c.primary : ink.bg;
  const menuColor = bold ? onColor(c.primary, c.dark) : ink.heading;
  const logo = <div className="h-3 w-12" style={{ background: bold ? menuColor : c.primary, borderRadius: Math.min(btnR, 3) }} />;

  // --- Hero ---
  const heroTitle = (color, size = 14) => (
    <p className="leading-tight" style={{ ...head, color, fontSize: size * scale, textTransform: upper }}>
      {copy.heroTitle}
    </p>
  );
  const heroKicker = (color) => (
    <p className="text-[7px] font-semibold tracking-wider uppercase" style={{ color }}>
      {copy.heroKicker}
    </p>
  );
  const photoBg = (overlay) => ({ background: `${overlay}, linear-gradient(135deg, ${c.primary}, ${c.dark})` });
  let hero;
  if (l.hero === 'split') {
    hero = (
      <div className="flex items-center gap-3 px-4 py-6" style={{ background: ink.alt }}>
        <div className="flex-1 space-y-1">
          {heroKicker(ink.kicker)}
          {heroTitle(ink.heading)}
          <div className="flex gap-1.5 pt-1">
            {btn(mainBg, copy.heroButton)}
            {btn(ink.heading, copy.heroButton2, true)}
          </div>
        </div>
        <Photo className="h-24 w-2/5" frame />
      </div>
    );
  } else if (l.hero === 'card') {
    hero = (
      <div className="relative px-4 pt-6 pb-8" style={photoBg(`linear-gradient(90deg, ${c.dark}66, ${c.dark}22)`)}>
        <div className="w-3/5 space-y-1 p-3" style={card('photo')}>
          {heroKicker(ink.kicker)}
          {heroTitle(ink.heading, 13)}
          <div className="flex gap-1.5 pt-1">
            {btn(mainBg, copy.heroButton)}
            {btn(ink.heading, copy.heroButton2, true)}
          </div>
        </div>
        <Edge shape={l.divider} color={ink.bg} />
      </div>
    );
  } else {
    const bottom = l.hero === 'bottom';
    const center = l.hero === 'center';
    hero = (
      <div
        className={cx('relative flex flex-col px-4 pb-9', bottom ? 'min-h-36 justify-end pt-14' : 'pt-8', center && 'items-center text-center')}
        style={photoBg(bottom ? `linear-gradient(180deg, ${c.dark}11, ${c.dark}f0)` : center ? `linear-gradient(180deg, ${c.dark}aa, ${c.dark}dd)` : `linear-gradient(90deg, ${c.dark}ee, ${c.dark}44)`)}
      >
        {heroKicker(c.secondary)}
        <div className={cx('mt-1', center ? 'max-w-[85%]' : 'max-w-[70%]')}>{heroTitle('#fff', bottom ? 17 : 14)}</div>
        <div className="mt-2 flex gap-1.5">
          {btn(c.secondary, copy.heroButton)}
          {btn('#ffffff', copy.heroButton2, true, '#fff')}
        </div>
        <Edge shape={l.divider} color={ink.bg} />
      </div>
    );
  }

  // --- About ---
  const aboutText = (
    <div className="flex-1 space-y-1.5">
      {title(copy.aboutKicker, copy.aboutTitle, { center: false })}
      <Lines n={3} color={ink.text} />
      {btn(mainBg, copy.aboutButton)}
    </div>
  );
  const about =
    l.about === 'wide' ? (
      <div className={cx('space-y-2 px-4', pad)} style={{ background: ink.bg }}>
        <div className="mx-auto w-4/5">{aboutText}</div>
        <Photo className="h-14 w-full" frame />
      </div>
    ) : (
      <div className={cx('flex items-center gap-3 px-4', pad, l.about === 'image-right' && 'flex-row-reverse')} style={{ background: ink.bg }}>
        <Photo className="h-16 w-2/5" frame />
        {aboutText}
      </div>
    );

  // --- Why choose us ---
  const featureItem = (f, i, cardOn) => (
    <div key={i} className={cx('flex gap-1 p-1.5', cardOn ? 'flex-col items-center text-center' : 'items-start')} style={cardOn ? card(cardOn) : undefined}>
      {/* Font Awesome is not loaded in the app: the icon name is shown on hover */}
      <span title={spec.icons[i]} className="flex size-4 shrink-0 items-center justify-center" style={{ background: dark ? `${c.secondary}29` : `${c.primary}26`, borderRadius: st.buttons === 'square' ? 2 : 999 }}>
        <span className="size-1.5 rounded-full" style={{ background: dark ? c.secondary : c.primary }} />
      </span>
      <span className="space-y-0.5">
        <span className="block text-[7px] leading-tight" style={head}>
          {f.title}
        </span>
        <span className="block text-[5px] leading-tight" style={{ ...body, opacity: dark ? 0.75 : 1 }}>
          {f.text}
        </span>
      </span>
    </div>
  );
  let why;
  if (l.features === 'list') {
    why = (
      <div className={cx('flex gap-3 px-4', pad)} style={{ background: ink.bg }}>
        <div className="w-1/3">{title(copy.featuresKicker, copy.featuresTitle, { center: false })}</div>
        <div className="grid flex-1 grid-cols-2 gap-1.5">{copy.features.map((f, i) => featureItem(f, i, null))}</div>
      </div>
    );
  } else {
    const onPhoto = l.features === 'cards';
    why = (
      <div className={cx('px-4', pad)} style={onPhoto ? photoBg(`linear-gradient(180deg, ${c.dark}ee, ${c.dark}cc)`) : { background: ink.alt }}>
        {title(copy.featuresKicker, copy.featuresTitle, { light: onPhoto })}
        <div className="mt-2 grid grid-cols-4 gap-1.5">{copy.features.map((f, i) => featureItem(f, i, onPhoto ? 'photo' : 'alt'))}</div>
      </div>
    );
  }

  // --- Call to action ---
  const ctaTitle = (
    <p style={{ ...head, color: '#fff', fontSize: 10 * scale, textTransform: upper }} className="leading-tight">
      {copy.ctaTitle}
    </p>
  );
  const cta =
    l.cta === 'banner' ? (
      <div className="flex flex-col items-center gap-1.5 px-4 py-4 text-center" style={photoBg(`linear-gradient(135deg, ${c.primary}ee, ${c.dark}e6)`)}>
        {ctaTitle}
        {btn(c.secondary, copy.ctaButton)}
      </div>
    ) : l.cta === 'split' ? (
      <div className="px-4 py-2" style={{ background: ink.bg }}>
        <div className="flex items-center justify-between gap-2 px-3 py-3" style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.dark})`, borderRadius: r }}>
          {ctaTitle}
          {btn(c.secondary, copy.ctaButton)}
        </div>
      </div>
    ) : null;

  // --- Services ---
  const boxed = l.services === 'boxed';
  const services = (
    <div className={cx('px-4', pad)} style={{ background: boxed ? ink.alt : ink.bg }}>
      {title(copy.servicesKicker, copy.servicesTitle)}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) =>
          l.services === 'overlay' ? (
            <div key={i} className="flex h-16 flex-col justify-end p-1.5" style={{ ...photoBg(`linear-gradient(180deg, ${c.dark}11, ${c.dark}ee)`), borderRadius: imgR }}>
              <div className="h-1.5 w-2/3 rounded-full bg-white" />
              <p className="mt-1 text-[5px] font-semibold" style={{ color: c.secondary }}>
                Scopri di più →
              </p>
            </div>
          ) : (
            <div key={i} className="overflow-hidden text-left" style={card(boxed ? 'alt' : 'base')}>
              <Photo className="h-8 w-full" style={{ borderRadius: 0 }} />
              <div className="space-y-1 p-1.5">
                <div className="h-1.5 w-2/3 rounded-full" style={{ background: ink.heading }} />
                <Lines n={2} color={ink.text} />
                <p className="text-[5px] font-semibold" style={{ color: ink.kicker }}>
                  Scopri di più →
                </p>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );

  // --- Reviews (no photos of the customers) ---
  const band = l.testimonials === 'band';
  const cards = l.testimonials === 'cards';
  const reviews = (
    <div className={cx('px-4', pad)} style={band ? { background: `linear-gradient(135deg, ${c.primary}, ${c.dark})` } : { background: cards ? ink.alt : ink.bg }}>
      {title(copy.reviewsKicker, copy.reviewsTitle, { light: band })}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {copy.reviews.map((rv, i) => (
          <div key={i} className={cx('flex flex-col gap-1 p-1.5', cards ? 'items-start' : 'items-center')} style={cards ? card('alt') : undefined}>
            <Quote className="size-2.5" style={{ color: c.secondary }} fill={c.secondary} stroke="none" />
            <span className="flex gap-px">
              {[0, 1, 2, 3, 4].map((s) => (
                <Star key={s} className="size-1.5" fill={c.secondary} stroke="none" />
              ))}
            </span>
            <Lines n={2} color={band ? '#ffffff' : ink.text} center={!cards} />
            <span className="text-[6px] font-semibold" style={{ ...head, color: band ? '#fff' : ink.heading }}>
              {rv.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  // --- Footer ---
  const lightFooter = l.footer === 'light';
  const footerBg = lightFooter ? ink.alt : l.footer === 'brand' ? `linear-gradient(135deg, ${c.primary}, ${c.dark})` : dark ? mix(c.dark, '#000000', 0.4) : c.dark;
  const footerText = lightFooter ? ink.heading : '#fff';

  return (
    <div className={cx('overflow-hidden rounded-lg border border-slate-200 text-left select-none', compact && 'pointer-events-none h-72', className)} style={{ background: ink.bg }} aria-hidden="true">
      {l.header === 'topbar' && <div className="flex justify-end gap-3 px-3 py-0.5 text-[6px] text-white/80" style={{ background: dark ? '#000' : c.dark }}>☎ 000 000 000 · ✉ info@…</div>}
      {l.header === 'centered' ? (
        <div className="relative z-10 flex flex-col items-center gap-1.5 py-2 shadow-sm" style={{ background: headerBg }}>
          {logo}
          {menu(menuColor)}
        </div>
      ) : (
        <div className="relative z-10 flex items-center justify-between px-3 py-2 shadow-sm" style={{ background: headerBg }}>
          {logo}
          {menu(menuColor)}
          {btn(bold ? c.secondary : mainBg, copy.headerButton)}
        </div>
      )}
      {hero}
      {about}
      {why}
      {cta}
      {services}
      {reviews}
      <div style={{ background: footerBg }}>
        <div className="grid grid-cols-4 gap-2 px-4 py-3">
          <div className="h-3 w-10 rounded-sm" style={{ background: lightFooter ? c.primary : '#fff', opacity: 0.85 }} />
          {['Link', 'Servizi', 'Contatti'].map((t) => (
            <div key={t} className="space-y-1">
              <p className="text-[7px] font-semibold" style={{ ...head, color: footerText }}>
                {t}
              </p>
              <span className="block h-0.5 w-3 rounded-full" style={{ background: c.secondary }} />
              <Lines n={3} color={lightFooter ? ink.text : '#ffffff'} width="80%" />
            </div>
          ))}
        </div>
        <div className="border-t px-4 py-1 text-center text-[5px]" style={{ borderColor: lightFooter ? '#0000001a' : '#ffffff1f', color: lightFooter ? ink.text : '#ffffffb3', background: l.footer === 'brand' ? c.dark : undefined }}>
          © {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}

/** Color swatches + font names of a template (+ its design direction). */
export function TemplateSwatches({ spec, direction }) {
  if (!spec) return null;
  const { colors, fonts } = spec.style;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex">
        {['primary', 'secondary', 'accent', 'heading', 'background', 'dark'].map((k) => (
          <span key={k} title={`${k}: ${colors[k]}`} className="-ml-1 size-4 rounded-full ring-2 ring-white first:ml-0" style={{ background: colors[k] }} />
        ))}
      </span>
      <span className="text-xs text-slate-500">
        {fonts.heading} / {fonts.body}
      </span>
      {direction && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{direction}</span>}
    </div>
  );
}
