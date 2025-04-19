# Greenwood Spectrum Top Header Plugin

A plugin for Greenwood that adds a top header component.

## Installation

This package is designed to be used as a Git dependency. Add it to your project:

```bash
# Using pnpm
pnpm add github:schierer/GreenwoodSpectrumFooterPlugin#main

# Using npm
npm install github:schierer/GreenwoodSpectrumFooterPlugin
```

Or add directly to your package.json:

```json
{
  "dependencies": {
    "topheader-plugin": "github:schierer/GreenwoodSpectrumFooterPlugin#main"
  }
}
```

## Usage

Import and use the plugin in your Greenwood configuration:

```typescript
// greenwood.config.ts
import { FooterSectionPlugin } from 'topheader-plugin';

export default {
  plugins: [
    FooterSectionPlugin({
      siteTitle: 'My Site',
      topLevelSections: ['Home', 'About', 'Contact'],
      siteLogo: 'path/to/logo.svg', // optional
      debug: false,
    }),
  ],
};
```

## Development

This project uses:

- TypeScript
- ESLint with flat configuration
- Prettier for code formatting

### Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm serve` - Serve production build
- `pnpm prepare` - Build the distribution files (runs automatically on install)
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Fix ESLint issues
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check if files are formatted correctly

### Linting and Formatting

This project uses ESLint with a flat configuration file (`eslint.config.js`) for linting TypeScript code. Prettier is used for code formatting, and as per Prettier's recommendation, it's called directly from package.json scripts rather than through an ESLint plugin.

To maintain code quality:

1. Run `pnpm lint` to check for linting issues
2. Run `pnpm format` to format all files according to Prettier rules
