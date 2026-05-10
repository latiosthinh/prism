import React from "react";

interface IconProps {
  name: string;
  filled?: boolean;
  className?: string;
  size?: number;
  title?: string;
}

/**
 * Material Symbols Outlined wrapper.
 * Single source of truth for icons across the panel - ensures consistent
 * font-variation settings (fill, weight, optical size).
 */
export const Icon: React.FC<IconProps> = ({
  name,
  filled = false,
  className = "",
  size,
  title,
}) => {
  const style: React.CSSProperties = {};
  if (typeof size === "number") {
    style.fontSize = `${size}px`;
  }
  return (
    <span
      title={title}
      aria-hidden={title ? undefined : true}
      className={`material-symbols-outlined${filled ? " fill" : ""} ${className}`}
      style={style}
    >
      {name}
    </span>
  );
};

export default Icon;
