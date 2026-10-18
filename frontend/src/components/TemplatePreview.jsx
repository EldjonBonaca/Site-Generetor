/**
 * Visual sketch of a template (its Home page) drawn from the spec: colors, fonts, the look of the
 * site (theme, buttons, cards, titles, images), the layout of every section and the Home sections
 * in the order of the template, like the site
 * builder (backend/src/templates/builder.js). The fonts of the template are loaded from Google
 * Fonts (like Elementor does on the site); photos are drawn as gradients: the real site uses the
 * project images.
 */
import { Fragment, useEffect } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ImageIcon, Plus, Quote, Star } from 'lucide-react';
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

// Same rule as the site builder (featureCount in backend/src/templates/spec.js): the strengths of
// "why choose us" shown by its layout, the count of the template or the nearest one it can arrange
const FEATURE_COUNTS = { icons: [3, 4, 5, 6], cards: [3, 4, 5, 6], list: [4, 6], bento: [3, 4, 5], split: [3, 4, 5], center: [4, 6] };
export function featureCount(layout) {
  const want = Number(layout?.featureCount) || 4;
  return (FEATURE_COUNTS[layout?.features] || [4]).reduce((best, n) => (Math.abs(n - want) < Math.abs(best - want) ? n : best));
}

const Lines = ({ n = 2, color, width = '100%', center = false }) => (
  <div className={cx('space-y-1', center && 'flex flex-col items-center')} style={{ width }}>
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="h-1 rounded-full" style={{ background: color, opacity: 0.35, width: i === n - 1 ? '70%' : '100%' }} />
    ))}
  </div>
);

const zigzag = `M0 20 L0 14 ${Array.from({ length: 20 }, (_, i) => `L${i * 5 + 2.5} 10 L${i * 5 + 5} 14`).join(' ')} L100 20 Z`;
/** Shapes of the edges ("divider" layout): [path, opacity] (sketches of the Elementor shape dividers). */
const EDGE_PATHS = {
  curve: [['M0 20 Q50 0 100 20 Z', 1]],
  tilt: [['M0 20 L100 4 L100 20 Z', 1]],
  waves: [['M0 20 L0 12 Q12.5 4 25 12 T50 12 T75 12 T100 12 L100 20 Z', 1]],
  'curve-asymmetrical': [['M0 20 C35 -2 75 2 100 20 Z', 1]],
  'opacity-tilt': [['M0 20 L100 0 L100 20 Z', 0.35], ['M0 20 L100 8 L100 20 Z', 1]],
  'wave-brush': [['M0 20 L0 13 C10 9 18 15 28 12 S45 8 55 12 S75 16 85 11 S96 10 100 12 L100 20 Z', 1]],
  mountains: [['M0 20 L0 12 L18 4 L34 12 L52 2 L70 11 L86 5 L100 11 L100 20 Z', 0.4], ['M0 20 L0 15 L22 9 L42 15 L60 8 L80 15 L100 10 L100 20 Z', 1]],
  triangle: [['M0 20 L50 8 L100 20 Z', 1]],
  arrow: [['M0 20 L0 15 L46 15 L50 10 L54 15 L100 15 L100 20 Z', 1]],
  zigzag: [[zigzag, 1]],
};
/** Edge of a section in the color of its neighbour: bottom (hero, bands) or top (bands, "edges: all"). */
const Edge = ({ shape, color, top = false }) => {
  if (!EDGE_PATHS[shape]) return null;
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" className={cx('absolute inset-x-0 h-3 w-full', top ? 'top-0 rotate-180' : 'bottom-0')}>
      {EDGE_PATHS[shape].map(([d, opacity]) => (
        <path key={d} d={d} fill={color} opacity={opacity} />
      ))}
    </svg>
  );
};

