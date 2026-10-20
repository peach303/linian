import { useState } from 'react'
import { pickImage } from '@/lib/file'
import { useChatStore } from '@/store/useChatStore'
import { ExtendButton, ExtendHint } from './ui'

/**
 * 发图片
 *
 * 图片存在本机（dataURL），同步后端时以 base64 传。
 * 「拍照」只在手机浏览器上真的会调起相机（桌面浏览器会忽略 `capture`），所以措辞不写「正在拍照」。
 */
export function ImageForm() {
  const sendImage = useChatStore((s) => s.sendImage)
  const [draft, setDraft] = useState<{ url: string; name: string } | null>(null)

  return (
    <div className="space-y-2 pt-1">
      {draft ? (
        <div className="relative overflow-hidden rounded-lg ring-1 ring-hairline">
          <img src={draft.url} alt="" className="max-h-40 w-full object-cover" />
          <button
            className="tap absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/45 text-[12px] text-white"
            onClick={() => setDraft(null)}
            title="移除"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="grid h-24 place-items-center rounded-lg border border-dashed border-brand-soft bg-surface text-[12px] text-ink-faint">
          从相册里选一张
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className="tap rounded-md border border-brand-soft px-3 py-1.5 text-[12px] text-brand-deep"
          onClick={() => pickImage((url, f) => setDraft({ url, name: f.name }))}
        >
          🖼 选本机图片
        </button>
        <button
          className="tap rounded-md border border-brand-soft px-3 py-1.5 text-[12px] text-brand-deep"
          onClick={() => pickImage((url, f) => setDraft({ url, name: f.name }), 'environment')}
          title="手机浏览器会直接调起相机"
        >
          📷 拍照
        </button>
      </div>

      <div className="flex items-center gap-2">
        <ExtendHint>{draft ? draft.name : '图片只在你的设备上（本机保存，同步时走 base64）'}</ExtendHint>
        <ExtendButton
          className="ml-auto"
          disabled={!draft}
          onClick={() => draft && sendImage(draft.url)}
        >
          发送
        </ExtendButton>
      </div>

      <ExtendHint>他收到图片后会按普通消息回复（图片卡不占句数额度）。</ExtendHint>
    </div>
  )
}
