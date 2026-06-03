import { useState, useEffect } from "react";
import {
  collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";

export type AppDoc = {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
  storagePath: string;
  uploadedAt: unknown;
};

export type AppNotes = {
  content: string;
  updatedAt: unknown;
};

// ── Documents ─────────────────────────────────────────────────────────────────
export function useAppDocs(appId: number | string) {
  const [docs, setDocs] = useState<AppDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const colRef = collection(db, "appTracker", String(appId), "docs");
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppDoc));
        data.sort((a, b) => {
          const at = (a.uploadedAt as { seconds?: number })?.seconds ?? 0;
          const bt = (b.uploadedAt as { seconds?: number })?.seconds ?? 0;
          return bt - at;
        });
        setDocs(data);
        setLoading(false);
      },
      (err) => { console.error("Docs listener error:", err); setLoading(false); },
    );
    return () => unsub();
  }, [appId]);

  const uploadDoc = async (file: File): Promise<void> => {
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    const storagePath = `appTracker/${appId}/docs/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, storagePath);
    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file);
      task.on(
        "state_changed",
        (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        (err) => {
          setError(`Upload failed: ${err.message}`);
          setUploading(false);
          setUploadProgress(null);
          reject(err);
        },
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            const colRef = collection(db, "appTracker", String(appId), "docs");
            await addDoc(colRef, {
              name: file.name,
              url,
              size: file.size,
              type: file.type,
              storagePath,
              uploadedAt: serverTimestamp(),
            });
            setUploading(false);
            setUploadProgress(null);
            resolve();
          } catch (err2) {
            const msg = err2 instanceof Error ? err2.message : String(err2);
            setError(`Failed to save document metadata: ${msg}`);
            setUploading(false);
            setUploadProgress(null);
            reject(err2);
          }
        }
      );
    });
  };

  const deleteDoc_ = async (docItem: AppDoc) => {
    try {
      await deleteDoc(doc(db, "appTracker", String(appId), "docs", docItem.id));
      const storageRef = ref(storage, docItem.storagePath);
      await deleteObject(storageRef).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Delete failed: ${msg}`);
    }
  };

  return { docs, loading, uploading, uploadProgress, error, uploadDoc, deleteDoc: deleteDoc_ };
}

// ── Notes ─────────────────────────────────────────────────────────────────────
export function useAppNotes(appId: number | string) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const key = `appNotes_${appId}`;
    setNotes(localStorage.getItem(key) ?? "");
  }, [appId]);

  const saveNotes = async (text: string) => {
    setSaving(true);
    localStorage.setItem(`appNotes_${appId}`, text);
    await new Promise(r => setTimeout(r, 400));
    setSaving(false);
  };

  return { notes, setNotes, saving, saveNotes };
}

// ── Helper ────────────────────────────────────────────────────────────────────
export function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
