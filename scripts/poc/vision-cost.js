const fs = require('fs');
const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const key = 'sk-ws-H.ERIIIHD.97y7.MEYCIQCmlFW8xwPD9Y45hk57AycMox0d8_WCOPivN2PJZR4MvQIhAJSqKzOtK_jTfpfCEW3U0gX2N695UoxMB4KZJRlHNyRB';
const imgPath = '/Users/apple/Desktop/ai-learning-system/.reasonix/attachments/clipboard-20260810-154807.452013-000001.jpg';
const buf = fs.readFileSync(imgPath);
console.log('图片大小:', (buf.length/1024).toFixed(1), 'KB');
const dataUrl = 'data:image/jpeg;base64,' + buf.toString('base64');
const prompt = '你是数学学习诊断助手的图像理解阶段。任务：定位每题区域 + 准确转录题目 + 如实描述做题痕迹。不要做诊断判断。';
(async () => {
  const t0 = Date.now();
  const resp = await fetch(url + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: 'qwen3.7-plus', max_tokens: 2000, messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: dataUrl } },
      { type: 'text', text: prompt }
    ] }] }),
  });
  const d = await resp.json();
  if (!resp.ok) { console.log('HTTP', resp.status, JSON.stringify(d).slice(0,300)); process.exit(1); }
  const u = d.usage || {};
  console.log('耗时:', ((Date.now()-t0)/1000).toFixed(1) + 's');
  console.log('VISION usage:', JSON.stringify(u));
  console.log('输出长度:', ((d.choices[0].message.content)||'').length, '字符');
})().catch(e=>console.log('ERR', e.message));
