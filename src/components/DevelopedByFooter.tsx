interface DevelopedByFooterProps {
  className?: string;
  theme?: 'light' | 'dark';
}

export default function DevelopedByFooter({ className = '', theme = 'light' }: DevelopedByFooterProps) {
  const textClass = theme === 'dark' ? 'text-slate-400' : 'text-gray-500';
  const linkClass = theme === 'dark'
    ? 'text-slate-200 hover:text-white'
    : 'text-slate-700 hover:text-blue-600';

  return (
    <p className={`text-center text-xs ${textClass} ${className}`}>
      Разработано{' '}
      <a
        href="https://absystems.kz/"
        target="_blank"
        rel="noreferrer"
        className={`font-medium underline-offset-4 hover:underline ${linkClass}`}
      >
        A&amp;B Systems
      </a>
    </p>
  );
}
