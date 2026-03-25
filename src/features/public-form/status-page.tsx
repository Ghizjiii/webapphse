export function StatusPage({
  icon,
  title,
  desc,
}: {
  icon: 'clock' | 'lock' | 'error';
  title: string;
  desc: string;
}) {
  const icons = {
    clock: '⏰',
    lock: '🔒',
    error: '❌',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">
        <div className="text-5xl mb-4">{icons[icon]}</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-gray-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
