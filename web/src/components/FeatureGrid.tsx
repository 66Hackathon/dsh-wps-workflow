import { LOCKED_FEATURE_LABELS } from '../feature-flags';

export function FeatureGrid({ onClickFeature }: { onClickFeature: (label: string) => void }) {
  return (
    <div className="tsw-featureGrid">
      {LOCKED_FEATURE_LABELS.map((label) => (
        <button
          key={label}
          type="button"
          className="tsw-featureBtn"
          onClick={() => onClickFeature(label)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
