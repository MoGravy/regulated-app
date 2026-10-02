import { useApp } from '../hooks/useApp'
import { resetCopy as copy } from '../config/resetCopy'

export default function PracticeSummary() {
  const { practiceSummary: summary, practiceStorageOK } = useApp()
  return (
    <section className="card practice-summary" aria-label={copy.days}>
      <dl className="practice-stats">
        {[[copy.days, summary.days], [copy.run, summary.currentRun], [copy.best, summary.best]].map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <details className="practice-milestones">
        <summary>{copy.milestones}</summary>
        <ul>{[7, 20, 50, 100].map(day => (
          <li key={day} data-earned={summary.awards.includes(day)}>
            <span>{day} {copy.daysUnit}</span>
            <strong>{summary.awards.includes(day) ? copy.earned : copy.notYet}</strong>
          </li>
        ))}</ul>
        <p>{copy.grace}</p>
      </details>
      <p className="t-caption">{copy.local}</p>
      {summary.legacyMinimum && <p className="t-caption">{copy.legacy}</p>}
      {!practiceStorageOK && <p role="status">{copy.storage}</p>}
    </section>
  )
}
