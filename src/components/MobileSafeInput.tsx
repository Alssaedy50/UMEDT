import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';

/**
 * Normalizes Arabic-Indic (٠-٩) and Persian (۰-۹) digits to standard ASCII digits (0-9).
 * When `allowDecimal` is enabled, Arabic decimal separators (٫ and ,) are converted to `.`.
 */
export function normalizeNumericDigits(
  value: string,
  allowDecimal = false
): string {
  let out = String(value ?? '')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
  if (allowDecimal) {
    out = out.replace(/[٫،,]/g, '.');
  }
  return out;
}

/**
 * Parses a numeric text string supporting English, Arabic-Indic, and Persian digits.
 * Returns `null` when empty or not a valid finite number.
 */
export function parseFlexibleNumber(
  raw: string,
  options?: { allowDecimal?: boolean; allowNegative?: boolean }
): number | null {
  const allowDecimal = Boolean(options?.allowDecimal);
  const allowNegative = Boolean(options?.allowNegative);
  const normalized = normalizeNumericDigits(raw, allowDecimal).trim();
  if (!normalized) return null;

  const pattern = allowDecimal
    ? allowNegative
      ? /^-?\d*(?:\.\d*)?$/
      : /^\d*(?:\.\d*)?$/
    : allowNegative
      ? /^-?\d+$/
      : /^\d+$/;

  if (!pattern.test(normalized) || normalized === '.' || normalized === '-' || normalized === '-.') {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export interface MobileSafeInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange'
  > {
  value: string;
  onValueChange: (nextValue: string) => void;
  /** Optional raw native onChange callback if needed alongside onValueChange */
  onNativeChange?: React.ChangeEventHandler<HTMLInputElement>;
}

/**
 * Android WebView & Mobile IME-safe text input.
 *
 * Uses an uncontrolled native DOM `<input>` while focused so React re-renders
 * NEVER overwrite `el.value` or abort active Gboard / Samsung / Arabic IME
 * composition sessions (eliminating cursor jumps, duplicated characters,
 * swallowed spaces, and broken Arabic ligatures).
 *
 * Programmatic external updates (resetting forms, switching records, AI auto-fill)
 * are synced into the DOM automatically whenever `value` diverges from the last
 * user-emitted value.
 */
export const MobileSafeInput = forwardRef<HTMLInputElement, MobileSafeInputProps>(
  (
    {
      value,
      onValueChange,
      onNativeChange,
      onCompositionStart,
      onCompositionEnd,
      onBlur,
      onPaste,
      type = 'text',
      autoComplete = 'off',
      autoCorrect = 'off',
      autoCapitalize = 'off',
      spellCheck = false,
      ...rest
    },
    forwardedRef
  ) => {
    const innerRef = useRef<HTMLInputElement | null>(null);
    const lastEmittedRef = useRef<string>(value ?? '');
    const isComposingRef = useRef<boolean>(false);

    useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement);

    // Sync programmatic external value changes into the DOM without fighting user typing
    useEffect(() => {
      const el = innerRef.current;
      const safeVal = value ?? '';
      if (!el) return;
      if (safeVal !== lastEmittedRef.current && el.value !== safeVal) {
        el.value = safeVal;
        lastEmittedRef.current = safeVal;
      }
    }, [value]);

    const emitValue = (nextVal: string) => {
      lastEmittedRef.current = nextVal;
      onValueChange(nextVal);
    };

    return (
      <input
        {...rest}
        ref={innerRef}
        type={type}
        defaultValue={value ?? ''}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
        autoCapitalize={autoCapitalize}
        spellCheck={spellCheck}
        onChange={(e) => {
          emitValue(e.currentTarget.value);
          onNativeChange?.(e);
        }}
        onCompositionStart={(e) => {
          isComposingRef.current = true;
          onCompositionStart?.(e);
        }}
        onCompositionEnd={(e) => {
          isComposingRef.current = false;
          emitValue(e.currentTarget.value);
          onCompositionEnd?.(e);
        }}
        onPaste={(e) => {
          onPaste?.(e);
          const el = e.currentTarget;
          window.setTimeout(() => {
            if (el && el.value !== lastEmittedRef.current) {
              emitValue(el.value);
            }
          }, 0);
        }}
        onBlur={(e) => {
          isComposingRef.current = false;
          const live = e.currentTarget.value;
          if (live !== lastEmittedRef.current) {
            emitValue(live);
          }
          onBlur?.(e);
        }}
      />
    );
  }
);
MobileSafeInput.displayName = 'MobileSafeInput';

export interface MobileSafeTextareaProps
  extends Omit<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    'value' | 'defaultValue' | 'onChange'
  > {
  value: string;
  onValueChange: (nextValue: string) => void;
  onNativeChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
}

/**
 * Android WebView & Mobile IME-safe `<textarea>` companion to `MobileSafeInput`.
 */
export const MobileSafeTextarea = forwardRef<
  HTMLTextAreaElement,
  MobileSafeTextareaProps
>(
  (
    {
      value,
      onValueChange,
      onNativeChange,
      onCompositionStart,
      onCompositionEnd,
      onBlur,
      onPaste,
      autoComplete = 'off',
      autoCorrect = 'off',
      autoCapitalize = 'off',
      spellCheck = false,
      ...rest
    },
    forwardedRef
  ) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const lastEmittedRef = useRef<string>(value ?? '');
    const isComposingRef = useRef<boolean>(false);

    useImperativeHandle(
      forwardedRef,
      () => innerRef.current as HTMLTextAreaElement
    );

    useEffect(() => {
      const el = innerRef.current;
      const safeVal = value ?? '';
      if (!el) return;
      if (safeVal !== lastEmittedRef.current && el.value !== safeVal) {
        el.value = safeVal;
        lastEmittedRef.current = safeVal;
      }
    }, [value]);

    const emitValue = (nextVal: string) => {
      lastEmittedRef.current = nextVal;
      onValueChange(nextVal);
    };

    return (
      <textarea
        {...rest}
        ref={innerRef}
        defaultValue={value ?? ''}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
        autoCapitalize={autoCapitalize}
        spellCheck={spellCheck}
        onChange={(e) => {
          emitValue(e.currentTarget.value);
          onNativeChange?.(e);
        }}
        onCompositionStart={(e) => {
          isComposingRef.current = true;
          onCompositionStart?.(e);
        }}
        onCompositionEnd={(e) => {
          isComposingRef.current = false;
          emitValue(e.currentTarget.value);
          onCompositionEnd?.(e);
        }}
        onPaste={(e) => {
          onPaste?.(e);
          const el = e.currentTarget;
          window.setTimeout(() => {
            if (el && el.value !== lastEmittedRef.current) {
              emitValue(el.value);
            }
          }, 0);
        }}
        onBlur={(e) => {
          isComposingRef.current = false;
          const live = e.currentTarget.value;
          if (live !== lastEmittedRef.current) {
            emitValue(live);
          }
          onBlur?.(e);
        }}
      />
    );
  }
);
MobileSafeTextarea.displayName = 'MobileSafeTextarea';

