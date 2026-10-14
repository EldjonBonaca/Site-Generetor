import { Component } from 'react';
import { TriangleAlert } from 'lucide-react';

/**
 * Catches a rendering error of a page, so the app shows a message and a way back
 * instead of a blank screen. Reset by changing `resetKey` (App passes the current path).
 */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info.componentStack);
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { t } = this.props;
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <TriangleAlert className="mx-auto size-8 text-red-500" />
        <p className="mt-3 font-semibold text-slate-900">{t('Something went wrong on this page')}</p>
        <p className="mt-1 text-sm break-words text-slate-500">{error.message}</p>
        <a href="/projects" className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          {t('Back to the main page')}
        </a>
      </div>
    );
  }
}
