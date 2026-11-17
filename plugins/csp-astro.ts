// @boundary shared
import type { AstroUserConfig } from "astro";

import {
  CSP_BASE_DIRECTIVES,
  CSP_SCRIPT_RESOURCES,
  CSP_STYLE_RESOURCES,
} from "../src/shared/constants/csp";
import { cspDirectiveName } from "./csp-serialization";

type AstroCspOptions = Exclude<
  NonNullable<AstroUserConfig["security"]>["csp"],
  boolean | undefined
>;

type AstroCspDirective = NonNullable<AstroCspOptions["directives"]>[number];

function isBaseMetaDirective(value: string): value is AstroCspDirective {
  return Object.keys(CSP_BASE_DIRECTIVES).some((key) =>
    value.startsWith(`${cspDirectiveName(key)} `),
  );
}

const CSP_META_DIRECTIVES: AstroCspDirective[] = [
  "default-src 'self'",
  ...Object.entries(CSP_BASE_DIRECTIVES).map(([key, values]) => {
    const directive = `${cspDirectiveName(key)} ${values.join(" ")}`;

    if (!isBaseMetaDirective(directive)) {
      throw new Error(`Invalid CSP directive: ${directive}`);
    }

    return directive;
  }),
];

/** Content-security policy passed to Astro's `security.csp` option. */
export const CSP_CONFIG = {
  scriptDirective: {
    resources: [...CSP_SCRIPT_RESOURCES],
  },
  styleDirective: {
    resources: [...CSP_STYLE_RESOURCES],
  },
  directives: CSP_META_DIRECTIVES,
} satisfies AstroCspOptions;
