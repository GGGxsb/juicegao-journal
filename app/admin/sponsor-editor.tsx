'use client';

import { useRef, useState } from 'react';
import SponsorIcon from '../components/sponsor-icon';
import { resumeImageUrl } from '../lib/resume-image';
import { uploadImageFile } from './upload-image';
import './sponsor-editor.css';

type Field = 'sponsorWechat' | 'sponsorAlipay';
type Props = { wechat: string; alipay: string; onChange: (field: Field, value: string) => void; onBusyChange: (busy: boolean) => void };

export default function SponsorEditor({ wechat, alipay, onChange, onBusyChange }: Props) {
  const inputs = useRef(new Map<Field, HTMLInputElement>());
  const [uploading, setUploading] = useState<Field | null>(null);
  const [error, setError] = useState('');
  async function upload(field: Field, file?: File) {
    if (!file || uploading) return;
    setUploading(field); onBusyChange(true); setError('');
    try { onChange(field, await uploadImageFile(file)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '二维码上传失败，请重试。'); }
    finally { setUploading(null); onBusyChange(false); const input = inputs.current.get(field); if (input) input.value = ''; }
  }
  return <div className="admin-sponsor-editor">
    <div className="admin-sponsor-methods">{[
      { field: 'sponsorWechat' as const, method: 'wechat' as const, label: '微信', value: wechat },
      { field: 'sponsorAlipay' as const, method: 'alipay' as const, label: '支付宝', value: alipay },
    ].map(item => <section className="admin-sponsor-method" key={item.field} aria-label={`${item.label}赞助设置`}>
      <h3><SponsorIcon method={item.method}/>{item.label}</h3>
      {resumeImageUrl(item.value) && <div className="admin-sponsor-preview"><img src={resumeImageUrl(item.value)} alt={`${item.label}二维码预览`}/></div>}
      <div className="admin-sponsor-actions"><button type="button" className="admin-button admin-small" onClick={() => inputs.current.get(item.field)?.click()} disabled={Boolean(uploading)}>{uploading === item.field ? '正在上传…' : item.value ? '更换二维码' : '上传二维码'}</button>{item.value && <button type="button" className="admin-delete-link" disabled={Boolean(uploading)} onClick={() => {onChange(item.field, ''); setError('');}}>移除</button>}</div>
      <label className="admin-field">二维码图片地址<input value={item.value} maxLength={2048} inputMode="url" placeholder="/media/… 或 https://…" disabled={Boolean(uploading)} onChange={event => onChange(item.field, event.target.value)}/></label>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden aria-label={`上传${item.label}二维码文件`} ref={node => {if (node) inputs.current.set(item.field, node); else inputs.current.delete(item.field);}} onChange={event => void upload(item.field, event.target.files?.[0])}/>
    </section>)}</div>
    <p className="admin-sponsor-help">上传自己的收款码后点击「保存资料」。未填写的支付方式不显示。</p>
    {error && <p className="admin-sponsor-error" role="alert">{error}</p>}
  </div>;
}
