import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Conversation, ConversationMessage, Project } from '../types';

interface Props {
  projects: Project[];
}

export function ConversationView({ projects }: Props) {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    projects[0]?.id ?? null,
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedProjectId && projects.length) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const loadConversations = useCallback(async (projectId: number) => {
    setLoading(true);
    try {
      const res = await api.listConversations(projectId);
      setConversations(res.items ?? []);
      const first = res.items?.[0]?.id ?? null;
      setSelectedConversationId(first);
    } catch {
      setConversations([]);
      setSelectedConversationId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    void loadConversations(selectedProjectId);
  }, [selectedProjectId, loadConversations]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    void api.listMessages(selectedConversationId).then(
      (res) => { if (!cancelled) setMessages(res.items ?? []); },
      () => { if (!cancelled) setMessages([]); },
    );
    return () => { cancelled = true; };
  }, [selectedConversationId]);

  const handleSend = async () => {
    if (!selectedConversationId || !draft.trim() || sending) return;
    setSending(true);
    try {
      const res = await api.sendMessage(selectedConversationId, draft.trim());
      setMessages((prev) => [...prev, res.user_message, res.assistant_message]);
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  if (!projects.length) {
    return (
      <div className="tsw-card tsw-empty">
        <h3>会话</h3>
        <p>请先创建或选择一个项目。</p>
      </div>
    );
  }

  return (
    <div className="tsw-conversationLayout">
      <aside className="tsw-conversationSidebar">
        <label className="tsw-fieldLabel">
          所属项目
          <select
            className="tsw-select"
            value={selectedProjectId ?? ''}
            onChange={(e) => setSelectedProjectId(Number(e.target.value))}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <h4 className="tsw-conversationSidebarTitle">会话列表</h4>
        {loading ? <p className="tsw-muted">加载中…</p> : null}
        <ul className="tsw-conversationList">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="tsw-conversationListItem"
                data-active={selectedConversationId === c.id ? 'true' : 'false'}
                onClick={() => setSelectedConversationId(c.id)}
              >
                <span className="tsw-conversationListTitle">{c.title}</span>
                <span className="tsw-conversationListMeta">{c.conversation_type}</span>
              </button>
            </li>
          ))}
        </ul>
        {!loading && !conversations.length ? (
          <p className="tsw-muted">暂无会话</p>
        ) : null}
      </aside>
      <section className="tsw-conversationMain">
        {selectedConversationId ? (
          <>
            <div className="tsw-messageList">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="tsw-message"
                  data-role={msg.role.toLowerCase()}
                >
                  <div className="tsw-messageRole">{msg.role === 'USER' ? '我' : 'AI'}</div>
                  <div className="tsw-messageContent">{msg.content}</div>
                </div>
              ))}
            </div>
            <div className="tsw-messageComposer">
              <textarea
                className="tsw-textarea"
                rows={3}
                placeholder="输入消息…（AI 为 stub 回复，不调用 DSH）"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button
                type="button"
                className="tsw-btn tsw-btnPrimary"
                disabled={sending || !draft.trim()}
                onClick={() => void handleSend()}
              >
                {sending ? '发送中…' : '发送'}
              </button>
            </div>
          </>
        ) : (
          <div className="tsw-card tsw-empty">
            <p>选择左侧会话查看消息</p>
          </div>
        )}
      </section>
    </div>
  );
}
