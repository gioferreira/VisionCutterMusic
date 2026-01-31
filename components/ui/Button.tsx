'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'red' | 'cyan' | 'orange';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  glow?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', isLoading, disabled, children, ...props }, ref) => {
    const baseStyles = `
      relative inline-flex items-center justify-center gap-2
      font-display uppercase tracking-wider
      border-2
      transition-all duration-150
      disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none
      focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--red)] focus-visible:ring-offset-2
    `;

    const variants = {
      primary: `
        bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]
        hover:bg-[var(--red)] hover:border-[var(--red)]
        hover:-translate-x-0.5 hover:-translate-y-0.5
        hover:shadow-[4px_4px_0_var(--ink)]
        active:translate-x-0 active:translate-y-0 active:shadow-none
      `,
      secondary: `
        bg-transparent text-[var(--ink)] border-[var(--ink)]
        hover:bg-[var(--ink)] hover:text-[var(--paper)]
      `,
      ghost: `
        bg-transparent text-[var(--text-secondary)] border-transparent
        hover:text-[var(--ink)] hover:border-[var(--ink)]
      `,
      red: `
        bg-[var(--red)] text-white border-[var(--red)]
        hover:bg-[var(--ink)] hover:border-[var(--ink)]
        hover:-translate-x-0.5 hover:-translate-y-0.5
        hover:shadow-[4px_4px_0_var(--red)]
        active:translate-x-0 active:translate-y-0 active:shadow-none
      `,
      cyan: `
        bg-[var(--cyan)] text-[var(--ink)] border-[var(--cyan)]
        hover:bg-[var(--ink)] hover:text-[var(--paper)] hover:border-[var(--ink)]
        hover:-translate-x-0.5 hover:-translate-y-0.5
        hover:shadow-[4px_4px_0_var(--cyan)]
        active:translate-x-0 active:translate-y-0 active:shadow-none
      `,
      orange: `
        bg-[var(--orange)] text-[var(--ink)] border-[var(--orange)]
        hover:bg-[var(--ink)] hover:text-[var(--paper)] hover:border-[var(--ink)]
        hover:-translate-x-0.5 hover:-translate-y-0.5
        hover:shadow-[4px_4px_0_var(--orange)]
        active:translate-x-0 active:translate-y-0 active:shadow-none
      `,
    };

    const sizes = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-base',
      lg: 'px-8 py-4 text-lg',
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
