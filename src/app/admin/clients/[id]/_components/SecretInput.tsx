'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface Props {
  name: string;
  defaultValue: string;
  placeholder?: string;
  id?: string;
}

/**
 * Password-style input with a local show/hide toggle. Server renders the value
 * (token is already in the admin's browser from the server component fetch,
 * since without it the form couldn't submit intact). Toggle is pure client
 * state — we never log it and never echo it via fetch.
 */
export function SecretInput({ name, defaultValue, placeholder, id }: Props): React.ReactElement {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-xl border border-indigo-500/20 bg-[#0A0A12] pl-4 pr-12 py-2.5 text-sm font-mono text-indigo-100 placeholder:text-indigo-500/40 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Ocultar token' : 'Mostrar token'}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-indigo-300/70 hover:text-cyan-300 transition-colors"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
