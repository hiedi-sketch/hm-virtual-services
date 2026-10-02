import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { describeError } from '../api/print';

/**
 * Connecting Claude to the shop.
 *
 * The shop speaks MCP, so Claude can be asked to do things in it rather than
 * told how: find Pam's order, put the USPS tracking on it, say what is late.
 * It is the same shop the screens are — the same stock movements, the same
 * refusals — reached another way.
 *
 * Two forms of the address, because clients differ in what they can carry. One
 * that can send a header gets the plain URL and the key beside it; one that
 * can only be given a URL gets the key inside the URL. Either is the whole of
 * what is needed, so either is enough to leak the shop — which is why the key
 * stays hidden until she asks for it, and why there is a way to replace it.
 */
export default function ClaudeCard() {
  const [info, setInfo] = useState(null);
  const [showing, setShowing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setInfo(await printApi.mcpKey()); } catch { /* the card simply stays quiet */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error('Could not copy — select it and copy by hand');
    }
  };

  async function rotate() {
    if (!window.confirm('Make a new key? Claude stops working until you reconnect it with the new one.')) return;
    setBusy(true);
    try {
      const res = await printApi.rotateMcpKey();
      setInfo(res.data);
      setShowing(true);
      toast.success(res.message);
    } catch (err) {
      toast.error(describeError(err, 'Could not make a new key'));
    } finally {
      setBusy(false);
    }
  }

  if (!info) return null;
  const hidden = '•'.repeat(32);
  const withKey = `${info.url}/k/${info.key}`;

  return (
    <div className="card !p-4 space-y-3">
      <div>
        <p className="font-bold text-primary">Claude</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Connect Claude to the shop and you can ask for things instead of doing them — "put the USPS
          tracking on Pam's order", "what is late", "what should I print next". It makes the same
          changes the screens do.
        </p>
      </div>

      <div>
        <p className="label">Address</p>
        <div className="flex gap-2">
          <input className="input font-mono text-xs" readOnly value={info.url} onFocus={(e) => e.target.select()} />
          <button type="button" className="btn-secondary shrink-0" onClick={() => copy(info.url, 'Address')}>Copy</button>
        </div>
        <p className="text-xs text-gray-500 mt-1">With the key below as a bearer token.</p>
      </div>

      <div>
        <p className="label">Key</p>
        <div className="flex gap-2">
          <input
            className="input font-mono text-xs"
            readOnly
            value={showing ? info.key : hidden}
            onFocus={(e) => e.target.select()}
          />
          <button type="button" className="btn-ghost shrink-0" onClick={() => setShowing((on) => !on)}>
            {showing ? 'Hide' : 'Show'}
          </button>
          <button type="button" className="btn-secondary shrink-0" onClick={() => copy(info.key, 'Key')}>Copy</button>
        </div>
      </div>

      {/* For anything that will take a URL and nothing else. */}
      <details className="text-xs">
        <summary className="cursor-pointer text-primary font-semibold">
          If it only asks for a URL
        </summary>
        <p className="text-gray-500 mt-1.5 mb-1">
          Some connectors have nowhere to put a key. This address carries it — treat the whole thing
          as the secret.
        </p>
        <div className="flex gap-2">
          <input
            className="input font-mono text-[10px]"
            readOnly
            value={showing ? withKey : `${info.url}/k/${hidden}`}
            onFocus={(e) => e.target.select()}
          />
          <button type="button" className="btn-secondary shrink-0" onClick={() => copy(withKey, 'Address')}>Copy</button>
        </div>
      </details>

      <div className="flex items-center gap-2 pt-1 border-t border-linen">
        <p className="text-xs text-gray-400 flex-1">
          Anyone with the key can change orders and stock. Replace it if it has been somewhere it should not.
        </p>
        <button type="button" className="btn-ghost text-red-600 shrink-0" disabled={busy} onClick={rotate}>
          {busy ? 'Making…' : 'New key'}
        </button>
      </div>
    </div>
  );
}
