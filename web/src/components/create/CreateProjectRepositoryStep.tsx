import { useState } from 'react';
import { api } from '../../api/client';
import type { Project } from '../../types';
import { CreateStepFooter } from './CreateStepFooter';

interface Props {
  project: Project;
  onPrev: () => void;
  onNext: (repoLabel: string) => void;
}

export function CreateProjectRepositoryStep({ project, onPrev, onNext }: Props) {
  const [repoUrl, setRepoUrl] = useState(project.git_repo_url ?? '');
  const [branch, setBranch] = useState(project.git_default_branch ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveAndContinue = async (skip = false) => {
    if (skip) {
      onNext('未关联');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.updateProjectSetup(project.id, {
        git_repo_url: repoUrl.trim() || undefined,
        git_default_branch: branch.trim() || undefined,
      });
      const label = updated.git_repo_url?.trim()
        ? updated.git_repo_url
        : '未关联';
      onNext(label);
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
            <span className="tsw-badge tsw-badgeMuted">暂未开放</span>
          </div>
          <p className="tsw-muted tsw-createWizardSub">
            项目创建后仍可在「代码仓库」中完成关联
          </p>

          <div className="tsw-gitConnectCard">
            <div className="tsw-gitConnectBrand">
              <span className="tsw-gitLabIcon" aria-hidden="true">🦊</span>
              <div>
                <strong>GitLab 未连接</strong>
                <p className="tsw-muted">授权后选择项目仓库和默认分支</p>
              </div>
            </div>
            <button type="button" className="tsw-btn" disabled>
              连接 GitLab
            </button>
          </div>

          <div className="tsw-formRow">
            <label className="tsw-fieldLabel" htmlFor="repo-url">选择仓库</label>
            <input
              id="repo-url"
              className="tsw-input"
              placeholder="填写仓库地址（Demo 可直接填写，默认保存成功）"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
          </div>
          <div className="tsw-formRow">
            <label className="tsw-fieldLabel" htmlFor="repo-branch">默认分支</label>
            <input
              id="repo-branch"
              className="tsw-input"
              placeholder="例如：main"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </div>

          <div className="tsw-infoBanner">
            <span aria-hidden="true">ℹ️</span>
            <span>
              当前版本暂不支持真实仓库关联，填写地址将直接保存；跳过不会影响项目创建和主流程使用。
            </span>
          </div>

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

      <aside className="tsw-createAside">
        <div className="tsw-createAsideCard">
          <div className="tsw-createAsideHead">
            <strong>关联后可以使用</strong>
            <span className="tsw-badge tsw-badgeMuted">后续开放</span>
          </div>
          <ul className="tsw-createAsideList">
            <li>查看仓库与分支</li>
            <li>关联研发任务与 Commit</li>
            <li>为 AI 分析提供代码上下文</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
