import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
}

export function WpsDialogShell({
  title,
  subtitle,
  onClose,
  children,
  actions,
  wide = false,
}: Props) {
  return (
    <div
      className="tsw-dialogBackdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`tsw-memberDialog${wide ? ' tsw-wpsDialogWide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          type="button"
          className="tsw-profileDialogClose"
          aria-label="关闭"
          onClick={onClose}
        >
          ×
        </button>
        <h3 className="tsw-memberDialogTitle">{title}</h3>
        {subtitle ? <p className="tsw-muted tsw-memberDialogSub">{subtitle}</p> : null}
        <div className="tsw-memberDialogBody">{children}</div>
        {actions ? <div className="tsw-memberDialogActions">{actions}</div> : null}
      </div>
    </div>
  );
}
