import type { CurrentInteractionPresentation } from '../presenters/current-interaction';

export function CurrentInteraction({
  presentation,
}: {
  presentation: CurrentInteractionPresentation;
}) {
  const { eyebrow, title, description, label, value, details } = presentation;

  return (
    <section className="current" aria-label="Current Interaction">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="display">{title}</h2>
      <p className="lead">{description}</p>
      <div className="subject">
        <p className="eyebrow">{label}</p>
        <h3>{value}</h3>
      </div>
      <dl className="details">
        {details.map(([key, val]) => (
          <div key={key}>
            <dt className="eyebrow">{key}</dt>
            <dd>{val}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
