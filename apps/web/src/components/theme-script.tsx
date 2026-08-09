import type { ReactNode } from 'react';

import { THEME_ATTRIBUTE, THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * Applies a stored theme before the page is painted.
 *
 * Without this there is a "flash of wrong theme": the server cannot know
 * someone chose dark, so the HTML arrives with no `data-theme`, the page
 * paints in the system scheme, and React only corrects it after hydration.
 * On a slow connection that is a white screen in someone's face at night.
 *
 * A raw `<script>`, deliberately, and not `next/script`. The obvious
 * choice is `<Script strategy="beforeInteractive">`, and it does not work
 * here: in the App Router that strategy does not emit a blocking script at
 * all. It serialises the code into a `self.__next_s` queue that Next's own
 * runtime drains after the framework bootstraps — which is strictly later
 * than the paint we are trying to beat. Verified by reading the served
 * HTML, not assumed.
 *
 * Rendered as the first child of `<body>` so it executes during parsing,
 * after the stylesheet in `<head>` has been applied and before any element
 * exists to paint. The body is tiny and dependency-free because it sits on
 * the critical path of every page load, and a throw here would leave the
 * document unthemed.
 */

/* Built from the same constants the rest of the app uses, so renaming the
   storage key cannot leave this string pointing at the old one. */
const APPLY_STORED_THEME = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute(${JSON.stringify(
  THEME_ATTRIBUTE,
)},t)}catch(e){}`;

export function ThemeScript(): ReactNode {
  return <script dangerouslySetInnerHTML={{ __html: APPLY_STORED_THEME }} />;
}
