import { FORM_ISSUE_SEVERITY } from "~/events/domain/form-schema/constants";
import type { FormSchemaIssue } from "~/events/domain/form-schema/types";

export class FormSchemaIssues {
  public readonly errors: FormSchemaIssue[] = [];
  public readonly warnings: FormSchemaIssue[] = [];

  public add(issue: FormSchemaIssue): void {
    if (issue.severity === FORM_ISSUE_SEVERITY.error) {
      this.errors.push(issue);
    } else {
      this.warnings.push(issue);
    }
  }

  public error(path: string, code: string, message: string): void {
    this.add({ path, code, message, severity: FORM_ISSUE_SEVERITY.error });
  }

  public warning(path: string, code: string, message: string): void {
    this.add({ path, code, message, severity: FORM_ISSUE_SEVERITY.warning });
  }
}
