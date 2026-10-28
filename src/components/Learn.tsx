import { MessageCircle } from 'lucide-react';
import { GLOSSARY } from '../data/glossary';
import { Card, askCoach } from './ui';

const QUESTIONS = [
  'Who would realistically buy JTown Hot Yoga, and what do they look for?',
  'Is now a good time to sell a fitness studio business?',
  'Should I sell all three studios together or separately?',
  'Do I need a business broker or an M&A advisor? How do they get paid?',
  'What happens to my instructors and members when I sell?',
  'How are taxes on a business sale usually handled? What should I ask my CPA?',
  'What is an earn-out or seller note, and should I accept one?',
  'How long will I have to stay after the sale?',
];

export function Learn() {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-1" title="Good questions to ask your coach">
        <ul className="space-y-2">
          {QUESTIONS.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => askCoach(q)}
                className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-surface-2"
              >
                <MessageCircle size={16} className="mt-0.5 shrink-0 text-brand" />
                {q}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
        {Object.entries(GLOSSARY).map(([key, g]) => (
          <Card key={key}>
            <h3 className="font-semibold text-ink">{g.term}</h3>
            <p className="mt-1 text-sm text-ink">{g.short}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{g.long}</p>
            <button
              type="button"
              onClick={() => askCoach(`Explain "${g.term}" using my own numbers. What does it mean for my sale price?`)}
              className="mt-3 text-xs font-semibold text-brand"
            >
              How does this apply to me? →
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