export interface MobileSafeNumericInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max'
  > {
  /** Current raw string value (e.g. '10' or '') */
  value: string;
  onRawChange: (raw: string) => void;
  onNumberChange?: (parsed: number | null) => void;
  min?: number;
  max?: number;
  allowDecimal?: boolean;
  /** If provided, empty input on blur resets to this number instead of staying empty */
  fallbackOnBlur?: number;
}

/**
 * Android WebView & Arabic/English keyboard-safe numeric input.
 *
 * Fixes ALL common `<input type="number">` failures on mobile & desktop:
 * - Allows clearing the field completely without snapping back to `1` mid-typing.
 * - Accepts English (`0-9`), Arabic-Indic (`٠-٩`), and Persian (`۰-۹`) digits.
 * - Clamps cleanly on blur (never interrupts active editing or deletes cursor state).
 */
export const MobileSafeNumericInput = forwardRef<
  HTMLInputElement,
  MobileSafeNumericInputProps
>(
  (
    {
      value,
      onRawChange,
      onNumberChange,
      min,
      max,
      allowDecimal = false,
      fallbackOnBlur,
      onBlur,
      onPaste,
      autoComplete = 'off',
      autoCorrect = 'off',
      spellCheck = false,
      dir = 'ltr',
      ...rest
    },
    forwardedRef
  ) => {
    const innerRef = useRef<HTMLInputElement | null>(null);
    const lastEmittedRef = useRef<string>(value ?? '');

    useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement);

    useEffect(() => {
      const el = innerRef.current;
      const safeVal = value ?? '';
      if (!el) return;
      if (safeVal !== lastEmittedRef.current && el.value !== safeVal) {
        el.value = safeVal;
        lastEmittedRef.current = safeVal;
      }
    }, [value]);

    const sanitizeRaw = (raw: string): string => {
      const normalized = normalizeNumericDigits(raw, allowDecimal);
      if (allowDecimal) {
        // Keep digits and at most one decimal point
        let seenDot = false;
        let out = '';
        for (const ch of normalized) {
          if (ch >= '0' && ch <= '9') {
            out += ch;
          } else if (ch === '.' && !seenDot) {
            seenDot = true;
            out += '.';
          }
        }
        return out;
      }
      return normalized.replace(/[^\d]/g, '');
    };

    const emitLive = (rawDomValue: string) => {
      const cleaned = sanitizeRaw(rawDomValue);
      lastEmittedRef.current = cleaned;
      onRawChange(cleaned);
      const parsed = parseFlexibleNumber(cleaned, { allowDecimal });
      onNumberChange?.(parsed);
    };

    const finalizeOnBlur = (el: HTMLInputElement) => {
      const cleaned = sanitizeRaw(el.value);
      let parsed = parseFlexibleNumber(cleaned, { allowDecimal });

      if (parsed === null) {
        if (fallbackOnBlur !== undefined) {
          parsed = fallbackOnBlur;
        } else {
          if (el.value !== '') el.value = '';
          lastEmittedRef.current = '';
          onRawChange('');
          onNumberChange?.(null);
          return;
        }
      }

      if (min !== undefined && parsed < min) parsed = min;
      if (max !== undefined && parsed > max) parsed = max;

      const finalStr = String(parsed);
      if (el.value !== finalStr) {
        el.value = finalStr;
      }
      lastEmittedRef.current = finalStr;
      onRawChange(finalStr);
      onNumberChange?.(parsed);
    };

    return (
      <input
        {...rest}
        ref={innerRef}
        type="text"
        inputMode={allowDecimal ? 'decimal' : 'numeric'}
        dir={dir}
        defaultValue={value ?? ''}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
        spellCheck={spellCheck}
        onChange={(e) => {
          emitLive(e.currentTarget.value);
        }}
        onCompositionEnd={(e) => {
          emitLive(e.currentTarget.value);
        }}
        onPaste={(e) => {
          onPaste?.(e);
          const el = e.currentTarget;
          window.setTimeout(() => {
            if (el) emitLive(el.value);
          }, 0);
        }}
        onBlur={(e) => {
          finalizeOnBlur(e.currentTarget);
          onBlur?.(e);
        }}
      />
    );
  }
);
MobileSafeNumericInput.displayName = 'MobileSafeNumericInput';
