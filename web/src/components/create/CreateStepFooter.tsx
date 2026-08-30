interface Props {
  onPrev?: () => void;
  skipLabel?: string;
  onSkip?: () => void;
  nextLabel?: string;
  onNext: () => void;
  nextLoading?: boolean;
  nextDisabled?: boolean;
  showSkip?: boolean;
}

export function CreateStepFooter({
  onPrev,
  skipLabel = '稍后添加',
  onSkip,
  nextLabel = '下一步',
  onNext,
  nextLoading = false,
  nextDisabled = false,
  showSkip = true,
}: Props) {
  return (
    <div className="tsw-createWizardFooter">
      <div className="tsw-createWizardFooterLeft">
        {onPrev ? (
          <button type="button" className="tsw-btn" onClick={onPrev} disabled={nextLoading}>
            上一步
          </button>
        ) : null}
      </div>
      <div className="tsw-createWizardFooterRight">
        {showSkip && onSkip ? (
          <button type="button" className="tsw-btn tsw-btnLink" onClick={onSkip} disabled={nextLoading}>
            {skipLabel}
          </button>
        ) : null}
        <button
          type="button"
          className="tsw-btn tsw-btnPrimary tsw-btnSolid"
          onClick={onNext}
          disabled={nextLoading || nextDisabled}
        >
          {nextLoading ? '处理中…' : nextLabel}
        </button>
      </div>
    </div>
  );
}
