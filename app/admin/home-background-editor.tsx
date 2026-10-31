'use client';

import { useRef, useState } from 'react';
import { resumeImageUrl } from '../lib/resume-image';
import { uploadImageFile } from './upload-image';
import './home-background-editor.css';

export default function HomeBackgroundEditor({ value, onChange, onBusyChange }: { value: string; onChange: (value: string) => void; onBusyChange: (busy: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false), [error, setError] = useState('');
  async function upload(file?: File) {
    if (!file || uploading) return;
    setUploading(true); onBusyChange(true); setError('');
    try { onChange(await uploadImageFile(file)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '背景图上传失败，请重试。'); }
    finally { setUploading(false); onBusyChange(false); if (input.current) input.current.value = ''; }
  }
  const image = resumeImageUrl(value);
  return <div className="admin-home-background">
    <h3>全站顶部背景图</h3>
    {image && <div className="admin-home-background-preview"><img src={image} alt="前台页面顶部背景预览"/></div>}
    <div className="admin-home-background-actions">
      <button type="button" className="admin-button admin-small" disabled={uploading} onClick={() => input.current?.click()}>{uploading ? '正在上传…' : image ? '更换背景图' : '上传背景图'}</button>
      {value && <button type="button" className="admin-delete-link" disabled={uploading} onClick={() => {onChange(''); setError('');}}>移除背景图</button>}
    </div>
    <label className="admin-field">背景图片地址<input value={value} inputMode="url" maxLength={2048} placeholder="/media/… 或 https://…" onChange={event => onChange(event.target.value)}/><small>首页、博客、文章、关于和地图等前台页面共用。建议使用横向图片；顶部自动渐隐，随页面自然滚出。留空时显示柔和的渐变底色。</small></label>
    <input ref={input} type="file" hidden aria-label="上传全站背景图片" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => void upload(event.target.files?.[0])}/>
    {error && <p className="admin-home-background-error" role="alert">{error}</p>}
  </div>;
}
