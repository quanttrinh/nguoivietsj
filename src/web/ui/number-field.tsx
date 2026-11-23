import { Field } from '@ark-ui/solid/field';
import { NumberInput } from '@ark-ui/solid/number-input';
import type { ComponentProps, JSX } from 'solid-js';
import { Show, splitProps } from 'solid-js';

import { cn } from '~web/lib/utils';
import {
  fieldGroupStyles,
  fieldRootStyles,
  inputStyles,
  labelVariants,
} from './field';

import ChevronUp from 'lucide-solid/icons/chevron-up';
import ChevronDown from 'lucide-solid/icons/chevron-down';

type NumberFieldRootProps = ComponentProps<typeof Field.Root> &
  ComponentProps<typeof NumberInput.Root> & {
    children?: JSX.Element;
  };

const NumberField = (props: NumberFieldRootProps) => {
  const [local, numberInputProps, others] = splitProps(
    props,
    ['class', 'children'],
    [
      'min',
      'max',
      'step',
      'defaultValue',
      'value',
      'onValueChange',
      'name',
      'disabled',
      'readOnly',
      'required',
      'allowMouseWheel',
      'clampValueOnBlur',
      'formatOptions',
      'inputMode',
      'locale',
      'pattern',
      'spinOnPress',
    ]
  );
  return (
    <Field.Root
      class={cn(fieldRootStyles, local.class)}
      {...others}
    >
      <NumberInput.Root {...numberInputProps}>
        {local.children}
      </NumberInput.Root>
    </Field.Root>
  );
};

type NumberFieldControlProps = ComponentProps<typeof NumberInput.Control>;

const NumberFieldControl = (props: NumberFieldControlProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <NumberInput.Control
      class={cn(fieldGroupStyles, local.class)}
      {...others}
    />
  );
};

const NumberFieldContext = NumberInput.Context;

type NumberFieldLabelProps = ComponentProps<typeof NumberInput.Label>;

const NumberFieldLabel = (props: NumberFieldLabelProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <NumberInput.Label
      class={cn(labelVariants(), local.class)}
      {...others}
    />
  );
};

type NumberFieldInputProps = ComponentProps<typeof NumberInput.Input>;

const NumberFieldInput = (props: NumberFieldInputProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <NumberInput.Input
      inputMode='numeric'
      class={cn(inputStyles, local.class)}
      {...others}
    />
  );
};

type NumberFieldIncrementTriggerProps = ComponentProps<
  typeof NumberInput.IncrementTrigger
> & {
  children?: JSX.Element;
};

const NumberFieldIncrementTrigger = (
  props: NumberFieldIncrementTriggerProps
) => {
  const [local, others] = splitProps(props, ['class', 'children']);
  return (
    <NumberInput.IncrementTrigger
      class={cn(
        'absolute right-1 top-1 inline-flex size-4 items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed',
        local.class
      )}
      {...others}
    >
      <Show
        when={local.children}
        fallback={<ChevronUp class='w-4 h-4' />}
      >
        {(children) => children()}
      </Show>
    </NumberInput.IncrementTrigger>
  );
};

type NumberFieldDecrementTriggerProps = ComponentProps<
  typeof NumberInput.DecrementTrigger
> & {
  children?: JSX.Element;
};

const NumberFieldDecrementTrigger = (
  props: NumberFieldDecrementTriggerProps
) => {
  const [local, others] = splitProps(props, ['class', 'children']);
  return (
    <NumberInput.DecrementTrigger
      class={cn(
        'absolute bottom-1 right-1 inline-flex size-4 items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed',
        local.class
      )}
      {...others}
    >
      <Show
        when={local.children}
        fallback={<ChevronDown class='w-4 h-4' />}
      >
        {(children) => children()}
      </Show>
    </NumberInput.DecrementTrigger>
  );
};

type NumberFieldErrorMessageProps = ComponentProps<typeof Field.ErrorText>;

const NumberFieldErrorMessage = (props: NumberFieldErrorMessageProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <Field.ErrorText
      class={cn(labelVariants({ variant: 'error' }), local.class)}
      {...others}
    />
  );
};

type NumberFieldHelperTextProps = ComponentProps<typeof Field.HelperText>;

const NumberFieldHelperText = (props: NumberFieldHelperTextProps) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <Field.HelperText
      class={cn(labelVariants({ variant: 'description' }), local.class)}
      {...others}
    />
  );
};

export {
  NumberField,
  NumberFieldControl,
  NumberFieldContext,
  NumberFieldLabel,
  NumberFieldInput,
  NumberFieldIncrementTrigger,
  NumberFieldDecrementTrigger,
  NumberFieldErrorMessage,
  NumberFieldHelperText,
};
