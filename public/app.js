const form = document.querySelector('#form');
const input = document.querySelector('#url');
const generate = document.querySelector('#generate');
const preview = document.querySelector('#preview');
const image = document.querySelector('#qr');
const empty = document.querySelector('#empty');
const download = document.querySelector('#download');
const error = document.querySelector('#error');
const status = document.querySelector('#status');
let imageUrl;

function resetResult() {
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = undefined;
  image.hidden = true;
  image.removeAttribute('src');
  download.hidden = true;
  download.removeAttribute('href');
  empty.hidden = false;
  status.textContent = '';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (generate.disabled) return;

  error.textContent = '';
  input.removeAttribute('aria-invalid');
  resetResult();

  const url = input.value.trim();
  if (!url) {
    error.textContent = '웹페이지 URL을 입력해 주세요.';
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }

  generate.disabled = true;
  generate.textContent = '생성 중…';
  preview.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/v1/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 400 || response.status === 413) {
      error.textContent = '1,024바이트 이하의 HTTP 또는 HTTPS 주소를 입력해 주세요.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    if (response.status === 429 || response.status === 503) {
      error.textContent = '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
      return;
    }
    if (!response.ok || response.headers.get('content-type') !== 'image/png') {
      throw new Error('QR response unavailable');
    }
    imageUrl = URL.createObjectURL(await response.blob());
    image.src = imageUrl;
    empty.hidden = true;
    image.hidden = false;
    download.href = imageUrl;
    download.hidden = false;
    status.textContent = 'QR 코드가 생성되었습니다.';
  } catch {
    error.textContent = 'QR 코드를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  } finally {
    generate.disabled = false;
    generate.textContent = 'QR 생성';
    preview.removeAttribute('aria-busy');
  }
});