/** Load a Google Font once (one <link> per family). */
const loadedFonts = new Set();
const SINGLE_WEIGHT = new Set(['Marcellus', 'Bebas Neue', 'Prata', 'Tenor Sans', 'DM Serif Display']);
function loadFont(family) {
  if (!family || loadedFonts.has(family) || typeof document === 'undefined') return;
  loadedFonts.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  // Google Fonts refuses a weight a family does not have: these ones only have the regular weight
  const weights = SINGLE_WEIGHT.has(family) ? '' : ':wght@400;700';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}${weights}&display=swap`;
  document.head.appendChild(link);
}

export function TemplatePreview({ spec, compact = false, className }) {
  const heading = spec?.style?.fonts?.heading;
  const bodyFont = spec?.style?.fonts?.body;
  useEffect(() => {
    loadFont(heading);
    loadFont(bodyFont);
  }, [heading, bodyFont]);
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
  const imgR = st.images === 'rounded' ? Math.max(r, 4) : st.images === 'arch' ? Math.max(r, 4) : 0;
  const arch = st.images === 'arch' ? '999px 999px 0 0' : null;
  const scale = { normal: 1, large: 1.12, xl: 1.28 }[st.scale] || 1;
  const upper = st.titleCase === 'upper' ? 'uppercase' : 'none';
  const left = st.align === 'left' || st.titles === 'bar';
  const head = { fontFamily: `'${fonts.heading}', ui-sans-serif, system-ui, sans-serif`, fontWeight: Number(headingWeight), color: ink.heading };
  const body = { fontFamily: `'${fonts.body}', ui-sans-serif, system-ui, sans-serif`, color: ink.text };
  const mainBg = dark ? c.secondary : c.primary;
  const pad = { compact: 'py-3', normal: 'py-4', airy: 'py-6' }[st.spacing] || 'py-4';
  // Colored bands, per the fill style (same rule as the builder)
  const fill = (angle = 135) =>
    ({ flat: c.primary, deep: dark ? ink.tint : c.dark, radial: `radial-gradient(circle at center, ${c.primary}, ${c.dark})` })[st.fill] || `linear-gradient(${angle}deg, ${c.primary}, ${c.dark})`;
  // Backgrounds of the Home sections: page color ("bg"), tinted ("alt") or a band, per the layouts and
  // the rhythm (same rules as the builder: "alternate" never repeats a surface, "lines" puts all on the page color)
  const order = spec.sections || ['about', 'features', 'cta', 'services', 'gallery', 'reviews'];
  const NATURAL = {
    about: 'bg',
    features: l.features === 'cards' ? 'band' : l.features === 'icons' || l.features === 'center' ? 'alt' : 'bg',
    cta: l.cta === 'split' ? 'bg' : 'band',
    services: l.services === 'boxed' ? 'alt' : 'bg',
    gallery: 'bg',
    reviews: l.testimonials === 'band' ? 'band' : l.testimonials === 'cards' ? 'alt' : 'bg',
    stats: l.stats === 'band' ? 'band' : l.stats === 'cards' ? 'alt' : 'bg',
    process: 'bg',
    faq: 'alt',
    highlights: 'band',
  };
  const surfaces = {};
  order.reduce((prev, id) => {
    const n = NATURAL[id];
    const s = n === 'band' ? n : st.rhythm === 'lines' ? 'bg' : st.rhythm === 'alternate' && prev === n ? (n === 'bg' ? 'alt' : 'bg') : n;
    surfaces[id] = s;
    return s;
  }, ['split', 'editorial'].includes(l.hero) ? 'alt' : 'band');
  const plainBg = (id) => (surfaces[id] === 'alt' ? ink.alt : surfaces[id] === 'bg' ? ink.bg : null);
  // "grid" decor: a fine grid on the tinted sections
  const gridLine = dark ? '#ffffff0d' : `${c.heading}10`;
  const sbg = (id) => {
    const bg = plainBg(id) || ink.bg;
    return st.decor === 'grid' && surfaces[id] === 'alt' ? `linear-gradient(${gridLine} 1px, transparent 1px) 0 0/8px 8px, linear-gradient(90deg, ${gridLine} 1px, transparent 1px) 0 0/8px 8px, ${bg}` : bg;
  };
  const son = (id) => (surfaces[id] === 'alt' ? 'alt' : 'base');
  // Highlighted last word of the titles (the site wraps it at runtime with the same rule)
  const hlStyle = (light) =>
    ({
      italic: { fontStyle: 'italic', fontWeight: 400, color: light ? c.secondary : ink.kicker },
      color: { color: light ? c.secondary : ink.kicker },
      marker: { background: `linear-gradient(transparent 58%, ${c.secondary}6b 58%, ${c.secondary}6b 92%, transparent 92%)` },
      outline: { color: 'transparent', WebkitTextStroke: `0.6px ${light ? '#fff' : ink.heading}` },
    })[st.highlight];
  const hl = (text, light = false) => {
    const words = String(text).trim().split(/\s+/);
    const style = hlStyle(light);
    if (!style || words.length < 3) return text;
    const k = words.length > 3 && words[words.length - 1].length < 4 ? 2 : 1;
    return (
      <>
        {words.slice(0, -k).join(' ')} <span style={style}>{words.slice(-k).join(' ')}</span>
      </>
    );
  };

  const btn = (bg, label, outline, fg) => (
    <span
      className="inline-block px-2 py-1 text-[8px] font-semibold"
      style={{ background: outline ? 'transparent' : bg, color: fg || (outline ? bg : onColor(bg, c.dark)), borderRadius: btnR, border: outline ? `1px solid ${fg || bg}` : 'none', textTransform: st.uppercase ? 'uppercase' : 'none' }}
    >
      {label}
    </span>
  );
  /** Photo placeholder; frame / deco: a main photo, with the photo decor of the template (brackets, inset frame, blob behind). */
  const Photo = ({ className: cls, style, frame, wide, deco }) => {
    const d = (frame || deco) && st.decor;
    const photo = (
      <div
        className={cx('relative flex shrink-0 items-center justify-center', d === 'blob' ? 'size-full' : cls)}
        style={{
          background: `linear-gradient(135deg, ${c.dark}, ${c.primary})`,
          borderRadius: frame && arch && !wide ? arch : imgR,
          boxShadow: frame && st.images === 'framed' ? `5px 5px 0 ${c.secondary}` : undefined,
          ...(d === 'frame' ? { outline: '1px solid #ffffffb8', outlineOffset: -4 } : {}),
          ...style,
        }}
      >
        {d === 'grid' && (
          <>
            <span className="absolute -top-1 -left-1 size-3 border-t-2 border-l-2" style={{ borderColor: c.secondary }} />
            <span className="absolute -right-1 -bottom-1 size-3 border-r-2 border-b-2" style={{ borderColor: c.secondary }} />
          </>
        )}
        <ImageIcon className="size-4 text-white/40" />
      </div>
    );
    if (d !== 'blob') return photo;
    // The blob sits behind the photo, inside its own stacking context
    return (
      <div className={cx('relative isolate shrink-0', cls)}>
        <span className="absolute -top-[7%] -right-[5%] -z-10 h-[80%] w-[72%]" style={{ background: dark ? `${c.secondary}2e` : mix(c.secondary, '#ffffff', 0.7), borderRadius: '62% 38% 54% 46%/49% 58% 42% 51%' }} />
        {photo}
      </div>
    );
  };
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
        <p
          className={cx('flex items-center gap-1 text-[6px] font-bold tracking-wider uppercase', st.kicker === 'pill' && 'rounded-full px-1.5 py-px')}
          style={{ color: light ? c.secondary : ink.kicker, background: st.kicker === 'pill' ? (light ? '#ffffff24' : dark ? `${c.secondary}29` : mix(c.primary, '#ffffff', 0.88)) : undefined }}
        >
          {st.kicker === 'dash' && <span className="h-px w-2.5" style={{ background: 'currentColor' }} />}
          {kicker}
          {st.kicker === 'dash' && center && <span className="h-px w-2.5" style={{ background: 'currentColor' }} />}
        </p>
      )}
      <p
        className="leading-tight"
        style={{ ...head, fontSize: 10 * scale, color: light ? '#fff' : ink.heading, textTransform: upper, ...(st.titles === 'bar' ? { borderLeft: `2px solid ${c.secondary}`, paddingLeft: 4 } : {}) }}
      >
        {hl(text, light)}
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
  // "transparent": over the heroes on a photo, with white links and logo
  const over = l.header === 'transparent' && ['center', 'left', 'bottom', 'card', 'slideshow'].includes(l.hero);
  const headerBg = over ? 'transparent' : bold ? c.primary : ink.bg;
  const menuColor = over ? '#fff' : bold ? onColor(c.primary, c.dark) : ink.heading;
  const logo = <div className="h-3 w-12" style={{ background: over ? '#fff' : bold ? menuColor : c.primary, borderRadius: Math.min(btnR, 3) }} />;

  // --- Hero ---
  const heroTitle = (color, size = 14) => (
    <p className="leading-tight" style={{ ...head, color, fontSize: size * scale, textTransform: upper }}>
      {hl(copy.heroTitle, color === '#fff')}
    </p>
  );
  const heroKicker = (color) => (
    <p className="text-[7px] font-semibold tracking-wider uppercase" style={{ color }}>
      {copy.heroKicker}
    </p>
  );
  const photoBg = (overlay) => ({ background: `${overlay}, linear-gradient(135deg, ${c.primary}, ${c.dark})` });
  /** Rotating phrases under the title: the first one, with a dot for each phrase (the site shows them in turn). */
  const phrases = (color, center = false) =>
    l.heroPhrases === 'rotating' && (
      <div className={cx('mt-0.5 flex items-center gap-1.5', center && 'justify-center')}>
        <p className="text-[9px] leading-tight" style={{ ...head, color }}>
          {copy.heroPhrases?.[0] || '…'}
        </p>
        <span className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-1 rounded-full" style={{ background: color, opacity: i ? 0.35 : 1 }} />
          ))}
        </span>
      </div>
    );
  /** Buttons: contact + call, contact only, or contact + a call link with a phone icon (fg: color of the second one). */
  const heroButtons = (bg, fg, center = false) => (
    <div className={cx('flex items-center gap-1.5 pt-1', center && 'justify-center')}>
      {btn(bg, copy.heroButton)}
      {l.heroButtons === 'link' ? (
        <span className="ml-1 text-[8px] font-semibold" style={{ ...body, color: fg }}>
          ☎ {copy.heroButton2}
        </span>
      ) : (
        l.heroButtons !== 'one' && btn(fg, copy.heroButton2, true, fg)
      )}
    </div>
  );
  // Height: the whole screen (with an arrow to the next section) or lower; the editorial hero keeps its height
  const full = l.heroHeight === 'full' && l.hero !== 'editorial';
  const compactHero = l.heroHeight === 'compact';
  const cue = (color) => full && l.hero !== 'bottom' && <ChevronDown className="absolute bottom-4 left-1/2 size-3 -translate-x-1/2" style={{ color }} />;
  let hero;
  if (l.hero === 'editorial') {
    hero = (
      <div className="flex flex-col items-center gap-3 px-4 py-6 text-center" style={{ background: ink.alt }}>
        <div className="w-4/5 space-y-1">
          <div className="flex justify-center">{heroKicker(ink.kicker)}</div>
          {heroTitle(ink.heading, 15)}
          {phrases(ink.kicker, true)}
          {heroButtons(mainBg, ink.heading, true)}
        </div>
        <Photo className="h-20 w-full" wide deco />
      </div>
    );
  } else if (l.hero === 'split') {
    hero = (
      <div className={cx('relative flex items-center gap-3 px-4', full ? 'min-h-48' : compactHero ? 'py-4' : 'py-6')} style={{ background: ink.alt }}>
        <div className="flex-1 space-y-1">
          {heroKicker(ink.kicker)}
          {heroTitle(ink.heading)}
          {phrases(ink.kicker)}
          {heroButtons(mainBg, ink.heading)}
        </div>
        <Photo className={cx('w-2/5', compactHero ? 'h-20' : 'h-24')} frame />
        {cue(ink.heading)}
      </div>
    );
  } else if (l.hero === 'card') {
    hero = (
      <div className={cx('relative flex items-center px-4', full ? 'min-h-48' : compactHero ? 'pt-4 pb-6' : 'pt-6 pb-8')} style={photoBg(`linear-gradient(90deg, ${c.dark}66, ${c.dark}22)`)}>
        <div className="w-3/5 space-y-1 p-3" style={card('photo')}>
          {heroKicker(ink.kicker)}
          {heroTitle(ink.heading, 13)}
          {phrases(ink.kicker)}
          {heroButtons(mainBg, ink.heading)}
        </div>
        {cue('#fff')}
        <Edge shape={l.divider} color={ink.bg} />
      </div>
    );
  } else {
    const bottom = l.hero === 'bottom';
    const slideshow = l.hero === 'slideshow';
    const center = l.hero === 'center' || slideshow;
    const height = full ? cx('min-h-48', bottom ? 'justify-end pt-14' : 'justify-center pt-8') : bottom ? cx(compactHero ? 'min-h-28' : 'min-h-36', 'justify-end pt-14') : compactHero ? 'pt-5' : 'pt-8';
    hero = (
      <div
        className={cx('relative flex flex-col px-4', compactHero ? 'pb-7' : 'pb-9', height, center && 'items-center text-center')}
        style={photoBg(bottom ? `linear-gradient(180deg, ${c.dark}11, ${c.dark}f0)` : center ? `linear-gradient(180deg, ${c.dark}aa, ${c.dark}dd)` : `linear-gradient(90deg, ${c.dark}ee, ${c.dark}44)`)}
      >
        {heroKicker(c.secondary)}
        <div className={cx('mt-1', center ? 'max-w-[85%]' : 'max-w-[70%]')}>{heroTitle('#fff', bottom ? 17 : 14)}</div>
        {phrases(c.secondary, center)}
        <div className="mt-1">{heroButtons(c.secondary, '#fff', center)}</div>
        {/* Slideshow: the photos change behind the text */}
        {slideshow && (
          <div className="mt-3 flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="h-0.5 w-3 rounded-full" style={{ background: i === 0 ? '#fff' : '#ffffff59' }} />
            ))}
          </div>
        )}
        {cue('#fff')}
        <Edge shape={l.divider} color={ink.bg} />
      </div>
    );
  }

  // --- About ---
  const aboutTitle = title(copy.aboutKicker, copy.aboutTitle, { center: false });
  const aboutText = (
    <div className="flex-1 space-y-1.5">
      {aboutTitle}
      {st.decor === 'dropcap' ? (
        <div className="flex items-start gap-1">
          <span className="text-[18px] leading-[0.8]" style={{ ...head, color: ink.kicker }}>
            {copy.aboutText.replace(/<[^>]*>/g, '').trim().charAt(0) || 'A'}
          </span>
          <div className="flex-1">
            <Lines n={3} color={ink.text} />
          </div>
        </div>
      ) : (
        <Lines n={3} color={ink.text} />
      )}
      {btn(mainBg, copy.aboutButton)}
    </div>
  );
  const about =
    l.about === 'wide' ? (
      <div className={cx('space-y-2 px-4', pad)} style={{ background: sbg('about') }}>
        <div className="mx-auto w-4/5">{aboutText}</div>
        <Photo className="h-14 w-full" frame />
      </div>
    ) : l.about === 'stacked' ? (
      // The title beside the text, a wide photo below
      <div className={cx('space-y-2 px-4', pad)} style={{ background: sbg('about') }}>
        <div className="flex items-start gap-3">
          <div className="w-2/5">{aboutTitle}</div>
          <div className="flex-1 space-y-1.5">
            <Lines n={3} color={ink.text} />
            {btn(mainBg, copy.aboutButton)}
          </div>
        </div>
        <Photo className="h-14 w-full" frame wide />
      </div>
    ) : l.about === 'sandwich' ? (
      // Title and text | a tall photo | key points and button
      <div className={cx('flex items-center gap-2 px-4', pad)} style={{ background: sbg('about') }}>
        <div className="flex-1 space-y-1.5">
          {aboutTitle}
          <Lines n={3} color={ink.text} />
        </div>
        <Photo className="h-20 w-1/4" frame />
        <div className="flex-1 space-y-1">
          {(copy.aboutPoints || ['', '', '']).map((x, i) => (
            <p key={i} className="flex items-center gap-1 text-[6px] font-semibold leading-tight" style={{ ...body, color: ink.heading }}>
              <span style={{ color: c.secondary }}>✓</span> {x}
            </p>
          ))}
          <div className="pt-0.5">{btn(mainBg, copy.aboutButton)}</div>
        </div>
      </div>
    ) : l.about === 'triptych' ? (
      // The text centered between two photos, the second one lower
      <div className={cx('flex items-center gap-2 px-4', pad)} style={{ background: sbg('about') }}>
        <Photo className="h-16 w-1/4" frame />
        <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
          {title(copy.aboutKicker, copy.aboutTitle, { center: st.titles !== 'bar' })}
          <Lines n={3} color={ink.text} center />
          {btn(mainBg, copy.aboutButton)}
        </div>
        <Photo className="mt-5 h-12 w-1/4" />
      </div>
    ) : (
      <div className={cx('flex items-center gap-3 px-4', pad, l.about === 'image-right' && 'flex-row-reverse')} style={{ background: sbg('about') }}>
        {l.about === 'badge' ? (
          <div className="relative w-2/5 shrink-0 pb-3">
            <Photo className="h-16 w-full" frame />
            <div className="absolute bottom-0 left-2 px-2 py-1 shadow-md" style={{ background: fill(), borderRadius: Math.min(r, 6) }}>
              <p className="text-[9px] leading-none text-white" style={head}>
                {copy.stats[0].value}
              </p>
              <p className="text-[5px] text-white/80">{copy.stats[0].label}</p>
            </div>
          </div>
        ) : l.about === 'collage' ? (
          // A large photo with a smaller one overlapping its corner, cut out in the section color
          <div className="flex w-2/5 shrink-0 flex-col">
            <Photo className="h-14 w-4/5" frame />
            <div className="-mt-6 w-1/2 self-end" style={{ border: `2px solid ${plainBg('about') || ink.bg}`, borderRadius: imgR }}>
              <Photo className="h-9 w-full" />
            </div>
          </div>
        ) : (
          <Photo className="h-16 w-2/5" frame />
        )}
        {aboutText}
      </div>
    );

  // --- Why choose us ---
  const shown = copy.features.slice(0, featureCount(l));
  /** One strength: a centered card (cardOn), a row with the icon beside the text, or that row in a card (rowCardOn: bento). */
  const featureItem = (f, i, cardOn, rowCardOn = null) => (
    <div key={i} className={cx('flex gap-1 p-1.5', cardOn ? 'flex-col items-center text-center' : 'items-start')} style={cardOn ? card(cardOn) : rowCardOn ? card(rowCardOn) : undefined}>
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
  if (l.features === 'bento') {
    // The first strength large over a photo, the other three as compact cards beside it
    const [first, ...rest] = shown;
    why = (
      <div className={cx('px-4', pad)} style={{ background: sbg('features') }}>
        {title(copy.featuresKicker, copy.featuresTitle)}
        <div className="mt-2 flex gap-1.5">
          <div className="flex min-h-20 w-1/2 flex-col justify-end gap-0.5 p-2" style={{ ...photoBg(`linear-gradient(180deg, ${c.dark}33, ${c.dark}eb)`), borderRadius: imgR }}>
            <span className="size-3 rounded-full" style={{ background: c.secondary, borderRadius: st.buttons === 'square' ? 2 : 999 }} />
            <span className="text-[8px] leading-tight text-white" style={{ ...head, color: '#fff' }}>
              {first.title}
            </span>
            <span className="text-[5px] leading-tight text-white/80">{first.text}</span>
          </div>
          <div className={cx('flex-1 gap-1', rest.length > 3 ? 'grid grid-cols-2' : 'flex flex-col')}>{rest.map((f, i) => featureItem(f, i + 1, null, son('features')))}</div>
        </div>
      </div>
    );
  } else if (l.features === 'split') {
    // The strengths as a list beside a large photo, on the other side than the About photo
    why = (
      <div className={cx('flex items-center gap-3 px-4', pad, l.about === 'image-right' && 'flex-row-reverse')} style={{ background: sbg('features') }}>
        <div className="flex-1 space-y-1.5">
          {title(copy.featuresKicker, copy.featuresTitle, { center: false })}
          <div className="divide-y" style={{ borderColor: ink.border }}>
            {shown.map((f, i) => (
              <div key={i} style={{ borderColor: ink.border }}>
                {featureItem(f, i, null)}
              </div>
            ))}
          </div>
        </div>
        <Photo className="h-28 w-2/5" frame />
      </div>
    );
  } else if (l.features === 'center') {
    // A photo in the middle, half of the strengths on each side facing it
    const half = Math.ceil(shown.length / 2);
    why = (
      <div className={cx('px-4', pad)} style={{ background: sbg('features') }}>
        {title(copy.featuresKicker, copy.featuresTitle)}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex w-[30%] flex-col gap-2 text-right [&>div]:flex-row-reverse">{shown.slice(0, half).map((f, i) => featureItem(f, i, null))}</div>
          <Photo className="h-24 flex-1" frame />
          <div className="flex w-[30%] flex-col gap-2">{shown.slice(half).map((f, i) => featureItem(f, half + i, null))}</div>
        </div>
      </div>
    );
  } else if (l.features === 'list') {
    why = (
      <div className={cx('flex gap-3 px-4', pad)} style={{ background: sbg('features') }}>
        <div className="w-1/3">{title(copy.featuresKicker, copy.featuresTitle, { center: false })}</div>
        <div className="grid flex-1 grid-cols-2 gap-1.5">{shown.map((f, i) => featureItem(f, i, null))}</div>
      </div>
    );
  } else {
    const onPhoto = l.features === 'cards';
    why = (
      <div className={cx('px-4', pad)} style={onPhoto ? photoBg(`linear-gradient(180deg, ${c.dark}ee, ${c.dark}cc)`) : { background: sbg('features') }}>
        {title(copy.featuresKicker, copy.featuresTitle, { light: onPhoto })}
        <div className={cx('mt-2 grid gap-1.5', shown.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}>{shown.map((f, i) => featureItem(f, i, onPhoto ? 'photo' : son('features')))}</div>
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
    l.cta !== 'split' ? (
      <div className="flex flex-col items-center gap-1.5 px-4 py-4 text-center" style={photoBg(`linear-gradient(135deg, ${c.primary}ee, ${c.dark}e6)`)}>
        {ctaTitle}
        {btn(c.secondary, copy.ctaButton)}
      </div>
    ) : (
      <div className="px-4 py-2" style={{ background: sbg('cta') }}>
        <div className="flex items-center justify-between gap-2 px-3 py-3" style={{ background: fill(), borderRadius: r }}>
          {ctaTitle}
          {btn(c.secondary, copy.ctaButton)}
        </div>
      </div>
    );

  // --- Services ---
  const services = (
    <div className={cx('px-4', pad)} style={{ background: sbg('services') }}>
      {title(copy.servicesKicker, copy.servicesTitle)}
      {l.services === 'list' ? (
        <div className="mt-2 space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className={cx('flex items-center gap-2 border-b pb-2', i % 2 && 'flex-row-reverse')} style={{ borderColor: ink.border }}>
              <Photo className="h-10 w-2/5" style={{ borderRadius: imgR }} />
              <div className="flex-1 space-y-0.5">
                <p className="text-[6px] font-bold" style={{ color: ink.kicker }}>
                  0{i + 1}
                </p>
                <div className="h-1.5 w-2/3 rounded-full" style={{ background: ink.heading }} />
                <Lines n={2} color={ink.text} />
              </div>
            </div>
          ))}
        </div>
      ) : (
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
            <div key={i} className="overflow-hidden text-left" style={card(son('services'))}>
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
      )}
    </div>
  );

  // --- Reviews (no photos of the customers) ---
  const band = l.testimonials === 'band';
  const cards = l.testimonials === 'cards';
  const reviews = (
    <div className={cx('px-4', pad)} style={{ background: band ? fill() : sbg('reviews') }}>
      {title(copy.reviewsKicker, copy.reviewsTitle, { light: band, center: l.testimonials === 'quote' || !left })}
      {l.testimonials === 'quote' && (
        <div className="mx-auto mt-2 flex w-4/5 flex-col items-center gap-1 text-center">
          <Quote className="size-3.5" style={{ color: c.secondary }} fill={c.secondary} stroke="none" />
          <p className="text-[8px] leading-snug italic" style={{ ...head, fontWeight: 400 }}>
            {copy.reviews[0].text}
          </p>
          <span className="text-[6px] font-semibold" style={{ ...head }}>
            {copy.reviews[0].name}
          </span>
        </div>
      )}
      <div className={cx('mt-2 grid gap-2', l.testimonials === 'quote' ? 'grid-cols-2 border-t pt-2' : 'grid-cols-3')} style={l.testimonials === 'quote' ? { borderColor: ink.border } : undefined}>
        {(l.testimonials === 'quote' ? copy.reviews.slice(1) : copy.reviews).map((rv, i) => (
          <div key={i} className={cx('flex flex-col gap-1 p-1.5', cards ? 'items-start' : 'items-center')} style={cards ? card(son('reviews')) : undefined}>
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

  // --- Photo carousel ---
  const gallery = (
    <div className={cx('px-4', pad)} style={{ background: sbg('gallery') }}>
      {title(copy.galleryKicker, copy.galleryTitle)}
      <div className="mt-2 flex items-center gap-1">
        <ChevronLeft className="size-3 shrink-0" style={{ color: ink.heading }} />
        <div className="grid flex-1 grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <Photo key={i} className="h-10 w-full" />
          ))}
        </div>
        <ChevronRight className="size-3 shrink-0" style={{ color: ink.heading }} />
      </div>
      <div className="mt-1.5 flex justify-center gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="size-1 rounded-full" style={{ background: i === 0 ? c.secondary : (dark ? '#ffffff' : c.heading) + '40' }} />
        ))}
      </div>
    </div>
  );

  // --- Optional sections ---
  // Key numbers: colored band, large figures under thin lines, or cards
  const stats =
    l.stats === 'inline' ? (
      <div className="grid grid-cols-4 gap-2 px-4 py-3" style={{ background: sbg('stats') }}>
        {copy.stats.map((x, i) => (
          <div key={i} className="border-t pt-1.5" style={{ borderColor: ink.border }}>
            <p className="text-[14px] leading-none" style={head}>
              {x.value}
            </p>
            <p className="mt-0.5 text-[5px]" style={body}>
              {x.label}
            </p>
          </div>
        ))}
      </div>
    ) : l.stats === 'cards' ? (
      <div className="grid grid-cols-4 gap-1.5 px-4 py-3 text-center" style={{ background: sbg('stats') }}>
        {copy.stats.map((x, i) => (
          <div key={i} className="p-1.5" style={card(son('stats'))}>
            <p className="text-[12px] leading-none" style={{ ...head, color: ink.kicker }}>
              {x.value}
            </p>
            <p className="mt-0.5 text-[5px]" style={body}>
              {x.label}
            </p>
          </div>
        ))}
      </div>
    ) : (
      <div className="grid grid-cols-4 gap-2 px-4 py-3 text-center" style={{ background: fill() }}>
        {copy.stats.map((x, i) => (
          <div key={i}>
            <p className="text-[12px] leading-none" style={{ ...head, color: c.secondary }}>
              {x.value}
            </p>
            <p className="mt-0.5 text-[5px] text-white/80">{x.label}</p>
          </div>
        ))}
      </div>
    );
  // How we work: numbered cards, horizontal timeline, or vertical timeline beside the title
  const disc = (i) => (
    <span className="flex size-3.5 shrink-0 items-center justify-center text-[5px] font-bold" style={{ background: c.secondary, color: onColor(c.secondary, c.dark), borderRadius: st.buttons === 'square' ? 0 : 999 }}>
      {String(i + 1).padStart(2, '0')}
    </span>
  );
  const stepText = (x) => (
    <>
      <p className="text-[6px] leading-tight" style={head}>
        {x.title}
      </p>
      <Lines n={2} color={ink.text} />
    </>
  );
  const processSteps =
    l.process === 'timeline' ? (
      <div className={cx('px-4', pad)} style={{ background: sbg('process') }}>
        {title(copy.processKicker, copy.processTitle)}
        <div className="mt-4 grid grid-cols-4 gap-2.5">
          {copy.steps.map((x, i) => (
            <div key={i} className="space-y-0.5 border-t-2" style={{ borderColor: ink.border }}>
              <div className="-mt-2 mb-1">{disc(i)}</div>
              {stepText(x)}
            </div>
          ))}
        </div>
      </div>
    ) : l.process === 'vertical' ? (
      <div className={cx('flex gap-3 px-4', pad)} style={{ background: sbg('process') }}>
        <div className="w-1/3">{title(copy.processKicker, copy.processTitle, { center: false })}</div>
        <div className="flex-1 pl-2">
          {copy.steps.map((x, i) => (
            <div key={i} className="relative border-l-2 pb-1.5 pl-3 last:pb-0" style={{ borderColor: ink.border }}>
              <div className="absolute top-0 -left-[8px]">{disc(i)}</div>
              {stepText(x)}
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div className={cx('px-4', pad)} style={{ background: sbg('process') }}>
        {title(copy.processKicker, copy.processTitle)}
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {copy.steps.map((x, i) => (
            <div key={i} className="space-y-0.5 p-1.5" style={card(son('process'))}>
              <p className="text-[10px] leading-none" style={{ ...head, color: c.secondary }}>
                {String(i + 1).padStart(2, '0')}
              </p>
              {stepText(x)}
            </div>
          ))}
        </div>
      </div>
    );
  const faqList = (
    <div className={cx('px-4', pad, left && 'flex gap-3')} style={{ background: sbg('faq') }}>
      <div className={left ? 'w-1/3' : ''}>{title(copy.faqKicker, copy.faqTitle)}</div>
      <div className={cx('space-y-1', left ? 'flex-1' : 'mx-auto mt-2 w-4/5')}>
        {copy.faq.map((x, i) => (
          <div key={i} className="flex items-center justify-between px-1.5 py-1" style={{ background: ink.card, border: `1px solid ${ink.border}` }}>
            <span className="truncate text-[6px]" style={head}>
              {x.q}
            </span>
            <Plus className="size-2 shrink-0" style={{ color: c.secondary }} />
          </div>
        ))}
      </div>
    </div>
  );
  // Strip of guarantees: centered, or scrolling (drawn as a row cut at the edges)
  const highlightsStrip =
    l.highlights === 'marquee' ? (
      <div className="flex gap-4 overflow-hidden px-4 py-2.5 whitespace-nowrap" style={{ background: fill(90) }}>
        {[...copy.highlights, ...copy.highlights].map((x, i) => (
          <span key={i} className="shrink-0 text-[7px] font-bold tracking-wider text-white uppercase">
            <span style={{ color: c.secondary }}>✓</span> {x}
          </span>
        ))}
      </div>
    ) : (
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 px-4 py-2" style={{ background: fill(90) }}>
        {copy.highlights.map((x, i) => (
          <span key={i} className="text-[6px] font-semibold text-white">
            <span style={{ color: c.secondary }}>✓</span> {x}
          </span>
        ))}
      </div>
    );
  const SECTIONS = { about, features: why, cta, services, gallery, reviews, stats, process: processSteps, faq: faqList, highlights: highlightsStrip };
  // "edges: all": the colored and photo bands get the hero edge shape towards the plain sections next to them
  const bands = new Set([l.features === 'cards' && 'features', l.cta !== 'split' && 'cta', band && 'reviews', l.stats === 'band' && 'stats'].filter(Boolean));
  const bandEdges = st.edges === 'all' && l.divider !== 'none';

  // --- Footer ---
  const lightFooter = l.footer === 'light';
  const footerBg = lightFooter ? ink.alt : l.footer === 'brand' ? fill() : dark ? mix(c.dark, '#000000', 0.4) : c.dark;
  const footerText = lightFooter ? ink.heading : '#fff';

  return (
    <div className={cx('relative overflow-hidden rounded-lg border border-slate-200 text-left select-none', compact && 'pointer-events-none h-72', className)} style={{ background: ink.bg }} aria-hidden="true">
      {l.header === 'topbar' && <div className="flex justify-end gap-3 px-3 py-0.5 text-[6px] text-white/80" style={{ background: dark ? '#000' : c.dark }}>☎ 000 000 000 · ✉ info@…</div>}
      <div className={cx('z-10 flex items-center gap-3 px-3 py-2', over ? 'absolute inset-x-0 top-0' : 'relative shadow-sm')} style={{ background: headerBg }}>
        <div className="shrink-0">{logo}</div>
        <div className={cx('flex min-w-0 flex-1', l.header === 'centered' ? 'justify-center' : 'justify-end')}>{menu(menuColor)}</div>
        <div className="shrink-0">{btn(bold ? c.secondary : mainBg, copy.headerButton)}</div>
      </div>
      {hero}
      {order.map((id, i) =>
        bandEdges && bands.has(id) ? (
          <div key={id} className="relative">
            {SECTIONS[id]}
            {plainBg(order[i - 1]) && <Edge top shape={l.divider} color={plainBg(order[i - 1])} />}
            {plainBg(order[i + 1]) && <Edge shape={l.divider} color={plainBg(order[i + 1])} />}
          </div>
        ) : st.rhythm === 'lines' && plainBg(id) && plainBg(order[i - 1]) ? (
          // "lines" rhythm: a thin line between two plain sections
          <div key={id} className="border-t" style={{ borderColor: ink.border }}>
            {SECTIONS[id]}
          </div>
        ) : (
          <Fragment key={id}>{SECTIONS[id] || null}</Fragment>
        )
      )}
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
        {st.decor === 'wordmark' && (
          <p className="overflow-hidden px-3 text-[40px] leading-[0.8] font-bold whitespace-nowrap" style={{ ...head, color: lightFooter ? `${c.heading}14` : '#ffffff14', letterSpacing: '-0.04em' }}>
            Nome attività
          </p>
        )}
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
