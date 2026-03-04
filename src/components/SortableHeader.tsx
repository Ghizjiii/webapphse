import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import type { SortConfig } from '../types';

interface Props {
  label: string;
  sortKey: string;
  sortConfig: SortConfig | null;
  onSort: (key: string) => void;
  className?: string;
}

export default function SortableHeader({ label, sortKey, sortConfig, onSort, className = '' }: Props) {
  const isActive = sortConfig?.key === sortKey;

  return (
    <th
      className={`text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none hover:text-gray-900 hover:bg-gray-100/60 transition-colors ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1.5">
        {label}
        <span className={`transition-colors ${isActive ? 'text-blue-600' : 'text-gray-300'}`}>
          {isActive ? (
            sortConfig?.direction === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />
          ) : (
            <ChevronsUpDown size={13} />
          )}
        </span>
      </div>
    </th>
  );
}
