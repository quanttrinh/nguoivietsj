export interface FormBuilderMessages {
  visualBuilder: string;
  visualBuilderHelp: string;
  addSection: string;
  addTextField: string;
  fieldLabel: string;
  fieldRequired: string;
  fieldWidth: string;
  widthFull: string;
  widthHalf: string;
  moveUp: string;
  moveDown: string;
  visualBuilderInvalid: string;
  advancedBuilder: string;
  advancedBuilderHelp: string;
  customFields: string;
  groups: string;
  overrides: string;
  conditions: string;
  fieldType: string;
  helpText: string;
  placeholder: string;
  optionsHelp: string;
  membersHelp: string;
  groupMode: string;
  groupRenderer: string;
  conditionField: string;
  conditionOperator: string;
  conditionValue: string;
  conditionType: string;
  conditionNodeField: string;
  conditionGroupAll: string;
  conditionGroupAny: string;
  conditionGroupNot: string;
  addCondition: string;
  addConditionGroup: string;
  conditionNodeLimit: string;
  removeNode: string;
  addVisibleWhen: string;
  addRequiredWhen: string;
  minLength: string;
  maxLength: string;
  minValue: string;
  maxValue: string;
  step: string;
  rows: string;
  defaultValue: string;
  noCustomFields: string;
  noGroups: string;
}

export type JsonRecord = Record<string, unknown>;

export interface SectionRecord extends JsonRecord {
  key: string;
  order: number;
  label: Record<string, string>;
}

export interface FieldRecord extends JsonRecord {
  ref: string;
  section: string;
  order: number;
  width: string;
}
