import git from 'isomorphic-git';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import { z } from 'zod';
// This must be a subset of the config schema in @hp-stuff/schemas
export const Config = z
    .object({
    debug: z.boolean(),
    isDevelopment: z.boolean().optional().default(false),
    repo: z.string(),
    privacypolicy: z.union([z.string(), z.literal('false'), z.literal(false)]),
    authors: z.union([z.literal('git'), z.string().array()]),
    branch: z.string().default('main').optional(),
})
    .strip();
const RepoData = z.object({
    path: z.string(),
    headrev: z.string(),
    authors: z
        .object({
        name: z.string(),
        email: z.string().optional(),
    })
        .array(),
    firstDate: z.date(),
});
class FooterSectionResource {
    /* @ts-expect-error unused variable  */
    compilation;
    options;
    cacheLocation = path.join(process.cwd(), '.footer-section-plugin.cache.json');
    repoData = {
        headrev: '',
        path: '',
        authors: [],
        firstDate: new Date(),
    };
    contentType;
    constructor(compilation, options) {
        this.compilation = compilation;
        if (!Object.keys(options).includes('this.options.debug')) {
            options.debug = false;
        }
        const valid = Config.safeParse(options);
        if (!valid.success) {
            console.error(`FooterSectionResource cannot parse its options: ${valid.error.message}`, JSON.stringify(options));
            throw new Error(`invalid options: ${JSON.stringify(options)}; ${valid.error.message}`);
        }
        this.options = valid.data;
        if (this.options.repo.startsWith('file://')) {
            this.repoData.path = this.options.repo.replace('file://', '');
        }
        else {
            this.repoData.path = this.options.repo;
        }
        if (this.repoData.path.startsWith('.')) {
            this.repoData.path = path.join(process.cwd(), this.repoData.path);
        }
        if (this.options && this.options.debug) {
            console.log(`this.options.repo is ${this.options.repo}`);
            console.log(`this.repo is ${this.repoData.path}`);
        }
        this.contentType = 'text/html';
    }
    writeCache = (data) => {
        fs.writeFileSync(this.cacheLocation, JSON.stringify(data), { encoding: 'utf-8' });
    };
    getCache = async () => {
        if (fs.existsSync(this.cacheLocation)) {
            const data = fs.readFileSync(this.cacheLocation, { encoding: 'utf-8' });
            const valid = RepoData.safeParse(data);
            if (valid.success) {
                const headCommit = await git.log({
                    fs,
                    dir: valid.data.path,
                    ref: 'HEAD',
                    depth: 1,
                });
                const found = headCommit.find(c => c.oid === valid.data.headrev);
                if (found) {
                    return valid.data;
                }
            }
        }
        return null;
    };
    async shouldIntercept(url, request, response) {
        /*start work around for GetFrontmatter requiring async */
        await new Promise(resolve => setTimeout(resolve, 1));
        /* end workaround */
        const responseContentType = response.headers.get('Content-Type');
        if (responseContentType) {
            return (responseContentType.indexOf(this.contentType) >= 0 && !url.pathname.startsWith('/api/'));
        }
        return false;
    }
    async intercept(url, request, response) {
        const body = await response.text();
        const authors = await this.getAuthors();
        const firstYear = await this.getFirstYear();
        const today = new Date();
        let copyrightText;
        if (firstYear.getFullYear() == today.getFullYear()) {
            copyrightText = `©${today.getFullYear()} ${Array.isArray(authors) ? authors.map((a) => a).join(', ') : authors}`;
        }
        else {
            copyrightText = `©${firstYear.getFullYear()} - ${today.getFullYear()} ${Array.isArray(authors) ? authors.map((a) => a).join(', ') : authors}`;
        }
        // Process HTML with unified/rehype
        const file = await unified()
            .use(rehypeParse, { fragment: false })
            .use(() => tree => {
            visit(tree, 'element', (node) => {
                if (node.tagName === 'footer' &&
                    node.properties.className &&
                    Array.isArray(node.properties.className) &&
                    node.properties.className.includes('footer')) {
                    const tempTree = unified()
                        .use(rehypeParse, { fragment: true })
                        .parse(this.getPrivacyPolicy());
                    const en = tempTree.children.filter(child => child.type === 'element');
                    node.children.push(...en);
                }
            });
            visit(tree, 'element', (node) => {
                if ('id' in node.properties && node.properties.id === 'copyright') {
                    if (this.options.debug) {
                        console.log(`found footerCopyrightElement for ${url.pathname}`);
                    }
                    // Clear existing children and add new text node
                    node.children = [
                        {
                            type: 'text',
                            value: copyrightText,
                        },
                    ];
                }
            });
        })
            .use(rehypeStringify)
            .process(body);
        this.writeCache(this.repoData);
        return new Response(String(file), {
            headers: response.headers,
        });
    }
    // Shared method to get commits from all branches
    async populateCache() {
        if (this.options.debug) {
            console.log(`Getting all commits from repository: ${this.repoData.path}`);
        }
        const allCommits = [];
        try {
            const head = await git.log({
                fs,
                dir: this.repoData.path,
                ref: 'HEAD',
                depth: 1,
            });
            if (head.length) {
                this.repoData.headrev = head[0].oid;
            }
            // First, get all branches
            const branches = await git.listBranches({
                fs,
                dir: this.repoData.path,
            });
            if (this.options.debug) {
                console.log(`Found branches: ${branches.join(', ')}`);
            }
            // Collect commits from all branches
            for (const branch of branches) {
                try {
                    const branchCommits = await git.log({
                        fs,
                        dir: this.repoData.path,
                        ref: branch,
                        depth: 500, // Increase depth to get more history
                    });
                    if (branchCommits.length) {
                        allCommits.push(...branchCommits);
                    }
                }
                catch (error) {
                    console.warn(`Error getting commit history for branch ${branch}:`, error);
                }
            }
            // Also try to get all commits using HEAD
            try {
                const headCommits = await git.log({
                    fs,
                    dir: this.repoData.path,
                    ref: 'HEAD',
                    depth: 1000,
                });
                if (headCommits.length) {
                    allCommits.push(...headCommits);
                }
            }
            catch (error) {
                console.warn(`Error getting all commit history:`, error);
            }
        }
        catch (error) {
            if (this.options.debug) {
                console.error(`Error getting commit history: `, error);
            }
        }
        // Remove duplicate commits by commit hash
        const uniqueCommits = new Map();
        for (const commit of allCommits) {
            if (!uniqueCommits.has(commit.oid)) {
                uniqueCommits.set(commit.oid, commit);
                const cachedUnixDate = Math.floor(this.repoData.firstDate.getTime() / 1000);
                if (commit.commit.author.timestamp < cachedUnixDate) {
                    this.repoData.firstDate = new Date(commit.commit.author.timestamp * 1000);
                }
                const ae = this.repoData.authors.find(a => {
                    if (!commit.commit.author.name.localeCompare(a.name)) {
                        if (commit.commit.author.email.length && a.email) {
                            if (!commit.commit.author.email.localeCompare(a.email)) {
                                return true;
                            }
                        }
                        else if (!commit.commit.author.email.length && a.email === undefined) {
                            return true;
                        }
                    }
                    return false;
                });
                if (ae === undefined) {
                    if (commit.commit.author.email.length) {
                        this.repoData.authors.push({
                            name: commit.commit.author.name,
                            email: commit.commit.author.email,
                        });
                    }
                    else {
                        this.repoData.authors.push({
                            name: commit.commit.author.name,
                        });
                    }
                }
            }
        }
    }
    getPrivacyPolicy = () => {
        if (this.options &&
            typeof this.options.privacypolicy === 'string' &&
            this.options.privacypolicy.localeCompare('false')) {
            return `
        <span class="privacy spectrum-Detail spectrum-Detail--serif spectrum-Detail--sizeM spectrum-Detail--light">
          <a href="${this.options.privacypolicy}" class="spectrum-Link spectrum-Link--quiet spectrum-Link--primary">
            Privacy Policy
          </a>
        </span>
      `;
        }
        else {
            return '';
        }
    };
    getFirstYear = async () => {
        if (this.options.debug) {
            console.log(`start of getFirstYear`);
        }
        const cache = await this.getCache();
        if (cache && cache.headrev == this.repoData.headrev && cache.path == this.repoData.path) {
            const repoDataDate = Math.floor(this.repoData.firstDate.getTime() / 1000);
            const cachedDate = Math.floor(cache.firstDate.getTime() / 1000);
            if (cachedDate < repoDataDate) {
                this.repoData = cache;
            }
            else {
                await this.populateCache();
            }
        }
        else {
            await this.populateCache();
        }
        return this.repoData.firstDate;
    };
    getAuthors = async () => {
        const repoAuthors = new Set();
        if (this.options && this.options.authors !== 'git' && Array.isArray(this.options.authors)) {
            for (const author of this.options.authors) {
                repoAuthors.add(author);
            }
        }
        else {
            const mailmapPath = path.join(this.repoData.path, '.mailmap');
            const hasMailmap = fs.existsSync(mailmapPath);
            if (this.options.debug && hasMailmap) {
                console.log(`Found .mailmap file at ${mailmapPath}`);
            }
            const cache = await this.getCache();
            if (cache && cache.headrev == this.repoData.headrev && cache.path == this.repoData.path) {
                const repoDataDate = Math.floor(this.repoData.firstDate.getTime() / 1000);
                const cachedDate = Math.floor(cache.firstDate.getTime() / 1000);
                if (cachedDate < repoDataDate) {
                    if (this.options.debug) {
                        console.log(`using cached data, authors are ${JSON.stringify(cache.authors)}`);
                    }
                    this.repoData = cache;
                }
                else {
                    await this.populateCache();
                }
            }
            else {
                await this.populateCache();
            }
            if (hasMailmap) {
                try {
                    const mailmapContent = fs.readFileSync(mailmapPath, 'utf8');
                    const mailmapEntries = this.parseMailmap(mailmapContent);
                    for (const author of this.repoData.authors) {
                        const normalized = this.getNormalizedAuthor(author.name, author.email ?? '', mailmapEntries);
                        if (this.options.debug) {
                            console.log(`adding ${JSON.stringify(author)} normalized to ${normalized}`);
                        }
                        repoAuthors.add(normalized);
                    }
                }
                catch (error) {
                    console.warn(`Error processing .mailmap file:`, error);
                    // Fallback to regular author processing
                    for (const a of this.repoData.authors) {
                        repoAuthors.add(a.name);
                    }
                }
            }
            else {
                for (const a of this.repoData.authors) {
                    repoAuthors.add(a.name);
                }
            }
        }
        return [...repoAuthors];
    };
    // Parse mailmap file into a map of email -> canonical name
    parseMailmap(content) {
        const mailmap = new Map();
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('#'))
                continue;
            // Parse mailmap line
            // Format can be:
            // Canonical Name <canonical@email> Name <email>
            // Canonical Name <canonical@email> <email>
            // Canonical Name Name <email>
            // <canonical@email> <email>
            const match = trimmedLine.match(/^([^<]+)?(?:<([^>]+)>)?\s+(?:([^<]+)?(?:<([^>]+)>)?)?$/);
            if (match) {
                const [, canonicalName, canonicalEmail, name, email] = match;
                if (email) {
                    // If we have an email, use it as the key
                    mailmap.set(email.trim(), (canonicalName || name || '').trim());
                }
                else if (canonicalEmail && name) {
                    // Handle case where there's no <email> but a name and canonical email
                    mailmap.set(canonicalEmail.trim(), canonicalName.trim());
                }
            }
        }
        return mailmap;
    }
    // Get normalized author name based on mailmap
    getNormalizedAuthor(name, email, mailmap) {
        // Check if this email has a mapping
        if (mailmap.has(email)) {
            const canonicalName = mailmap.get(email);
            if (canonicalName && canonicalName.length > 0) {
                return canonicalName;
            }
        }
        // No mapping found, return original name
        return name;
    }
}
const ExternalPluginFooterSection = (options = {}) => {
    if (!options || Object.keys(options).length < 2) {
        throw new Error(`invalid options object: ${JSON.stringify(options)}`);
    }
    return [
        {
            type: 'resource',
            name: 'external-plugin-footersecton',
            provider: compilation => new FooterSectionResource(compilation, options),
        },
    ];
};
export { ExternalPluginFooterSection };
// NOTE: This implementation includes a custom .mailmap parser as a workaround
// until isomorphic-git natively supports .mailmap files.
// See: https://github.com/isomorphic-git/isomorphic-git/issues/1600
//# sourceMappingURL=FooterSectionPlugin.js.map