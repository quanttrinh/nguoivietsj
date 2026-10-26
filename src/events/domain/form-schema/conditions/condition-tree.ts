import { FORM_CONDITION_NODE } from "~/events/domain/form-schema/constants";

export type ConditionNode = Record<string, unknown>;
export type ConditionNodeType = "field" | "all" | "any" | "not";

function asNode(value: unknown): ConditionNode {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as ConditionNode)
    : {};
}

export function conditionNodeType(value: unknown): ConditionNodeType {
  const condition = asNode(value);

  if (FORM_CONDITION_NODE.all in condition) {
    return "all";
  }
  if (FORM_CONDITION_NODE.any in condition) {
    return "any";
  }
  if (FORM_CONDITION_NODE.not in condition) {
    return "not";
  }

  return "field";
}

export function conditionChildren(
  value: unknown,
  type: ConditionNodeType = conditionNodeType(value),
): ConditionNode[] {
  const condition = asNode(value);

  if (type === "not") {
    const child = asNode(condition[FORM_CONDITION_NODE.not]);
    return Object.keys(child).length === 0 ? [] : [child];
  }

  if (type === "all" || type === "any") {
    const children = condition[type];

    return Array.isArray(children)
      ? children.map((child) => asNode(child)).filter((child) => Object.keys(child).length > 0)
      : [];
  }

  return [condition];
}

export function countConditionNodes(value: unknown): number {
  const type = conditionNodeType(value);

  if (type === "field") {
    return 1;
  }

  return (
    1 +
    conditionChildren(value, type).reduce((total, child) => total + countConditionNodes(child), 0)
  );
}

export function conditionDepth(value: unknown): number {
  const type = conditionNodeType(value);

  if (type === "field") {
    return 1;
  }

  return 1 + Math.max(0, ...conditionChildren(value, type).map((child) => conditionDepth(child)));
}

export function firstConditionLeaf(value: unknown): ConditionNode | null {
  if (conditionNodeType(value) === "field") {
    return asNode(value);
  }

  for (const child of conditionChildren(value)) {
    const leaf = firstConditionLeaf(child);

    if (leaf !== null) {
      return leaf;
    }
  }

  return null;
}

export function firstConditionChild(value: unknown): ConditionNode | null {
  return conditionChildren(value)[0] ?? null;
}
