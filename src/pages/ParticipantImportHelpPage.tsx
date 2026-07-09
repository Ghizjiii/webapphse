import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Info, Shield } from 'lucide-react';
import { PARTICIPANT_IMPORT_TEMPLATE_URL } from '../lib/participantImportAssets';

const courseExamples = ['БиОТ', 'ПТМ', 'ПБ', 'Электробезопасность', 'Промышленная безопасность', 'Охрана труда'];

const columns = [
  { name: 'ФИО', required: 'Да', note: 'Можно указывать фамилию, имя и отчество в одной ячейке.' },
  { name: 'Email участника', required: 'Нет', note: 'Почта сотрудника для регистрации и передачи в Bitrix24.' },
  { name: 'Должность', required: 'Да', note: 'Должность сотрудника в компании.' },
  { name: 'Категория', required: 'Да', note: 'Например: ИТР или Обычный.' },
  { name: 'Курсы', required: 'Нет при импорте', note: 'Можно оставить пустым и выбрать курсы после импорта в удобном интерфейсе.' },
];

export default function ParticipantImportHelpPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-900/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
              <Shield size={18} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">HSE Platform</div>
              <div className="text-xs text-slate-400">Импорт сотрудников</div>
            </div>
          </div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 transition-all hover:border-blue-400/70 hover:text-white"
          >
            <ArrowLeft size={16} />
            В админку
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200">
              <FileSpreadsheet size={14} />
              Excel, CSV или TSV
            </div>
            <h1 className="max-w-3xl text-3xl font-bold leading-tight text-white">
              Инструкция по импорту списка сотрудников
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Заполните шаблон и загрузите его в блоке «Список сотрудников». Система добавит строки в анкету, а в админке сразу создаст сотрудников и связи с курсами.
            </p>
            <div className="mt-5 flex max-w-3xl items-start gap-3 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-red-800">
              <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
              <p className="text-sm leading-6">
                Курсы в Excel можно не заполнять. После импорта списка сотрудников вы сможете выбрать нужные курсы вручную в интерфейсе. Если заполняете курсы в Excel, разделяйте несколько названий точкой с запятой: БиОТ; ПТМ.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={PARTICIPANT_IMPORT_TEMPLATE_URL}
                download
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-700"
              >
                <Download size={17} />
                Скачать Excel-шаблон
              </a>
              <a
                href={PARTICIPANT_IMPORT_TEMPLATE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 transition-all hover:border-blue-400/70 hover:text-white"
              >
                Открыть шаблон
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-200">
                <Info size={17} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Главное правило</h2>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  Не меняйте названия колонок в первой строке. Если заголовков нет, система попробует прочитать файл в порядке: ФИО, Email, Должность, Категория, Курсы.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white text-slate-900">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold">Колонки шаблона</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Колонка</th>
                  <th className="px-5 py-3">Обязательная</th>
                  <th className="px-5 py-3">Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {columns.map(column => (
                  <tr key={column.name} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-3 font-medium">{column.name}</td>
                    <td className="px-5 py-3">{column.required}</td>
                    <td className="px-5 py-3 text-slate-600">{column.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            'Курсы можно писать через точку с запятой: БиОТ; ПТМ.',
            'Email участника можно оставить пустым, это необязательное поле.',
            'Фотографии из Excel не импортируются, их нужно загрузить отдельно.',
          ].map(item => (
            <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-emerald-300" />
              <p className="text-sm leading-6 text-slate-300">{item}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-base font-semibold text-white">Примеры названий курсов</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            В шаблоне есть отдельный лист «Справочник курсов». Его можно использовать как подсказку: скопировать название курса и вставить в колонку «Курсы» на первом листе.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {courseExamples.map(course => (
              <span key={course} className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-sm text-slate-100">
                {course}
              </span>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
