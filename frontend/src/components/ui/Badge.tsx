import { cn } from '@/lib/utils';

interface BadgeProps {
  variant?: 'pink' | 'violet' | 'green' | 'amber' | 'gray';
  children: React.ReactNode;
  className?: string;
}

export default function Badge({ variant = 'gray', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-badge text-xs font-medium',
        {
          'bg-[rgba(233,30,140,0.15)] text-[#E91E8C] border border-[rgba(233,30,140,0.3)]': variant === 'pink',
          'bg-[rgba(124,58,237,0.15)] text-[#A78BFA] border border-[rgba(124,58,237,0.3)]': variant === 'violet',
          'bg-[rgba(16,185,129,0.15)] text-[#10B981] border border-[rgba(16,185,129,0.3)]': variant === 'green',
          'bg-[rgba(245,158,11,0.15)] text-[#F59E0B] border border-[rgba(245,158,11,0.3)]': variant === 'amber',
          'bg-[#EEEBF5] text-[#6B7280]': variant === 'gray',
        },
        className
      )}
    >
      {children}
    </span>
  );
}
