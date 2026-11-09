
import { useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  modal?: (close: () => void) => ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
  secondary:
    'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-blue-500',
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
};

export function Button({
  children,
  className = '',
  modal,
  onClick,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        {...props}
        type={type}
        onClick={(event) => {
          onClick?.(event);
          if (modal) setIsModalOpen(true);
        }}
        className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${variantClasses[variant]} ${className}`.trim()}
      >
        {children}
      </button>
      {isModalOpen && modal?.(() => setIsModalOpen(false))}
    </>
  );
}

export function DeleteButton({ children = 'Delete', ...props }: Omit<ButtonProps, 'variant'>) {
  return (
    <Button {...props} variant="danger">
      {children}
    </Button>
  );
}