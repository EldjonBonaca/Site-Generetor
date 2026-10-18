/**
 * Compare the templates of a category side by side: the sketch of each Home page, how alike each
 * template is to its most similar one and what they visibly share. "Make it more different" opens
 * the editor with a new design for that template.
 */
import { useEffect, useMemo, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { api } from '../api.js';
import { useT } from '../i18n/index.jsx';
import { useToast } from './Toast.jsx';
import { Badge, Button, Modal, Spinner } from './ui.jsx';
import { TemplatePreview, TemplateSwatches } from './TemplatePreview.jsx';

/** Likeness (0..100, see compareTemplates on the server) from which two templates look alike, or too alike. */
const ALIKE = 35;
const TOO_ALIKE = 50;

const SHARED_LABELS = {
  direction: 'Same direction',
  palette: 'Similar main color',
  fonts: 'Same title font',
  firstScreen: 'Same first screen',
  hero: 'Same hero',
  shape: 'Same Home structure',
  signature: 'Same signature element',
  photoTone: 'Same photo treatment',
};

function Likeness({ value }) {
  const { t } = useT();
  const [color, label] = value >= TOO_ALIKE ? ['red', 'Very similar'] : value >= ALIKE ? ['yellow', 'Somewhat similar'] : ['green', 'Different'];
  return (
    <Badge color={color}>
      {t(label)} · {value}%
    </Badge>
  );
}

function Shared({ items }) {
  const { t } = useT();
  if (!items.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((x) => (
        <span key={x} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
          {t(SHARED_LABELS[x] || x)}
        </span>
      ))}
    </span>
  );
}

export function TemplateCompare({ open, onClose, category, templates, onDiversify }) {
  const { t } = useT();
  const toast = useToast();
  const [pairs, setPairs] = useState(null);

  // Templates change after an edit: compare them again
  useEffect(() => {
    if (!open || !category) return;
    setPairs(null);
    api
      .get(`/template-categories/${category.id}/compare`)
      .then((r) => setPairs(r.pairs))
      .catch((e) => toast(e.message, 'error'));
  }, [open, category?.id, templates]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map((templates || []).map((tpl) => [tpl.id, tpl])), [templates]);
  const known = useMemo(() => (pairs || []).filter((p) => byId.has(p.a) && byId.has(p.b)).sort((x, y) => y.likeness - x.likeness), [pairs, byId]);
  /** The most similar template of `id`, with the likeness and what they share. */
  const nearest = (id) => {
    const p = known.find((x) => x.a === id || x.b === id);
    return p && { ...p, other: byId.get(p.a === id ? p.b : p.a) };
  };

  return (
    <Modal open={open} onClose={onClose} title={t('Compare the templates of "{name}"', { name: category?.name || '' })} size="2xl">
      {!pairs ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">{t('Most similar pairs')}</p>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {known.slice(0, 3).map((p) => (
                <li key={`${p.a}-${p.b}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-800">
                    {byId.get(p.a).name} ↔ {byId.get(p.b).name}
                  </span>
                  <Likeness value={p.likeness} />
                  <Shared items={p.shared} />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              {t('Likeness counts what a visitor sees: layouts, look, structure of the Home page, amount of color, main color and fonts. Templates designed for the same category are usually below {n}%.', { n: ALIKE })}
            </p>
          </div>

          <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((tpl) => {
              const near = nearest(tpl.id);
              return (
                <li key={tpl.id} className="flex flex-col overflow-hidden rounded-xl border border-slate-200">
                  <TemplatePreview spec={tpl.spec} compact className="rounded-none border-0 border-b" />
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <p className="truncate font-medium text-slate-900">{tpl.name}</p>
                    <TemplateSwatches spec={tpl.spec} direction={tpl.direction_name && t(tpl.direction_name)} />
                    {near && (
                      <div className="space-y-1 text-xs text-slate-600">
                        <p className="flex flex-wrap items-center gap-1.5">
                          {t('Most similar to "{name}"', { name: near.other.name })}
                          <Likeness value={near.likeness} />
                        </p>
                        <Shared items={near.shared} />
                      </div>
                    )}
                    {tpl.can_edit && (
                      <Button size="sm" icon={Wand2} onClick={() => onDiversify(tpl)} className="mt-auto self-start">
                        {t('Make it more different')}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}
