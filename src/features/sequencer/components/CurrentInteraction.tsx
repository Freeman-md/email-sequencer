import type { CurrentInteractionPresentation } from '../presenters/current-interaction';

export function CurrentInteraction({
  presentation,
}: {
  presentation: CurrentInteractionPresentation;
}) {
  const { eyebrow, title, description, label, value, details } = presentation;

  return (
    <section className="current-interaction" aria-label="Current interaction">
      <p className="section-label">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="current-description">{description}</p>
      <div className="interaction-subject">
        <p className="section-label">{label}</p>
        <h3>{value}</h3>
      </div>
      <dl className="interaction-details">
        {details.map(([key, val]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{val}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
