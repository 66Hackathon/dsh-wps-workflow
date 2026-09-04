import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { DevDirection, Project, ProjectRepository } from '../../types';
import { DEV_DIRECTION_OPTIONS } from '../../types';
import { CreateStepFooter } from './CreateStepFooter';

interface Props {
  project: Project;
  onPrev: () => void;
  onNext: (repoLabel: string) => void;
}

interface RepoDraft {
  key: string;
  repo_url: string;
  default_branch: string;
  dev_direction: DevDirection;
}

function emptyDraft(): RepoDraft {
  return {
    key: `${Date.now()}-${Math.random()}`,
    repo_url: '',
    default_branch: 'main',
    dev_direction: 'FRONTEND',
  };
}

function toDraft(repo: ProjectRepository): RepoDraft {
  return {
    key: `repo-${repo.id}`,
    repo_url: repo.repo_url,
    default_branch: repo.default_branch || 'main',
    dev_direction: repo.dev_direction,
  };
}

function summarizeRepos(repos: ProjectRepository[]): string {
  if (repos.length === 0) {
    return '未关联';
  }
  return repos
    .map((repo) => `${repo.dev_direction_label ?? repo.dev_direction} · ${repo.repo_url}`)
    .join('；');
}

export function CreateProjectRepositoryStep({ project, onPrev, onNext }: Props) {
  const [drafts, setDrafts] = useState<RepoDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (project.repositories && project.repositories.length > 0) {
      setDrafts(project.repositories.map(toDraft));
    }
  }, [project.repositories]);

  const updateDraft = (key: string, patch: Partial<RepoDraft>) => {
    setDrafts((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const addDraft = () => {
    setDrafts((prev) => [...prev, emptyDraft()]);
  };

  const removeDraft = (key: string) => {
    setDrafts((prev) => prev.filter((item) => item.key !== key));
  };

  const saveAndContinue = async (skip = false) => {
    if (skip) {
      onNext('未关联');
      return;
    }

    const filled = drafts.filter((item) => item.repo_url.trim());
    if (filled.length === 0) {
      onNext('未关联');
      return;
    }

    for (const item of filled) {
      if (!item.dev_direction) {
        setError('每个仓库都必须选择研发方向');
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await api.replaceProjectRepositories(
        project.id,
        filled.map((item, index) => ({
          repo_url: item.repo_url.trim(),
          default_branch: item.default_branch.trim() || 'main',
          dev_direction: item.dev_direction,
          sort_order: index + 1,
        })),
      );
      onNext(summarizeRepos(result.items));
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tsw-createWizardLayout">
      <div className="tsw-createWizardMain">
        <div className="tsw-createForm tsw-createWizardCard">
          <div className="tsw-createWizardHeadingRow">
            <h3 className="tsw-createWizardHeading">关联代码仓库</h3>
            <span className="tsw-badge tsw-badgeMuted">可选</span>
          </div>
          <p className="tsw-muted tsw-createWizardSub">
            一个项目可关联多个仓库，每个仓库需指定研发方向（前端 / 后端 / 移动端）。
          </p>

          {drafts.length === 0 ? (
            <p className="tsw-muted">尚未添加仓库，点击下方按钮新增。</p>
          ) : (
            <div className="tsw-repoDraftList">
              {drafts.map((draft, index) => (
                <div key={draft.key} className="tsw-repoDraftCard">
                  <div className="tsw-repoDraftHead">
                    <strong>仓库 {index + 1}</strong>
                    <button type="button" className="tsw-btn tsw-btnGhost" onClick={() => removeDraft(draft.key)}>
                      移除
                    </button>
                  </div>

                  <div className="tsw-formRow">
                    <label className="tsw-fieldLabel">研发方向</label>
                    <select
                      className="tsw-input"
                      value={draft.dev_direction}
                      onChange={(e) => updateDraft(draft.key, { dev_direction: e.target.value as DevDirection })}
                    >
                      {DEV_DIRECTION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="tsw-formRow">
                    <label className="tsw-fieldLabel">仓库地址</label>
                    <input
                      className="tsw-input"
                      placeholder="仓库地址"
                      value={draft.repo_url}
                      onChange={(e) => updateDraft(draft.key, { repo_url: e.target.value })}
                    />
                  </div>

                  <div className="tsw-formRow">
                    <label className="tsw-fieldLabel">默认分支</label>
                    <input
                      className="tsw-input"
                      placeholder="main"
                      value={draft.default_branch}
                      onChange={(e) => updateDraft(draft.key, { default_branch: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <button type="button" className="tsw-btn tsw-btnOutline" onClick={addDraft}>
            + 添加仓库
          </button>

          {error ? <p className="tsw-error">{error}</p> : null}

          <CreateStepFooter
            onPrev={onPrev}
            skipLabel="跳过此步"
            onSkip={() => void saveAndContinue(true)}
            onNext={() => void saveAndContinue(false)}
            nextLoading={submitting}
          />
        </div>
      </div>
    </div>
  );
}
