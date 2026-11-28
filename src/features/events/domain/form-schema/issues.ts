// @boundary shared
import { FORM_ISSUE_SEVERITY } from "~/features/events/domain/form-schema/constants";
import type { FormSchemaIssue } from "~/features/events/domain/form-schema/types";

export class FormSchemaIssues {
  readonly errors: FormSchemaIssue[] = [];
  readonly warnings: FormSchemaIssue[] = [];

  add(issue: FormSchemaIssue): void {
    if (issue.severity === FORM_ISSUE_SEVERITY.error) {
      this.errors.push(issue);
    } else {
      this.warnings.push(issue);
    }
  }

  error(path: string, code: string, message: string): void {
    this.add({ path, code, message, severity: FORM_ISSUE_SEVERITY.error });
  }

  warning(path: string, code: string, message: string): void {
    this.add({ path, code, message, severity: FORM_ISSUE_SEVERITY.warning });
  }
}
