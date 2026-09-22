import nodeResolve from '@rollup/plugin-node-resolve';

export default {
  input: 'dist/esm/index.js',
  // Only ESM (tsc → dist/esm) and CJS are emitted. The Capacitor template's
  // IIFE/`unpkg` bundle was dropped in 0.2.0: the web bridge loads
  // `@braze/web-sdk` with a dynamic `import()` of a bare specifier, which a
  // browser cannot resolve from a <script> tag, so that artifact could never
  // work standalone (audit finding A1-21).
  output: [
    {
      file: 'dist/plugin.cjs.js',
      format: 'cjs',
      sourcemap: true,
      inlineDynamicImports: true,
    },
  ],
  external: ['@capacitor/core', '@braze/web-sdk'],
  plugins: [nodeResolve()],
};
