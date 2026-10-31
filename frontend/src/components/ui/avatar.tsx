import { useEffect, useState } from 'react';
import { avatarColor, initialsOf } from '@/lib/avatar';
import { apiFileUrl } from '@/lib/config';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-12 text-base',
  xl: 'size-24 text-3xl',
};

interface AvatarProps {
  /** The person's name: gives the initials and the color shown while she has no picture. */
  name: string;
  /** The picture link from the API (UserDTO.avatarUrl); empty for none. */
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

/** A person's profile picture, or her initials on a color of her own when there is none. */
function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  // A new picture deserves a new attempt after an earlier one failed to load.
  useEffect(() => setFailed(false), [src]);

  const base = cn('inline-grid shrink-0 place-items-center overflow-hidden rounded-full', SIZES[size], className);

  if (src && !failed) {
    return <img src={apiFileUrl(src)} alt={name} className={cn(base, 'object-cover')} onError={() => setFailed(true)} />;
  }
  return (
    <span role="img" aria-label={name} className={cn(base, avatarColor(name), 'font-semibold text-sheet')}>
      {initialsOf(name)}
    </span>
  );
}

export { Avatar };
