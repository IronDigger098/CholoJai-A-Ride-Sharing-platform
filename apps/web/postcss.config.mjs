/**
 * Tailwind CSS v4 runs as a PostCSS plugin and nothing else runs alongside
 * it. There is no `tailwind.config.js`: v4 is configured from CSS via
 * `@theme`, which is where the design tokens will live in M4.2 — one place
 * that is both the source of truth and the thing the browser actually gets,
 * rather than a JavaScript object compiled into custom properties.
 *
 * @type {import('postcss-load-config').Config}
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
