import type { ResourcePlugin } from '@greenwood/cli';
import { z } from 'zod';
export declare const Config: z.ZodObject<{
    debug: z.ZodBoolean;
    isDevelopment: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    repo: z.ZodString;
    privacyPolicy: z.ZodUnion<[z.ZodString, z.ZodLiteral<"false">, z.ZodLiteral<false>]>;
    authors: z.ZodUnion<[z.ZodLiteral<"git">, z.ZodArray<z.ZodString, "many">]>;
    branch: z.ZodOptional<z.ZodDefault<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    debug: boolean;
    isDevelopment: boolean;
    repo: string;
    privacyPolicy: string | false;
    authors: "git" | string[];
    branch?: string | undefined;
}, {
    debug: boolean;
    repo: string;
    privacyPolicy: string | false;
    authors: "git" | string[];
    isDevelopment?: boolean | undefined;
    branch?: string | undefined;
}>;
export type Config = z.infer<typeof Config>;
declare const ExternalPluginFooterSection: (options: Config) => ResourcePlugin[];
export { ExternalPluginFooterSection };
//# sourceMappingURL=FooterSectionPlugin.d.ts.map