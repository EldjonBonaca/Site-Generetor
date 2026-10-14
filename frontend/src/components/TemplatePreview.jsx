/**
 * Visual sketch of a template (its Home page) drawn from the spec: colors, fonts, layout variants,
 * icons and sample texts. Fonts are only named (no request to Google Fonts) and photos are drawn
 * as gradients: the real site uses the project images.
 */
import { ImageIcon, Star } from 'lucide-react';
import { cx } from './ui.jsx';

const Photo = ({ colors, className, style }) => (
  <div className={cx('flex items-center justify-center', className)} style={{ background: `linear-gradient(135deg, ${colors.dark}, ${colors.primary})`, ...style }}>
    <ImageIcon className="size-4 text-white/40" />
  </div>
);

const Lines = ({ n = 2, color, width = '100%' }) => (
  <div className="space-y-1" style={{ width }}>
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="h-1 rounded-full" style={{ background: color, opacity: 0.35, width: i === n - 1 ? '70%' : '100%' }} />
    ))}
  </div>
);

export function TemplatePreview({ spec, compact = false, className }) {
  if (!spec) return null;
  const { colors: c, fonts, radius, uppercase, headingWeight } = spec.style;
  const l = spec.layout;
  const copy = spec.copy;
  const r = Math.min(radius, 10);
  const head = { fontFamily: `'${fonts.heading}', ui-sans-serif, system-ui, sans-serif`, fontWeight: Number(headingWeight), color: c.heading };
  const body = { fontFamily: `'${fonts.body}', ui-sans-serif, system-ui, sans-serif`, color: c.text };
  const btn = (bg, fg, label, outline) => (
    <span className="inline-block px-2 py-1 text-[8px] font-semibold" style={{ background: outline ? 'transparent' : bg, color: fg, borderRadius: r, border: outline ? `1px solid ${fg}` : 'none', textTransform: uppercase ? 'uppercase' : 'none' }}>
      {label}
    </span>
  );
  const pad = { compact: 'py-3', normal: 'py-4', airy: 'py-6' }[spec.style.spacing] || 'py-4';
  const onPhoto = l.hero !== 'split';

  const menu = (
    <div className="flex gap-2 text-[7px] font-semibold" style={{ ...body, color: c.heading }}>
      {['Home', 'Chi Siamo', 'Servizi', 'Galleria', 'Contatti'].map((m) => (
        <span key={m}>{m}</span>
      ))}
    </div>
  );
  const logo = <div className="h-3 w-12 rounded-sm" style={{ background: c.primary }} />;

  return (
    <div className={cx('overflow-hidden rounded-lg border border-slate-200 bg-white text-left select-none', compact && 'pointer-events-none h-72', className)} aria-hidden="true">
      {/* Header */}
      {l.header === 'topbar' && <div className="flex justify-end gap-3 px-3 py-0.5 text-[6px] text-white/80" style={{ background: c.dark }}>☎ 000 000 000 · ✉ info@…</div>}
      {l.header === 'centered' ? (
        <div className="flex flex-col items-center gap-1.5 border-b border-slate-100 py-2">
          {logo}
          {menu}
        </div>
      ) : (
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          {logo}
          {menu}
          {btn(c.primary, '#fff', copy.headerButton)}
        </div>
      )}

      {/* Hero */}
      {onPhoto ? (
        <div className={cx('relative px-4 py-8', l.hero === 'center' ? 'text-center' : '')} style={{ background: `linear-gradient(135deg, ${c.dark}, ${c.primary})` }}>
          <p className="text-[7px] font-semibold tracking-wider uppercase" style={{ color: c.secondary }}>
            {copy.heroKicker}
          </p>
          <p className={cx('mt-1 text-sm leading-tight', l.hero === 'left' && 'max-w-[65%]')} style={{ ...head, color: '#fff' }}>
            {copy.heroTitle}
          </p>
          <div className={cx('mt-2 flex gap-1.5', l.hero === 'center' && 'justify-center')}>
            {btn(c.secondary, c.dark, copy.heroButton)}
            {btn('', '#fff', copy.heroButton2, true)}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-5" style={{ background: c.background }}>
          <div className="flex-1">
            <p className="text-[7px] font-semibold tracking-wider uppercase" style={{ color: c.secondary }}>
              {copy.heroKicker}
            </p>
            <p className="mt-1 text-sm leading-tight" style={head}>
              {copy.heroTitle}
            </p>
            <div className="mt-2 flex gap-1.5">
              {btn(c.secondary, c.dark, copy.heroButton)}
              {btn('', c.primary, copy.heroButton2, true)}
            </div>
          </div>
          <Photo colors={c} className="h-20 w-2/5" style={{ borderRadius: r }} />
        </div>
      )}

      {/* About */}
      <div className={cx('flex items-center gap-3 px-4', pad, l.about === 'image-right' && 'flex-row-reverse')}>
        <Photo colors={c} className="h-14 w-2/5" style={{ borderRadius: r }} />
        <div className="flex-1 space-y-1.5">
          <p className="text-[10px] leading-tight" style={head}>
            {copy.aboutTitle}
          </p>
          <Lines n={3} color={c.text} />
          {btn(c.primary, '#fff', copy.aboutButton)}
        </div>
      </div>

      {/* Why choose us */}
      <div className={cx('px-4 text-center', pad)} style={{ background: l.features === 'cards' ? `linear-gradient(135deg, ${c.dark}, ${c.dark}ee)` : c.background }}>
        <p className="text-[10px]" style={{ ...head, color: l.features === 'cards' ? '#fff' : c.heading }}>
          {copy.featuresTitle}
        </p>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {copy.features.map((f, i) => (
            <div key={i} className={cx('flex flex-col items-center gap-1 p-1', l.features === 'cards' && 'bg-white')} style={{ borderRadius: r }}>
              {/* Font Awesome is not loaded in the app: the icon name is shown on hover */}
              <span title={spec.icons[i]} className="flex size-4 items-center justify-center rounded-full" style={{ background: c.primary }}>
                <span className="size-1.5 rounded-full bg-white" />
              </span>
              <span className="text-[7px] leading-tight" style={{ ...head, color: c.heading }}>
                {f.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Call to action */}
      {l.cta !== 'none' && (
        <div className={cx('flex items-center gap-2 px-4 py-3', l.cta === 'banner' ? 'flex-col text-center' : 'justify-between')} style={{ background: c.primary }}>
          <p className="text-[10px]" style={{ ...head, color: '#fff' }}>
            {copy.ctaTitle}
          </p>
          {btn(c.secondary, c.dark, copy.ctaButton)}
        </div>
      )}

      {/* Services */}
      <div className={cx('px-4 text-center', pad)} style={{ background: l.services === 'boxed' ? c.background : '#fff' }}>
        <p className="text-[10px]" style={head}>
          {copy.servicesTitle}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cx('space-y-1 text-left', l.services === 'boxed' && 'bg-white p-1 shadow-sm')} style={{ borderRadius: r }}>
              <Photo colors={c} className="h-8" style={{ borderRadius: r }} />
              <div className="h-1.5 w-2/3 rounded-full" style={{ background: c.heading }} />
              <Lines n={2} color={c.text} />
            </div>
          ))}
        </div>
      </div>

      {/* Reviews */}
      <div className={cx('px-4 text-center', pad)} style={{ background: l.testimonials === 'cards' ? c.background : '#fff' }}>
        <p className="text-[10px]" style={head}>
          {copy.reviewsTitle}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {copy.reviews.map((rv, i) => (
            <div key={i} className={cx('flex flex-col items-center gap-1 p-1.5', l.testimonials === 'cards' && 'bg-white shadow-sm')} style={{ borderRadius: r }}>
              <span className="flex gap-px">
                {[0, 1, 2, 3, 4].map((s) => (
                  <Star key={s} className="size-1.5" fill={c.secondary} stroke="none" />
                ))}
              </span>
              <Lines n={2} color={c.text} />
              <span className="text-[6px] font-semibold" style={{ ...head, color: c.heading }}>
                {rv.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3" style={{ background: l.footer === 'dark' ? c.dark : c.background }}>
        <div className="h-3 w-10 rounded-sm" style={{ background: l.footer === 'dark' ? '#fff' : c.primary, opacity: 0.85 }} />
        {['Link', 'Servizi', 'Contatti'].map((t) => (
          <div key={t} className="space-y-1">
            <p className="text-[7px] font-semibold" style={{ ...head, color: l.footer === 'dark' ? '#fff' : c.heading }}>
              {t}
            </p>
            <Lines n={3} color={l.footer === 'dark' ? '#ffffff' : c.text} width="80%" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Color swatches + font names of a template. */
export function TemplateSwatches({ spec }) {
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
    </div>
  );
}
