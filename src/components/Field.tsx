import { useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  value: string;
  onChange: (v: string) => void;
  label: string;
  icon?: string;
  type?: string;
  placeholder?: string;
  error?: string;
  maxLength?: number;
  inputMode?: 'text' | 'numeric' | 'tel';
  textarea?: boolean;
  onEnter?: () => void;
}

/** Premium floating-label input / textarea. */
export default function Field({
  value,
  onChange,
  label,
  icon,
  type = 'text',
  placeholder,
  error,
  maxLength,
  inputMode,
  textarea,
  onEnter,
}: Props) {
  const [focused, setFocused] = useState(false);
  const floated = focused || value.length > 0;
  const ring = error ? '#E10600' : focused ? '#E10600' : 'rgba(30,18,6,0.10)';

  return (
    <div>
      <div
        className="relative flex items-center rounded-[20px] bg-white transition-shadow"
        style={{
          border: `2px solid ${ring}`,
          boxShadow: focused ? '0 0 0 4px rgba(225,6,0,0.10)' : '0 4px 14px rgba(180,60,0,0.05)',
        }}
      >
        {icon && (
          <div className="ms-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-cream text-lg">
            {icon}
          </div>
        )}
        <div className="relative flex-1">
          <motion.label
            initial={false}
            animate={{
              y: floated ? -11 : 0,
              scale: floated ? 0.82 : 1,
              color: error ? '#E10600' : focused ? '#E10600' : '#B7A895',
            }}
            transition={{ duration: 0.16 }}
            className="pointer-events-none absolute start-0 top-1/2 -translate-y-1/2 origin-[right_center] px-3 text-[15px] font-bold rtl:origin-[right_center] ltr:origin-[left_center]"
            style={{ insetInlineStart: 4 }}
          >
            {label}
          </motion.label>
          {textarea ? (
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={floated ? placeholder : ''}
              maxLength={maxLength}
              className="h-24 w-full resize-none bg-transparent px-3 pb-2 pt-5 text-[15px] font-bold text-brand-ink outline-none placeholder:font-semibold placeholder:text-brand-muted/60"
            />
          ) : (
            <input
              value={value}
              type={type}
              inputMode={inputMode}
              maxLength={maxLength}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
              placeholder={floated ? placeholder : ''}
              className="w-full bg-transparent px-3 pb-2.5 pt-6 text-[15px] font-bold text-brand-ink outline-none placeholder:font-semibold placeholder:text-brand-muted/60"
            />
          )}
        </div>
      </div>
      {error && <div className="ms-1 mt-1.5 text-[12px] font-bold text-brand-red">⚠ {error}</div>}
    </div>
  );
}
