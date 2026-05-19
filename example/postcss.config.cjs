// Empty PostCSS config. Required to prevent Vite from walking up the
// directory tree and picking up the parent monorepo's postcss.config.cjs
// (which references tailwindcss — a dep the example app doesn't need).
module.exports = {};
