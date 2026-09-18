import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '../utils/cn';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  dot?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'neutral', size = 'md', dot, children, ...props }, ref) => {
    const variants = {
      success: 'bg-success-50 text-success-700 border border-success-200',
      warning: 'bg-warning-50 text-warning-700 border border-warning-200',
      error: 'bg-error-50 text-error-700 border border-error-200',
      info: 'bg-primary-50 text-primary-700 border border-primary-200',
      neutral: 'bg-surface-100 text-surface-700 border border-surface-200',
    };

    const sizes = {
      sm: 'px-2 py-0.5 text-xs gap-1',
      md: 'px-2.5 py-1 text-sm gap-1.5',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center font-medium rounded-full border',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {dot && (
          <span className={cn('w-1.5 h-1.5 rounded-full', {
            'bg-success-500': variant === 'success',
            'bg-warning-500': variant === 'warning',
            'bg-error-500': variant === 'error',
            'bg-primary-500': variant === 'info',
            'bg-surface-400': variant === 'neutral',
          })} />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';