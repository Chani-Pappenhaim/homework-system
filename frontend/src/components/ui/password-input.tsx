import { useState, forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from '@/components/ui/input';

/** An Input with a show/hide eye toggle — every password field in the app uses this instead of a bare `type="password"` Input. */
const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'endAdornment'>>(
  (props, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        endAdornment={
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible((v) => !v)}
            className="text-ink/40 hover:text-ink"
            aria-label={visible ? 'הסתר סיסמא' : 'הצג סיסמא'}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        }
        {...props}
      />
    );
  }
);
PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
