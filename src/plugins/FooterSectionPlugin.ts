import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import type { Element } from 'hast';

import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import { z } from 'zod';

import type { Compilation, Resource, ResourcePlugin } from '@greenwood/cli';

export const Config = z.object({
  debug: z.boolean(),
  isDevelopment: z.boolean().optional().default(false),
  toplevelsections: z.string().array(),
  sitelogo: z.string().optional(),
  sitetitle: z.string(),
});
export type Config = z.infer<typeof Config>;

class FooterSectionResource implements Resource {
  private compilation: Compilation;
  private options: Config;
  private contentType;

  constructor(compilation: Compilation, options: object) {
    this.compilation = compilation;
    if (!Object.keys(options).includes('debug')) {
      (options as Config).debug = true;
    }
    const valid = Config.safeParse(options);
    if (!valid.success) {
      console.error(
        `Footer cannot parse its options: ${valid.error.message}`,
        JSON.stringify(options)
      );
    }
    this.options = valid.data as Config;

    this.contentType = 'text/html';
  }

  async shouldIntercept(url: URL, request: Request, response: Response) {
    /*start work around for GetFrontmatter requiring async */
    await new Promise(resolve => setTimeout(resolve, 1));
    /* end workaround */

    const responseContentType = response.headers.get('Content-Type');
    if (responseContentType) {
      return (
        responseContentType.indexOf(this.contentType) >= 0 && !url.pathname.startsWith('/api/')
      );
    }
    return false;
  }

  private getNavSection = () => {
    return this.options
      ? this.options.toplevelsections.length
        ? this.options.toplevelsections
            .map(section => {
              return `
            <div class="navItem">
              <a
                href=${'/' + section.replaceAll(' ', '') + '/'}
                class="spectrum-Link spectrum-Link--primary spectrum-Link--quiet"
              >
                <span class="spectrum-Heading spectrum-Heading--serif spectrum-Heading--sizeXS">${section.replaceAll('_', ' ')}</span>
              </a>
            </div>
          `;
            })
            .join('')
        : ''
      : '';
  };

  private getSvgLogo = (logoPath: string) => {
    const myLogoURL = new URL(`assets/${logoPath}`, this.compilation.context.userWorkspace);
    if (this.options.debug) {
      console.log(`compilation.context is ${JSON.stringify(this.compilation.context)}`);
      console.log(`myLogoURL is ${myLogoURL}`);
    }
    const myLogoPath = fileURLToPath(myLogoURL);
    if (this.options.debug) {
      console.log(`myLogoPath is ${myLogoPath}`);
    }
    const myLogo = fs.readFileSync(myLogoPath, 'utf-8');
    return `
      <div class=" site-logo spectrum-Heading spectrum-Heading--sizeXXL">
        ${myLogo}
      </div>
    `;
  };

  private getImgLogo = (logoPath: string, altText: string) => {
    return `
      <img
        alt=${altText}
        src=${logoPath}
      />
    `;
  };

  private getSiteTitle = () => {
    const siteTitle = this.options ? this.options.sitetitle : '';
    if (this.options.debug) {
      console.log(`siteTitle is ${siteTitle}`);
    }
    const siteLogo = this.options
      ? this.options.sitelogo
        ? this.options.sitelogo.endsWith('.svg')
          ? this.getSvgLogo(this.options.sitelogo)
          : this.getImgLogo(this.options.sitelogo, siteTitle)
        : ''
      : '';

    return `
      <a href='/' class="site-title spectrum-Link spectrum-Link--quiet spectrum-Link--secondary">
        <span class=" site-title spectrum-Heading spectrum-Heading--sizeXS">
          ${siteLogo}
        </span>
      </a>
      <a href='/' class="site-title spectrum-Link spectrum-Link--quiet spectrum-Link--secondary">
        <span class="site-title spectrum-Heading spectrum-Heading--sizeXL">
          ${siteTitle}
        </span>
      </a>
    `;
  };

  private getSection = () => {
    return `
      <div class="header">
        <div class="site-title-section">
          ${this.getSiteTitle()}
        </div>
        <div class="nav">
          ${this.getNavSection()}
        </div>
        <div class=" right-group">
          <div class=" social-icons">
            <SocialIcons {...Astro.props} ></SocialIcons>
          </div>
          <theme-select></theme-select>
        </div>
      </div>
    `;
  };

  async intercept(url: URL, request: Request, response: Response) {
    const body = await response.text();

    const topHeaderSection = this.getSection();
    const file = await unified()
      .use(rehypeParse, { fragment: false })
      .use(() => tree => {
        visit(tree, 'element', (node: Element) => {
          if (node.tagName === 'head') {
            node.children.push({
              type: 'element',
              tagName: 'link',
              properties: {
                href: '/styles/Footer.css',
                rel: 'stylesheet',
              },
              children: [],
            });
            node.children.push({
              type: 'element',
              tagName: 'link',
              properties: {
                href: '/styles/SiteTitle.css',
                rel: 'stylesheet',
              },
              children: [],
            });
            node.children.push({
              type: 'element',
              tagName: 'script',
              properties: {
                src: '/components/ThemeSelector.ts',
                type: 'module',
              },
              children: [],
            });
          }
        });

        visit(tree, 'element', (node: Element) => {
          if (
            node.tagName === 'div' &&
            node.properties.className &&
            Array.isArray(node.properties.className) &&
            node.properties.className.includes('topHeader')
          ) {
            const tempTree = unified().use(rehypeParse, { fragment: true }).parse(topHeaderSection);
            const en = tempTree.children.filter(child => child.type === 'element');
            node.children = en;
          }
        });
      })
      .use(rehypeStringify)
      .process(body);

    return new Response(String(file), {
      headers: response.headers,
    });
  }
}

export const FooterSectionPlugin = (options = {}): ResourcePlugin => {
  return {
    type: 'resource',
    name: 'greenwood-speectrum-theme:FooterSection',
    provider: compilation => new FooterSectionResource(compilation, options),
  };
};
