interface IButton {
  onClick?: () => void;
  text: string;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}

export const Button = ({
  onClick,
  text,
  className,
  type,
  disabled,
}: IButton) => {
  return (
    <button
      className={`px-6 py-3 bg-zinc-800 text-zinc-100 rounded-md  ${className} ${
        !disabled && "cursor-pointer"
      }`}
      type={type}
      onClick={onClick}
      disabled={disabled}
    >
      {text}
    </button>
  );
};
