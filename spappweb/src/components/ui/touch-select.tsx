import { cn } from "@/lib/utils";

type TouchSelectOption = {
  value: string;
  label: string;
};

type TouchSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: TouchSelectOption[];
  className?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  "aria-label"?: string;
};

export function TouchSelect({
  value,
  onChange,
  options,
  className,
  id,
  name,
  disabled,
  required,
  placeholder,
  "aria-label": ariaLabel,
}: TouchSelectProps) {
  return (
    <select
      id={id}
      name={name}
      value={value}
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "min-h-11 w-full touch-manipulation rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
    >
      {placeholder != null && (
        <option value="">{placeholder}</option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
