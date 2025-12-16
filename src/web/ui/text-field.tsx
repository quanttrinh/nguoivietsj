import { Field } from '@ark-ui/solid/field';
import type { ComponentProps } from 'solid-js';
import { mergeProps, splitProps } from 'solid-js';

import { cn } from '~web/lib/utils';
import {
  fieldRootStyles,
  inputStyles,
  labelVariants,
  textareaStyles,
} from './field';

type TextFieldRootProps = ComponentProps<typeof Field.Root>;

const TextField = (props: TextFieldRootProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <Field.Root
      class={cn(fieldRootStyles, local.class)}
      {...others}
    />
  );
};

type TextFieldInputProps = ComponentProps<typeof Field.Input> & {
  type?:
    | 'button'
    | 'checkbox'
    | 'color'
    | 'date'
    | 'datetime-local'
    | 'email'
    | 'file'
    | 'hidden'
    | 'image'
    | 'month'
    | 'number'
    | 'password'
    | 'radio'
    | 'range'
    | 'reset'
    | 'search'
    | 'submit'
    | 'tel'
    | 'text'
    | 'time'
    | 'url'
    | 'week';
};

const TextFieldInput = (rawProps: TextFieldInputProps) => {
  const props = mergeProps({ type: 'text' }, rawProps);
  const [local, others] = splitProps(props, ['type', 'class']);
  return (
    <Field.Input
      type={local.type}
      class={cn(inputStyles, local.class)}
      {...others}
    />
  );
};

type TextFieldTextAreaProps = ComponentProps<typeof Field.Textarea>;

const TextFieldTextArea = (props: TextFieldTextAreaProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <Field.Textarea
      class={cn(textareaStyles, local.class)}
      {...others}
    />
  );
};

type TextFieldLabelProps = ComponentProps<typeof Field.Label>;

const TextFieldLabel = (props: TextFieldLabelProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <Field.Label
      class={cn(labelVariants(), local.class)}
      {...others}
    />
  );
};

type TextFieldHelperTextProps = ComponentProps<typeof Field.HelperText>;

const TextFieldHelperText = (props: TextFieldHelperTextProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <Field.HelperText
      class={cn(labelVariants({ variant: 'description' }), local.class)}
      {...others}
    />
  );
};

type TextFieldErrorMessageProps = ComponentProps<typeof Field.ErrorText>;

const TextFieldErrorMessage = (props: TextFieldErrorMessageProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <Field.ErrorText
      class={cn(labelVariants({ variant: 'error' }), local.class)}
      {...others}
    />
  );
};

export {
  TextField,
  TextFieldInput,
  TextFieldTextArea,
  TextFieldLabel,
  TextFieldHelperText,
  TextFieldErrorMessage,
};
