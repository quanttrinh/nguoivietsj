import {
  FORM_CONDITION_NODE,
  FORM_CONDITION_OPERATOR,
} from "~/events/domain/form-schema/constants";
import type { FormCondition } from "~/events/domain/form-schema/types";

export type FormValue = string | number | boolean | null | undefined;

export function isPresent(value: FormValue): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return true;
}

/** Evaluate a declarative form condition against submitted or default values. */
export function evaluateCondition(
  condition: FormCondition,
  read: (ref: string) => FormValue,
): boolean {
  if (FORM_CONDITION_NODE.all in condition) {
    return condition.all.every((child) => evaluateCondition(child, read));
  }

  if (FORM_CONDITION_NODE.any in condition) {
    return condition.any.some((child) => evaluateCondition(child, read));
  }

  if (FORM_CONDITION_NODE.not in condition) {
    return !evaluateCondition(condition.not, read);
  }

  const value = read(condition.field);

  switch (condition.op) {
    case FORM_CONDITION_OPERATOR.equals: {
      return value === condition.value;
    }
    case FORM_CONDITION_OPERATOR.notEquals: {
      return value !== condition.value;
    }
    case FORM_CONDITION_OPERATOR.in: {
      return value !== null && value !== undefined && condition.value.includes(value);
    }
    case FORM_CONDITION_OPERATOR.notIn: {
      return value === null || value === undefined || !condition.value.includes(value);
    }
    case FORM_CONDITION_OPERATOR.exists: {
      return isPresent(value);
    }
    case FORM_CONDITION_OPERATOR.notExists: {
      return !isPresent(value);
    }
    case FORM_CONDITION_OPERATOR.gt: {
      return typeof value === "number" && value > condition.value;
    }
    case FORM_CONDITION_OPERATOR.gte: {
      return typeof value === "number" && value >= condition.value;
    }
    case FORM_CONDITION_OPERATOR.lt: {
      return typeof value === "number" && value < condition.value;
    }
    case FORM_CONDITION_OPERATOR.lte: {
      return typeof value === "number" && value <= condition.value;
    }
    default: {
      return false;
    }
  }
}
