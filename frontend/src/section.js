/**
 * The two sections of the app: websites made for WordPress (a plugin that builds the site) and
 * websites made with code (a static site: HTML, CSS, JavaScript, downloaded as a zip).
 * The section is what the Projects page lists and what a new project is; it is remembered in the browser.
 */
import { useEffect, useState } from 'react';

export const SECTIONS = ['wordpress', 'code'];
export const SECTION_LABELS = { wordpress: 'WordPress', code: 'Code (HTML, CSS, JS)' };

const KEY = 'esg-section';
const EVENT = 'esg-section';

export function getSection() {
  try {
    const v = localStorage.getItem(KEY);
    return SECTIONS.includes(v) ? v : 'wordpress';
  } catch {
    return 'wordpress';
  }
}

export function setSection(section) {
  if (!SECTIONS.includes(section)) return;
  try {
    localStorage.setItem(KEY, section);
  } catch {
    /* private mode: the section lasts for this page */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: section }));
}

/** [section, setSection]: every component using it follows the switch of the header. */
export function useSection() {
  const [section, set] = useState(getSection);
  useEffect(() => {
    const on = (e) => set(e.detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [section, setSection];
}
