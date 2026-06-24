const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.85;

/** Resize and compress an image for avatar upload (keeps payload well under API limits). */
export function prepareAvatarUpload(
  file: File
): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      const scale = Math.min(MAX_DIMENSION / img.width, MAX_DIMENSION / img.height, 1);
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not process image'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      const data = dataUrl.split(',')[1];
      if (!data) {
        reject(new Error('Could not process image'));
        return;
      }

      resolve({ data, mimeType: 'image/jpeg' });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image file'));
    };

    img.src = url;
  });
}
