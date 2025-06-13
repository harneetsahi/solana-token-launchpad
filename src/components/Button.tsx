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
      className={`px-6 py-3.5 text-[#0A0E13] bg-[#C7F283] font-medium rounded-xl  ${className} ${
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
