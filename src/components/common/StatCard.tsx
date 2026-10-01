import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ElementType;
  accentColor?: 'cyan' | 'emerald' | 'amber' | 'neutral';
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  icon: Icon,
  accentColor = 'neutral',
}) => {
  const accentClasses = {
    cyan: 'border-l-cyan-500 text-cyan-400',
    emerald: 'border-l-emerald-500 text-emerald-400',
    amber: 'border-l-amber-500 text-amber-400',
    neutral: 'border-l-neutral-600 text-neutral-400',
  }[accentColor];

  return (
    <div className={`p-4 bg-neutral-900 border border-neutral-800 rounded border-l-2 ${accentClasses}`}>
      <div className="flex items-center justify-between text-xs text-neutral-400 font-mono mb-1">
        <span>{label}</span>
        {Icon && <Icon className="w-4 h-4 text-neutral-500" />}
      </div>
      <div className="text-2xl font-semibold tracking-tight text-neutral-100 font-mono tabular-nums">
        {value}
      </div>
      {subtext && (
        <div className="mt-1 text-xs text-neutral-500">
          {subtext}
        </div>
      )}
    </div>
  );
};
