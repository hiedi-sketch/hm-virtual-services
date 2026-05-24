import { useState, useEffect, useRef } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { TableSkeleton } from '../../components/common/LoadingSkeleton';

const TAGS = ['contract', 'report', 'receipt', 'tax_document', 'other'];
const TAG_LABELS = { contract: 'Contract', report: 'Report', receipt: 'Receipt', tax_document: 'Tax Document', other: 'Other' };
const TAG_COLORS = { contract: 'bg-blue-100 text-blue-700', report: 'bg-purple-100 text-purple-700', receipt: 'bg-yellow-100 text-yellow-700', tax_document: 'bg-red-100 text-red-700', other: 'bg-gray-100 text-gray-600' };

function fmtSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClientDocuments() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadTag, setUploadTag] = useState('receipt');
  const fileRef = useRef();

  function load() {
    setLoading(true);
    api.get('/documents').then(r => setDocs(r.data.data)).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleUpload(e) {
    e.preventDefault();
    if (!fileRef.current?.files?.[0]) { toast.error('Select a file'); return; }

    const fd = new FormData();
    fd.append('file', fileRef.current.files[0]);
    fd.append('tag', uploadTag);

    setUploading(true);
    try {
      await api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('File uploaded');
      fileRef.current.value = '';
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-primary mb-6">Documents</h1>

      {/* Upload */}
      <div className="card mb-6">
        <h2 className="font-bold text-gray-800 mb-4">Upload a Document</h2>
        <form onSubmit={handleUpload} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Document Type</label>
            <select className="input w-40" value={uploadTag} onChange={e => setUploadTag(e.target.value)}>
              {TAGS.map(t => <option key={t} value={t}>{TAG_LABELS[t]}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-64">
            <label className="label">File</label>
            <input type="file" ref={fileRef} className="input text-sm" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.csv" />
          </div>
          <button type="submit" className="btn-primary" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
        </form>
      </div>

      {/* Documents list */}
      <div className="card">
        {loading ? <TableSkeleton rows={3} /> : docs.length === 0 ? (
          <p className="text-silver text-sm text-center py-8">No documents shared yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-linen">
              <th className="pb-3 text-left label">File</th>
              <th className="pb-3 text-left label">Type</th>
              <th className="pb-3 text-left label">Shared By</th>
              <th className="pb-3 text-left label">Size</th>
              <th className="pb-3 text-left label">Date</th>
              <th className="pb-3 text-right label">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-linen">
              {docs.map(doc => (
                <tr key={doc.id} className="hover:bg-linen/40">
                  <td className="py-3 font-medium text-gray-800">📎 {doc.original_name}</td>
                  <td className="py-3"><span className={`badge ${TAG_COLORS[doc.tag]}`}>{TAG_LABELS[doc.tag]}</span></td>
                  <td className="py-3 text-gray-600">{doc.uploaded_by_name}</td>
                  <td className="py-3 text-silver">{fmtSize(doc.file_size)}</td>
                  <td className="py-3 text-silver">{new Date(doc.created_at).toLocaleDateString()}</td>
                  <td className="py-3 text-right">
                    <a href={`/api/documents/${doc.id}/download`} className="text-xs text-primary hover:underline">Download</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
