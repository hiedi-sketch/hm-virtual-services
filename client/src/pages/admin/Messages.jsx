import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function AdminMessages() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [threads, setThreads] = useState([]);
  const [activeClientId, setActiveClientId] = useState(searchParams.get('client') || null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const msgEndRef = useRef();

  function loadThreads() {
    api.get('/messages/threads').then(r => {
      setThreads(r.data.data);
      setLoading(false);
    });
  }

  useEffect(() => { loadThreads(); }, []);

  useEffect(() => {
    if (activeClientId) loadThread(activeClientId);
  }, [activeClientId]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function loadThread(clientId) {
    api.get(`/messages/thread/${clientId}`).then(r => {
      setMessages(r.data.data);
      loadThreads();
    });
  }

  async function send(e) {
    e.preventDefault();
    if (!newMsg.trim()) return;
    setSending(true);
    try {
      const r = await api.post('/messages', { client_id: activeClientId, content: newMsg });
      setMessages(prev => [...prev, r.data.data]);
      setNewMsg('');
    } catch { toast.error('Failed to send'); }
    finally { setSending(false); }
  }

  const activeThread = threads.find(t => String(t.client_id) === String(activeClientId));

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-primary mb-6">Messages</h1>

      <div className="flex gap-6 h-[600px]">
        {/* Thread list */}
        <div className="w-64 shrink-0">
          <div className="card h-full overflow-y-auto p-0">
            <div className="p-4 border-b border-linen">
              <p className="text-sm font-semibold text-gray-700">Conversations</p>
            </div>
            {loading ? (
              <div className="p-4 space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-12 bg-linen animate-pulse rounded" />)}
              </div>
            ) : threads.length === 0 ? (
              <p className="text-silver text-sm p-4">No conversations yet.</p>
            ) : (
              <div className="divide-y divide-linen">
                {threads.map(t => (
                  <button key={t.client_id} onClick={() => setActiveClientId(String(t.client_id))}
                    className={`w-full text-left px-4 py-3 hover:bg-linen/60 transition-colors ${String(activeClientId) === String(t.client_id) ? 'bg-linen' : ''}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-800 truncate">{t.business_name}</p>
                      {t.unread_count > 0 && (
                        <span className="ml-2 bg-primary text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shrink-0">{t.unread_count}</span>
                      )}
                    </div>
                    <p className="text-xs text-silver truncate mt-0.5">{t.last_message || 'No messages'}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat pane */}
        <div className="flex-1 card flex flex-col p-0 overflow-hidden">
          {!activeClientId ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-silver text-sm">Select a conversation</p>
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-linen">
                <p className="font-bold text-primary">{activeThread?.business_name || '…'}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {messages.length === 0 && <p className="text-silver text-sm text-center">No messages yet. Start the conversation.</p>}
                {messages.map(msg => {
                  const isMe = msg.sender_id === user.id;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${isMe ? 'bg-primary text-white rounded-br-sm' : 'bg-linen text-gray-800 rounded-bl-sm'}`}>
                        <p className="text-sm">{msg.content}</p>
                        <p className={`text-xs mt-1 ${isMe ? 'text-white/60' : 'text-silver'}`}>
                          {msg.sender_name} · {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={msgEndRef} />
              </div>
              <form onSubmit={send} className="flex gap-3 p-4 border-t border-linen">
                <input className="input flex-1" placeholder="Type a message…" value={newMsg} onChange={e => setNewMsg(e.target.value)} />
                <button type="submit" className="btn-primary px-5" disabled={sending}>Send</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
