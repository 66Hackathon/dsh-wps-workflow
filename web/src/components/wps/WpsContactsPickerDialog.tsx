import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { userAvatarColor, userAvatarLetter } from '../../memberRoles';
import type { WpsContact } from '../../types/wps';
import { wpsContactLabel } from '../../types/wps';
import { WpsDialogShell } from './WpsDialogShell';

interface Props {
  title?: string;
  subtitle?: string;
  multiple?: boolean;
  onClose: () => void;
  onConfirm: (contacts: WpsContact[]) => void | Promise<void>;
}

export function WpsContactsPickerDialog({
  title = '从 WPS 通讯录选择',
  subtitle = '搜索企业通讯录中的成员，选中后可加入项目。',
  multiple = false,
  onClose,
  onConfirm,
}: Props) {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<WpsContact[]>([]);
  const [selected, setSelected] = useState<WpsContact[]>([]);

  useEffect(() => {
    if (!keyword.trim()) {
      setItems([]);
      setError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void api.searchWpsContacts(keyword.trim()).then(
        (res) => {
          if (cancelled) return;
          setItems(res.items ?? []);
        },
        (err: unknown) => {
          if (cancelled) return;
          setItems([]);
          setError(err instanceof Error ? err.message : '搜索失败');
        },
      ).finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [keyword]);

  const selectedIds = useMemo(() => new Set(selected.map((c) => c.id)), [selected]);

  const toggleContact = (contact: WpsContact) => {
    if (multiple) {
      setSelected((prev) => (
        selectedIds.has(contact.id)
          ? prev.filter((item) => item.id !== contact.id)
          : [...prev, contact]
      ));
      return;
    }
    setSelected([contact]);
  };

  const handleConfirm = async () => {
    if (!selected.length) {
      setError('请选择至少一名成员');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selected);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
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
            disabled={submitting || !selected.length}
          >
            {submitting ? '处理中…' : multiple ? `确认选择（${selected.length}）` : '确认选择'}
          </button>
        </>
      )}
    >
      <div className="tsw-wpsPickerSearch">
        <span className="tsw-memberSearchIcon" aria-hidden="true">🔍</span>
        <input
          className="tsw-memberSearchInput"
          placeholder="输入姓名搜索 WPS 通讯录"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          autoFocus
        />
      </div>

      {loading ? <p className="tsw-muted tsw-memberSearchEmpty">正在搜索通讯录…</p> : null}
      {!loading && keyword.trim() && !items.length && !error ? (
        <p className="tsw-muted tsw-memberSearchEmpty">未找到匹配成员</p>
      ) : null}

      <div className="tsw-wpsPickerList">
        {items.map((contact) => {
          const label = wpsContactLabel(contact);
          const active = selectedIds.has(contact.id);
          return (
            <button
              key={contact.id}
              type="button"
              className={`tsw-memberSearchOption tsw-memberSearchOptionBtn${active ? ' tsw-memberSearchOptionActive' : ''}`}
              onClick={() => toggleContact(contact)}
            >
              <span
                className="tsw-memberAvatar"
                style={{ background: userAvatarColor(label) }}
              >
                {userAvatarLetter(label)}
              </span>
              <span className="tsw-memberSearchOptionText">
                <strong>{label}</strong>
                <span className="tsw-muted">
                  {[contact.department, contact.email].filter(Boolean).join(' · ') || contact.id}
                </span>
              </span>
              {multiple ? (
                <span className="tsw-wpsPickerCheck" aria-hidden="true">{active ? '✓' : ''}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selected.length ? (
        <div className="tsw-wpsPickerSelected">
          已选：{selected.map((item) => wpsContactLabel(item)).join('、')}
        </div>
      ) : (
        <p className="tsw-muted tsw-memberDialogHint">请输入关键字搜索并选择成员</p>
      )}

      {error ? <p className="tsw-error">{error}</p> : null}
    </WpsDialogShell>
  );
}
