import { describe, expect, test } from "vitest";

import { computeConditionalState } from "../../../../../src/events/domain/form-schema/state";

describe("computeConditionalState", () => {
  test("propagates visibility and required state from a condition", () => {
    const state = computeConditionalState({
      fields: [
        { key: "source", required: false },
        { key: "dependent", required: false },
      ],
      conditions: {
        "custom.dependent": {
          visibleWhen: { field: "custom.source", op: "exists" },
          requiredWhen: { field: "custom.source", op: "exists" },
        },
      },
      groupMemberVisible: () => true,
      readConditionValue: (ref) => (ref === "custom.source" ? "present" : null),
    });

    expect(state.visible.get("custom.dependent")).toBe(true);
    expect(state.required.get("custom.dependent")).toBe(true);
  });
});
