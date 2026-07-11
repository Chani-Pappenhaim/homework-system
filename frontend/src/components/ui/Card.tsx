import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  accent?: 'primary' | 'violet';
  onClick?: () => void;
}

export default function Card({ children, className, accent, onClick }: CardProps) {
  return (
    <div onClick={onClick}
      className={cn(
        'bg-white border border-[#EEEBF5] rounded-card',
        accent === 'primary' && 'border-t-[3px] border-t-[#C2185B]',
        accent === 'violet' && 'border-t-[3px] border-t-[#7C3AED]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4 border-b border-[#EEEBF5]', className)}>{children}</div>;
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}
