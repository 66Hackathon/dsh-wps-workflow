import { useState } from 'react';
import type { Project } from '../../types';
import type { WpsDocument } from '../../types/wps';
import { wpsDocumentHref } from '../../types/wps';
import { WpsDocumentPickerDialog } from './WpsDocumentPickerDialog';

interface Props {
  project: Project;
  canManage?: boolean;
}

export function WpsDocumentsPanel({ project, canManage = false }: Props) {
  const [linkedDocs, setLinkedDocs] = useState<WpsDocument[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="tsw-card">
      <div className="tsw-createWizardHeadingRow">
        <h3 className="tsw-membersPanelTitle">WPS 在线文档</h3>
        {canManage ? (
          <button
            type="button"
            className="tsw-btn tsw-btnPrimary tsw-btnSolid"
            onClick={() => setShowPicker(true)}
          >
            + 添加在线文档
          </button>
        ) : null}
      </div>
      <p className="tsw-muted tsw-createWizardSub">
        关联 WPS 智能文档作为项目资料，可在需求创建时继续引用。
      </p>

      {linkedDocs.length ? (
        <div className="tsw-wpsDocList">
          {linkedDocs.map((doc) => {
            const href = wpsDocumentHref(doc);
            return (
              <div key={doc.id} className="tsw-wpsDocCard">
                <span className="tsw-docUploadIcon tsw-docUploadIconWps" aria-hidden="true">📄</span>
                <div className="tsw-wpsDocRowText">
                  <strong>{doc.name}</strong>
                  <span className="tsw-muted">{doc.type || '智能文档'}</span>
                </div>
                {href ? (
                  <a className="tsw-linkBtn" href={href} target="_blank" rel="noreferrer">
                    打开
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="tsw-empty tsw-wpsDocEmpty">
          <p>尚未关联 WPS 在线文档。</p>
          {canManage ? (
            <button type="button" className="tsw-btn" onClick={() => setShowPicker(true)}>
              从云文档选择
            </button>
          ) : null}
        </div>
      )}

      <p className="tsw-fieldHint">
        项目：{project.name}
        {project.wps_doc_folder_id ? ` · 文档目录 ${project.wps_doc_folder_id}` : ''}
      </p>

      {showPicker ? (
        <WpsDocumentPickerDialog
          onClose={() => setShowPicker(false)}
          onConfirm={async (doc) => {
            setLinkedDocs((prev) => {
              if (prev.some((item) => item.id === doc.id)) return prev;
              return [doc, ...prev];
            });
          }}
        />
      ) : null}
    </div>
  );
}
