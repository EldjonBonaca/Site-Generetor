import { AlertTriangle, CircleAlert } from 'lucide-react';
import { cx } from './ui.jsx';

/** Readiness messages of one step, shown at the top of that step. */
export function StepIssues({ project, step, t }) {
  const items = (project.readiness?.items || []).filter((i) => i.step === step);
  if (!items.length) return null;
  return (
    <ul className="mb-5 space-y-1.5">
      {items.map((i, n) => (
        <li key={n} className={cx('flex items-start gap-2 rounded-lg px-3 py-2 text-sm', i.level === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900')}>
          {i.level === 'error' ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          {t(i.message)}
        </li>
      ))}
    </ul>
  );
}
