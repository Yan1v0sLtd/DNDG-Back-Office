// UI primitives. If you need a new one, add it here — don't scatter them.

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const base =
    'inline-flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-accent text-ink hover:bg-amber-400',
    ghost: 'bg-transparent border border-line text-slate-200 hover:bg-panel',
    danger: 'bg-red-600 text-white hover:bg-red-500',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...rest} />;
}

export function Panel({
  title,
  children,
  actions,
  className = '',
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-panel border border-line rounded-lg ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between px-4 py-3 border-b border-line">
          {title && <h2 className="text-sm font-semibold text-slate-200">{title}</h2>}
          {actions && <div className="flex gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted mb-1 uppercase tracking-wide">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted mt-1">{hint}</span>}
    </label>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full bg-ink border border-line rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-accent ${className}`}
      {...rest}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Input
      type="number"
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        onChange(Number.isFinite(n) ? n : 0);
      }}
      {...rest}
    />
  );
}

export function Score({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: number | string;
  hint?: string;
  emphasis?: 'ms' | 'bp';
}) {
  const color =
    emphasis === 'ms' ? 'text-accent' : emphasis === 'bp' ? 'text-cyan-400' : 'text-slate-100';
  return (
    <div className="bg-ink border border-line rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted mt-0.5">{hint}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
  const tones = {
    neutral: 'bg-line text-slate-200',
    good: 'bg-emerald-700/40 text-emerald-300 border border-emerald-600',
    warn: 'bg-amber-700/30 text-amber-300 border border-amber-600',
    bad: 'bg-red-700/40 text-red-300 border border-red-600',
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded ${tones[tone]}`}>{children}</span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between mb-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </header>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="text-center text-muted py-12 border border-dashed border-line rounded-lg">
      {children}
    </div>
  );
}
