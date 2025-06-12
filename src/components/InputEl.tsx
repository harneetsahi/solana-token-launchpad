interface InputProps {
  type: React.HTMLInputTypeAttribute | undefined;
  placeholder: string;
  value: string | number | "";
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  required?: boolean;
}

export const InputEl = ({
  type,
  placeholder,
  value,
  onChange,
  className,
  required,
}: InputProps) => {
  return (
    <input
      className={`px-4 py-1.5 rounded-md border-1 border-zinc-200 w-full ${className}`}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      required={required}
    />
  );
};
