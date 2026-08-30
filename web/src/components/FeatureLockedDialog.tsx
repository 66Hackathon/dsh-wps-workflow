interface Props {
  label?: string;
  onClose: () => void;
}

export function FeatureLockedDialog({ label, onClose }: Props) {
  return (
    <div
      className="tsw-dialogBackdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="tsw-dialog" role="dialog" aria-modal="true" aria-label="功能暂未开放">
        <h3>功能暂未开放</h3>
        <p>该能力已进入后续开发规划，当前版本暂不支持使用。</p>
        {label ? <p>{label}</p> : null}
        <button type="button" className="tsw-btn tsw-btnPrimary" onClick={onClose}>
          知道了
        </button>
      </div>
    </div>
  );
}
