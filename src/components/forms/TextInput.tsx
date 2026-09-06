import React from "react";

export interface TextInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
  helperText?: string;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ id, label, error, helperText, className = "", required, ...props }, ref) => {
    const errorId = `${id}-error`;
    const helperId = `${id}-helper`;
    const describedBy = error ? errorId : helperText ? helperId : undefined;

    return (
      <div className="flex flex-col gap-1 w-full text-left">
        <label
          htmlFor={id}
          className="text-sm font-medium text-on-surface-variant flex items-center justify-between"
        >
          <span>
            {label}
            {required && <span className="text-error ml-1" aria-hidden="true">*</span>}
          </span>
        </label>
        <input
          ref={ref}
          id={id}
          required={required}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`w-full px-3 py-2.5 rounded border text-sm text-on-surface bg-surface-container-lowest placeholder:text-outline transition-colors outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${
            error
              ? "border-error focus:ring-error"
              : "border-outline focus:border-primary"
          } ${className}`}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="text-xs text-error font-medium mt-0.5">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={helperId} className="text-xs text-outline font-normal mt-0.5">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

TextInput.displayName = "TextInput";
