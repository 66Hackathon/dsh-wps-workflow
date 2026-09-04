import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { userDisplayName } from '../memberRoles';
import {
  isRequirementProductOwner,
  PRODUCT_OWNER_ONLY_HINT,
} from '../requirementPermissions';
import {
  PRIORITY_LABELS,
  REQUIREMENT_PRIORITY_OPTIONS,
  type RequirementPriority,
} from '../requirementCreate';
import { requirementStatusLabel } from '../requirementDisplay';
import type { ProjectMember, Requirement } from '../types';
import { WpsDialogShell } from './wps/WpsDialogShell';

interface Props {
  requirement: Requirement;
  members: ProjectMember[];
  currentUserId?: number;
  onClose: () => void;
  onUpdated: (requirement: Requirement) => void;
}

export function RequirementViewDialog({
  requirement,
  members,
  currentUserId,
  onClose,
  onUpdated,
}: Props) {
  const canEdit = isRequirementProductOwner(requirement, currentUserId)
    && requirement.current_status !== 'CLOSED';

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(requirement.title);
  const [description, setDescription] = useState(requirement.description ?? '');
  const [priority, setPriority] = useState<RequirementPriority>(
    (requirement.priority as RequirementPriority) || 'MEDIUM',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(requirement.title);
    setDescription(requirement.description ?? '');
    setPriority((requirement.priority as RequirementPriority) || 'MEDIUM');
    setEditing(false);
    setError(null);
  }, [requirement.id, requirement.title, requirement.description, requirement.priority]);

  const productOwner = members.find(
    (m) => m.user_id === (requirement.created_by || requirement.product_owner_user_id),
  );
  const ownerName = productOwner ? userDisplayName(productOwner.user_name) : '未指定';

  const validationError = (() => {
    if (!title.trim()) return '请填写需求标题';
    if (!description.trim()) return '请填写需求描述';
    if (!priority) return '请选择优先级';
    return null;
  })();

  const handleSave = async () => {
    if (!canEdit || validationError) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateRequirement(requirement.id, {
        title: title.trim(),
        description: description.trim(),
        priority,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setTitle(requirement.title);
    setDescription(requirement.description ?? '');
    setPriority((requirement.priority as RequirementPriority) || 'MEDIUM');
    setEditing(false);
    setError(null);
  };

  return (
    <WpsDialogShell
      title="查看需求"
      subtitle={`${requirement.requirement_code} · ${requirementStatusLabel(requirement.current_status)}`}
      wide
      onClose={onClose}
      actions={(
        <>
          {editing ? (
            <>
              <button type="button" className="tsw-btn" disabled={saving} onClick={handleCancelEdit}>
                取消
              </button>
              <button
                type="button"
                className="tsw-btn tsw-btnPrimary tsw-btnSolid"
                disabled={saving || Boolean(validationError)}
                onClick={() => void handleSave()}
              >
                {saving ? '保存中…' : '保存'}
              </button>
            </>
          ) : (
            <>
              {canEdit ? (
                <button
                  type="button"
                  className="tsw-btn tsw-btnPrimary tsw-btnSolid"
                  onClick={() => setEditing(true)}
                >
                  编辑内容
                </button>
              ) : (
                <span className="tsw-muted tsw-reqViewReadonlyHint">
                  {PRODUCT_OWNER_ONLY_HINT}
                </span>
              )}
              <button type="button" className="tsw-btn" onClick={onClose}>
                关闭
              </button>
            </>
          )}
        </>
      )}
    >
      <div className="tsw-reqViewMeta">
        <span>产品负责人 {ownerName}</span>
        {!editing ? (
          <span>优先级 {PRIORITY_LABELS[requirement.priority] ?? requirement.priority}</span>
        ) : null}
      </div>

      {editing ? (
        <div className="tsw-reqViewForm">
          <div className="tsw-formRow">
            <label className="tsw-fieldLabel" htmlFor="req-view-title">
              需求标题 <span className="tsw-required">*</span>
            </label>
            <input
              id="req-view-title"
              className="tsw-input"
              value={title}
              maxLength={255}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="tsw-formRow">
            <label className="tsw-fieldLabel" htmlFor="req-view-desc">
              需求描述 <span className="tsw-required">*</span>
            </label>
            <textarea
              id="req-view-desc"
              className="tsw-textarea"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="tsw-formRow">
            <span className="tsw-fieldLabel">
              优先级 <span className="tsw-required">*</span>
            </span>
            <div className="tsw-priorityPicker" role="group" aria-label="优先级">
              {REQUIREMENT_PRIORITY_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className="tsw-priorityBtn"
                  data-selected={priority === value ? 'true' : 'false'}
                  onClick={() => setPriority(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {validationError ? <p className="tsw-error">{validationError}</p> : null}
          {error ? <p className="tsw-error">{error}</p> : null}
        </div>
      ) : (
        <div className="tsw-reqViewReadonly">
          <div className="tsw-reqViewField">
            <dt>需求标题</dt>
            <dd>{requirement.title}</dd>
          </div>
          <div className="tsw-reqViewField">
            <dt>需求描述</dt>
            <dd className="tsw-reqViewDesc">{requirement.description?.trim() || '暂无描述'}</dd>
          </div>
        </div>
      )}
    </WpsDialogShell>
  );
}
