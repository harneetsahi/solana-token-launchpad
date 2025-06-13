interface InputProps {
  type: React.HTMLInputTypeAttribute | undefined;
  placeholder?: string;
  value?: string | number | "";
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  required?: boolean;
  id?: string;
  max?: number;
  accept?: string;
}

export const InputEl = ({
  type,
  placeholder,
  value,
  onChange,
  className,
  required,
  id,
  max,
}: InputProps) => {
  return (
    <div
      className="w-full border-1 flex flex-col  border-[#A2EFE6] rounded-xl text-zinc-100 "
      style={{
        backdropFilter: "blur(18px)",
      }}
    >
      <label htmlFor={id} className={`px-4 py-3 w-max text-xs  `}>
        {placeholder}
      </label>
      <input
        maxLength={max}
        id={id}
        className={`outline-0 px-4 py-2 text-lg ${className}`}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
      />
    </div>
  );
};
