import { Input } from "@/components/ui/input";
import { forwardRef, useState, useEffect, ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number | string;
  onChange: (val: number) => void;
  allowDecimal?: boolean;
  min?: number;
  max?: number;
};

/** Numeric input that doesn't show leading zero, clears 0 on focus, and prevents negatives. */
const NumberInput = forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, allowDecimal = true, min = 0, max, ...rest }, ref) => {
    const initial = value === 0 || value === "0" ? "" : String(value);
    const [text, setText] = useState<string>(initial);

    useEffect(() => {
      // Sync external value when not focused
      if (document.activeElement !== (ref as any)?.current) {
        setText(value === 0 || value === "0" || value === "" ? "" : String(value));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
      <Input
        ref={ref}
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        value={text}
        onFocus={(e) => {
          if (text === "0") setText("");
          rest.onFocus?.(e);
          e.target.select();
        }}
        onBlur={(e) => {
          if (text === "" || text === "-") {
            setText("");
            onChange(0);
          }
          rest.onBlur?.(e);
        }}
        onChange={(e) => {
          let v = e.target.value;
          // Allow empty
          if (v === "") {
            setText("");
            onChange(0);
            return;
          }
          // Strip non-numeric
          const re = allowDecimal ? /^[0-9]*\.?[0-9]*$/ : /^[0-9]*$/;
          if (!re.test(v)) return;
          // Strip leading zeros (but keep "0." for decimals)
          if (v.length > 1 && v.startsWith("0") && !v.startsWith("0.")) v = v.replace(/^0+/, "") || "0";
          setText(v);
          const n = Number(v);
          if (!isNaN(n)) {
            let final = n;
            if (final < min) final = min;
            if (max !== undefined && final > max) final = max;
            onChange(final);
          }
        }}
        {...rest}
      />
    );
  }
);
NumberInput.displayName = "NumberInput";
export default NumberInput;
