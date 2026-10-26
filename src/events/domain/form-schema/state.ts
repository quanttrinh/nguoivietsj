// @boundary shared
import { evaluateCondition, type FormValue } from "~/events/domain/form-schema/conditions/evaluate";
import { customRef } from "~/events/domain/form-schema/constants";
import { type FormCondition } from "~/events/domain/form-schema/types";

export interface FormStateVisibility {
  visible: Map<string, boolean>;
  required: Map<string, boolean>;
}

export interface FormStateField {
  key: string;
  required: boolean;
}

export interface FormStateConditions {
  visibleWhen: FormCondition | null;
  requiredWhen: FormCondition | null;
}

export interface FormStateComputationInput {
  fields: readonly FormStateField[];
  conditions: Readonly<Record<string, FormStateConditions | undefined>>;
  groupMemberVisible: (ref: string) => boolean;
  readConditionValue: (ref: string, state: FormStateVisibility) => FormValue;
}

/**
 * Shared visibility/required computation used by both the public registration
 * island and server-side registration validation. The value reader and group
 * visibility rule are injected so the client can read form controls while the
 * server reads a `RegistrationInput`.
 */
export function computeConditionalState(input: FormStateComputationInput): FormStateVisibility {
  const { conditions, fields, groupMemberVisible, readConditionValue } = input;
  const visible = new Map<string, boolean>();
  const required = new Map<string, boolean>();
  const state: FormStateVisibility = { visible, required };

  for (const field of fields) {
    const ref = customRef(field.key);
    visible.set(ref, true);
    required.set(ref, field.required);
  }

  /*
   * Conditions may reference other conditional fields, so iterate until the
   * state stabilizes (the schema validator rejects cycles).
   */
  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false;

    for (const field of fields) {
      const ref = customRef(field.key);
      const condition = conditions[ref];
      const visibleCondition = condition?.visibleWhen ?? null;
      const requiredCondition = condition?.requiredWhen ?? null;
      const groupVisible = groupMemberVisible(ref);
      const conditionVisible =
        visibleCondition === null ||
        evaluateCondition(visibleCondition, (target) => readConditionValue(target, state));
      const nextVisible = groupVisible && conditionVisible;
      const nextRequired =
        field.required ||
        (nextVisible &&
          requiredCondition !== null &&
          evaluateCondition(requiredCondition, (target) => readConditionValue(target, state)));

      if (visible.get(ref) !== nextVisible || required.get(ref) !== nextRequired) {
        visible.set(ref, nextVisible);
        required.set(ref, nextRequired);
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return state;
}
