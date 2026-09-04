import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { WpsDocument } from '../../types/wps';
import { WpsDialogShell } from './WpsDialogShell';

interface Props {
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onConfirm: (document: WpsDocument) => void | Promise<void>;
}

export function WpsDocumentPickerDialog({
  title = '选择 WPS 在线文档',
  subtitle = '从当前账号可访问的云文档中选择要关联的文档。',
  onClose,
  onConfirm,
}: Props) {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<WpsDocument[]>([]);
  const [selected, setSelected] = useState<WpsDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api.searchWpsDocuments(keyword.trim()).then(
      (res) => {
        if (cancelled) return;
        setItems(res.items ?? []);
      },
      (err: unknown) => {
        if (cancelled) return;
        setItems([]);
        setError(err instanceof Error ? err.message : '加载文档失败');
      },
    ).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [keyword]);

  const handleConfirm = async () => {
    if (!selected) {
      setError('请选择一份文档');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selected);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '关联失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WpsDialogShell
      title={title}
      subtitle={subtitle}
      wide
      onClose={onClose}
      actions={(
        <>
          <button type="button" className="tsw-btn" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="tsw-btn tsw-btnPrimary tsw-btnSolid"
            onClick={() => void handleConfirm()}
            disabled={submitting || !selected}
          >
            {submitting ? '关联中…' : '确认关联'}
          </button>
        </>
      )}
    >
      <div className="tsw-wpsPickerSearch">
        <span className="tsw-memberSearchIcon" aria-hidden="true">🔍</span>
        <input
          className="tsw-memberSearchInput"
          placeholder="搜索文档名称"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {loading ? <p className="tsw-muted tsw-memberSearchEmpty">正在加载云文档…</p> : null}
      {!loading && !items.length && !error ? (
        <p className="tsw-muted tsw-memberSearchEmpty">暂无可选云文档</p>
      ) : null}

      <div className="tsw-wpsPickerList">
        {items.map((doc) => {
          const active = selected?.id === doc.id;
          return (
            <button
              key={doc.id}
              type="button"
              className={`tsw-wpsDocRow${active ? ' tsw-wpsDocRowActive' : ''}`}
              onClick={() => setSelected(doc)}
            >
              <span className="tsw-docUploadIcon tsw-docUploadIconWps" aria-hidden="true">📄</span>
              <span className="tsw-wpsDocRowText">
                <strong>{doc.name}</strong>
                <span className="tsw-muted">
                  {doc.type || '智能文档'}
                  {doc.modified_time ? ` · ${doc.modified_time}` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="tsw-wpsPickerSelected">
          已选：{selected.name}
          {selected.link_url ? (
            <>
              {' '}
              <a href={selected.link_url} target="_blank" rel="noreferrer">预览</a>
            </>
          ) : null}
        </div>
      ) : (
        <p className="tsw-muted tsw-memberDialogHint">请选择要关联的 WPS 在线文档</p>
      )}

      {error ? <p className="tsw-error">{error}</p> : null}
    </WpsDialogShell>
  );
}
