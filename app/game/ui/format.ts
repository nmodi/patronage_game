export const capitalizeLabel = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

/** 1 → "1st", 2 → "2nd", 11 → "11th" … */
export const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};
