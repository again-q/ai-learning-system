/**
 * 生成预览二维码 → 手机上扫码直接进最新代码（短时效，拿到就扫）
 * 需要 env：WECHAT_APPID / WECHAT_PRIVATE_KEY / PROJECT_PATH
 * 产物：QR_DEST（默认 .github/ci/qrcode.png）
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ci = require('miniprogram-ci');

const appid = process.env.WECHAT_APPID;
const projectPath = process.env.PROJECT_PATH;
const key = process.env.WECHAT_PRIVATE_KEY;
if (!appid || !projectPath || !key) {
  console.error('缺少 WECHAT_APPID / PROJECT_PATH / WECHAT_PRIVATE_KEY');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wxci-'));
const keyPath = path.join(tmp, 'private.key');
fs.writeFileSync(keyPath, key.replace(/\\n/g, '\n'), { mode: 0o600 });

const project = new ci.Project({
  appid,
  type: 'miniProgram',
  projectPath,
  privateKeyPath: keyPath,
  ignores: ['cloudfunctions/**/*', 'node_modules/**/*', 'doc/**/*', 'output/**/*'],
});

const dest = process.env.QR_DEST || path.join(__dirname, 'qrcode.png');

(async () => {
  await ci.preview({
    project,
    desc: 'preview @' + (process.env.GITHUB_SHA || '').slice(0, 7),
    qrcodeFormat: 'image',
    qrcodeOutputDest: dest,
    robot: 1,
    onProgressUpdate: console.log,
  });
  console.log('二维码已生成: ' + dest);
})().then(
  () => fs.rmSync(tmp, { recursive: true, force: true }),
  (e) => { fs.rmSync(tmp, { recursive: true, force: true }); console.error(e); process.exitCode = 1; }
);
