/** 选本地图片 → dataURL（图片存在本机，不上传；同步后端时以 base64 传输） */
export function pickImage(onPick: (dataUrl: string, file: File) => void, capture?: 'user' | 'environment') {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  // 手机上会直接调起相机；桌面浏览器会忽略它，仍走文件选择（所以界面别写「正在拍照」）
  if (capture) input.capture = capture
  input.onchange = () => {
    const f = input.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => onPick(String(reader.result), f)
    reader.readAsDataURL(f)
  }
  input.click()
}
