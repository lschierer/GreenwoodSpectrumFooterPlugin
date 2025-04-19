import { greenwoodPluginPostCss } from '@greenwood/plugin-postcss';
import { greenwoodPluginImportRaw } from '@greenwood/plugin-import-raw';

import type { Config } from '@greenwood/cli';

// For local development, import from the TypeScript source
import { ExternalPluginFooterSection } from './src/plugins/FooterSectionPlugin.ts';

const config: Config = {
  useTsc: true,
  activeContent: true,
  isolation: true,
  optimization: 'default',
  prerender: false,
  staticRouter: false,
  markdown: {
    plugins: ['rehype-autolink-headings', 'remark-alerts', 'remark-gfm', 'remark-rehype'],
  },
  plugins: [
    greenwoodPluginImportRaw(),
    ExternalPluginFooterSection({
      debug: true,
      isDevelopment: true,
      privacypolicy: false,
      authors: 'git',
      repo: 'file://.',
    }),
    greenwoodPluginPostCss({
      extendConfig: true,
    }),
  ],
};

export default config;
