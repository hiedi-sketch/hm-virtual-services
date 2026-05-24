import { useState, useEffect, useRef } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function ClientMessages() {
  const { user, clientData } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const msgEndRef = useRef();

  function load() {
    if (!clientData?.id) return;
    api.get(`/messages/thread/${clientData.id}`).then(r => {
      setMessages(r.data.data);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, [clientData?.id]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!newMsg.trim()) return;
    setSending(true);
    try {
      const r = await api.post('/messages', { content: newMsg });
      setMessages(prev => [...prev, r.data.data]);
      setNewMsg('');
    } catch { toast.error('Failed to send message'); }
    finally { setSending(false); }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-primary mb-6">Messages</h1>

      <div className="card flex flex-col" style={{ height: '560px' }}>
        <div className="px-4 py-3 border-b border-linen">
          <p className="font-bold text-primary">HM Virtual Services</p>
          <p className="text-xs text-silver">Your dedicated bookkeeping team</p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-linen animate-pulse rounded-xl" />)}
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-2xl mb-2">✉️</p>
              <p className="text-silver text-sm">No messages yet. Send us a message!</p>
            </div>
          ) : (
            messages.map(msg => {
              const isMe = msg.sender_role === 'client';
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${isMe ? 'bg-primary text-white rounded-br-sm' : 'bg-linen text-gray-800 rounded-bl-sm'}`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-xs mt-1 ${isMe ? 'text-white/60' : 'text-silver'}`}>
                      {isMe ? 'You' : 'HM Virtual Services'} · {new Date(msg.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={msgEndRef} />
        </div>

        <form onSubmit={send} className="flex gap-3 p-4 border-t border-linen">
          <textarea
            className="input flex-1 resize-none text-sm"
            rows={2}
            placeholder="Type your message…"
            value={newMsg}
            onChange={e => setNewMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }}
          />
          <button type="submit" className="btn-primary px-5 self-end" disabled={sending}>Send</button>
        </form>
      </div>
    </div>
  );
}
