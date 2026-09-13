/**
 * 部署单个云函数 —— miniprogram-ci 的 cloud.uploadFunction
 * （等价微信开发者工具的"上传并部署：云端安装依赖"；不走 COS，没有 1.5MB/60 秒限制）
 * 用法：node upload-functions.cjs <函数名>
 * env：WECHAT_APPID / ENV_ID / WECHAT_PRIVATE_KEY / [PROJECT_PATH]
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ci = require('miniprogram-ci');

const name = process.argv[2];
const appid = process.env.WECHAT_APPID;
const env = process.env.ENV_ID;
const projectPath = process.env.PROJECT_PATH || path.resolve(__dirname, '../..');
const key = process.env.WECHAT_PRIVATE_KEY;
if (!name || !appid || !env || !key) {
  console.error('用法：node upload-functions.cjs <函数名>；需要 WECHAT_APPID / ENV_ID / WECHAT_PRIVATE_KEY');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wxci-'));
const keyPath = path.join(tmp, 'private.key');
fs.writeFileSync(keyPath, key.replace(/\\n/g, '\n'), { mode: 0o600 });

const project = new ci.Project({ appid, type: 'miniProgram', projectPath, privateKeyPath: keyPath });

(async () => {
  const dir = path.join(projectPath, 'cloudfunctions', name);
  if (!fs.existsSync(dir)) throw new Error('云函数目录不存在: ' + dir);
  const r = await ci.cloud.uploadFunction({ project, env, name, path: dir, remoteNpmInstall: true });
  console.log('✅ ' + name + ' 已部署：' + JSON.stringify(r));
})().then(
  // 必须显式退出：miniprogram-ci 上传后有残留句柄，node 不会自己结束 → CI 里会被 timeout 杀掉，白报失败
  () => { fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0); },
  (e) => { fs.rmSync(tmp, { recursive: true, force: true }); console.error('❌ ' + name + ' 失败：' + (e && e.message)); process.exit(1); }
);
