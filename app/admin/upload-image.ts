/** The same authenticated image upload is used by posts, profiles and resume cards. */
export async function uploadImageFile(file:File):Promise<string> {
  if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw new Error('请选择 PNG、JPG、WebP 或 GIF 图片。');
  if(!file.size||file.size>8*1024*1024)throw new Error('图片应介于 1 字节和 8 MB 之间，请压缩后重试。');
  const form=new FormData();form.append('file',file);
  const response=await fetch('/api/upload',{method:'POST',credentials:'same-origin',body:form});
  let data:{url?:string;error?:string};
  try {data=await response.json();} catch {throw new Error('无法读取上传结果，请稍后重试。');}
  if(!response.ok||typeof data.url!=='string')throw new Error(data.error||'图片上传失败，请重试。');
  return data.url;
}
