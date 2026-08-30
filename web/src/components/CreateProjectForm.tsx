import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Project } from '../types';

interface Props {
  onCreated: (project: Project) => void;
  onCancel: () => void;
  onNext: () => void;
}

function suggestProjectCode(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const ascii = trimmed
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '')
    .slice(0, 12)
    .toUpperCase();
  if (ascii) return `PRJ-${ascii}`;
  return `PRJ-${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

export function CreateProjectForm({ onCreated, onCancel, onNext }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedDesc = description.trim();
    if (!trimmedName) {
      setError('请填写项目名称');
      return;
    }
    if (trimmedDesc.length > 0 && trimmedDesc.length < 10) {
      setError('项目介绍至少 10 个字符，或留空使用默认描述');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const project = await api.createProject({
        project_code: suggestProjectCode(trimmedName),
        name: trimmedName,
        description: trimmedDesc || `${trimmedName} 协作项目空间`,
      });
      onCreated(project);
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tsw-createLayout">
      <form className="tsw-createForm" onSubmit={(e) => void handleSubmit(e)}>
        <div className="tsw-formRow">
          <label className="tsw-fieldLabel" htmlFor="project-name">
            项目名称 <span className="tsw-required">*</span>
          </label>
          <input
            id="project-name"
            className="tsw-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：用户中心重构"
            maxLength={255}
            disabled={submitting}
          />
        </div>
        <div className="tsw-formRow">
          <label className="tsw-fieldLabel" htmlFor="project-desc">
            项目介绍
          </label>
          <textarea
            id="project-desc"
            className="tsw-textarea"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简要说明项目目标与范围"
            disabled={submitting}
          />
        </div>
        <div className="tsw-formRow">
          <span className="tsw-fieldLabel">项目介绍文档</span>
          <div className="tsw-docUploadGrid">
            <button type="button" className="tsw-docUploadTile" disabled>
              <span className="tsw-docUploadIcon" aria-hidden="true">☁</span>
              <span>上传本地文档</span>
            </button>
            <button type="button" className="tsw-docUploadTile" disabled>
              <span className="tsw-docUploadIcon tsw-docUploadIconWps" aria-hidden="true">📄</span>
              <span>关联 WPS 在线文档</span>
            </button>
          </div>
          <p className="tsw-fieldHint">文档关联能力 Demo 暂未开放，创建后可继续完善。</p>
        </div>
        {error ? <p className="tsw-error">{error}</p> : null}
        <div className="tsw-createFooter">
          <button type="button" className="tsw-btn" onClick={onCancel} disabled={submitting}>
            取消
          </button>
          <button type="submit" className="tsw-btn tsw-btnPrimary tsw-btnSolid" disabled={submitting}>
            {submitting ? '创建中…' : '下一步'}
          </button>
        </div>
      </form>

      <aside className="tsw-createAside">
        <div className="tsw-createAsideCard">
          <div className="tsw-createAsideHead">
            <span className="tsw-createAsideCheck" aria-hidden="true">✓</span>
            <strong>创建后可以继续完善</strong>
          </div>
          <ul className="tsw-createAsideList">
            <li>成员与角色</li>
            <li>前后端仓库</li>
            <li>WPS 项目群</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
