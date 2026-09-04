import { type FormEvent } from 'react';
import {
  REQUIREMENT_PRIORITY_OPTIONS,
  REQUIREMENT_TYPE_OPTIONS,
  type RequirementDraft,
} from '../../requirementCreate';

interface Props {
  draft: RequirementDraft;
  onChange: (next: RequirementDraft) => void;
  onCancel: () => void;
  onNext: () => void;
}

export function CreateRequirementInfoStep({ draft, onChange, onCancel, onNext }: Props) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onNext();
  };

  const setField = <K extends keyof RequirementDraft>(key: K, value: RequirementDraft[K]) => {
    onChange({ ...draft, [key]: value });
  };

  const validationError = (() => {
    if (!draft.title.trim()) return '请填写需求标题';
    if (!draft.description.trim()) return '请填写需求描述';
    if (!draft.priority) return '请选择优先级';
    return null;
  })();

  return (
    <div className="tsw-createWizardLayout tsw-createWizardLayoutWide">
      <div className="tsw-createWizardMain">
      <form className="tsw-createForm tsw-createWizardCard tsw-createFormFill" onSubmit={handleSubmit}>
        <h3 className="tsw-createWizardHeading">填写需求信息</h3>

        <div className="tsw-formRow">
          <label className="tsw-fieldLabel" htmlFor="req-title">
            需求标题 <span className="tsw-required">*</span>
          </label>
          <input
            id="req-title"
            className="tsw-input"
            value={draft.title}
            onChange={(e) => setField('title', e.target.value)}
            placeholder="例如：统一登录与多设备会话管理"
            maxLength={255}
          />
        </div>

        <div className="tsw-formRow">
          <label className="tsw-fieldLabel" htmlFor="req-desc">
            需求描述 <span className="tsw-required">*</span>
          </label>
          <textarea
            id="req-desc"
            className="tsw-textarea"
            rows={4}
            value={draft.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="说明需求背景、目标与主要能力范围"
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
                data-selected={draft.priority === value ? 'true' : 'false'}
                onClick={() => setField('priority', value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="tsw-formRow tsw-formRowInline">
          <div className="tsw-formCol">
            <label className="tsw-fieldLabel" htmlFor="req-type">
              需求类型
            </label>
            <select
              id="req-type"
              className="tsw-select"
              value={draft.requirementType}
              onChange={(e) => setField('requirementType', e.target.value as RequirementDraft['requirementType'])}
            >
              {REQUIREMENT_TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="tsw-formRow tsw-formRowInline">
          <div className="tsw-formCol">
            <label className="tsw-fieldLabel" htmlFor="req-start">
              计划开始时间
            </label>
            <input
              id="req-start"
              type="date"
              className="tsw-input"
              value={draft.plannedStart}
              onChange={(e) => setField('plannedStart', e.target.value)}
            />
          </div>
          <div className="tsw-formCol">
            <label className="tsw-fieldLabel" htmlFor="req-end">
              计划完成时间
            </label>
            <input
              id="req-end"
              type="date"
              className="tsw-input"
              value={draft.plannedEnd}
              onChange={(e) => setField('plannedEnd', e.target.value)}
            />
          </div>
        </div>

        <div className="tsw-formRow">
          <label className="tsw-fieldLabel" htmlFor="req-acceptance">
            验收目标
          </label>
          <textarea
            id="req-acceptance"
            className="tsw-textarea"
            rows={3}
            value={draft.acceptanceCriteria}
            onChange={(e) => setField('acceptanceCriteria', e.target.value)}
            placeholder="描述可验证的验收标准"
          />
        </div>

        {validationError ? <p className="tsw-error">{validationError}</p> : null}

        <div className="tsw-createFooter">
          <button type="button" className="tsw-btn" onClick={onCancel}>
            取消
          </button>
          <button
            type="submit"
            className="tsw-btn tsw-btnPrimary tsw-btnSolid"
            disabled={Boolean(validationError)}
          >
            下一步
          </button>
        </div>
      </form>
      </div>

      <aside className="tsw-createAside">
        <div className="tsw-createAsideCard tsw-createAsideCardFill">
          <div className="tsw-createAsideHead">
            <span className="tsw-createAsideIcon" aria-hidden="true">i</span>
            <strong>填写说明</strong>
          </div>
          <ul className="tsw-createAsideList">
            <li>创建者即为产品负责人</li>
            <li>本步骤仅填写基础信息</li>
            <li>下一步指定研发与测试负责人，可与产品为同一人</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
