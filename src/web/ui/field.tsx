import { cva } from 'class-variance-authority';

/**
 * Shared input styles for text and number fields
 */
export const inputStyles =
  'flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[invalid]:border-error data-[invalid]:text-error';

/**
 * Shared textarea styles
 */
export const textareaStyles =
  'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[invalid]:border-error data-[invalid]:text-error';

/**
 * Shared field group styles (for number field with increment/decrement buttons)
 */
export const fieldGroupStyles = 'relative rounded-md';

/**
 * Shared field root/container styles
 */
export const fieldRootStyles = 'flex flex-col gap-1';

/**
 * Shared label variants for labels, descriptions, and error messages
 */
export const labelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
  {
    variants: {
      variant: {
        label: 'data-[invalid]:text-destructive',
        description: 'font-normal text-muted-foreground',
        error: 'text-xs text-destructive',
      },
    },
    defaultVariants: {
      variant: 'label',
    },
  }
);
