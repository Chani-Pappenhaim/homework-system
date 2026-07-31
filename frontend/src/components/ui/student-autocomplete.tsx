import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { studentsApi, type StudentSearchResult } from '@/api/students.api';
import { Input } from '@/components/ui/input';

interface StudentAutocompleteProps {
  onSelect: (student: StudentSearchResult) => void;
  placeholder?: string;
}

/**
 * Free-text search by name OR email against the student directory, with a
 * dropdown of matches — replaces a plain "type an exact email and hope"
 * field, which only told you it was wrong after you clicked submit.
 */
export function StudentAutocomplete({ onSelect, placeholder = 'חפשי לפי שם או אימייל' }: StudentAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['students-search', query],
    queryFn: () => studentsApi.search(query),
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
  });
  const results = data?.data.data.students ?? [];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1">
      <Input
        placeholder={placeholder}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && query.trim().length >= 2 && results.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-input border border-rule bg-sheet shadow-soft">
          {results.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onSelect(s); setQuery(''); setOpen(false); }}
              className="block w-full px-3 py-2 text-right text-sm hover:bg-ground/60"
            >
              <span className="font-medium text-ink">{s.name}</span>
              <span className="text-ink/50"> · {s.email}</span>
              {s.groupNames.length > 0 && (
                <span className="block text-xs text-ink/40">{s.groupNames.join(', ')}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
