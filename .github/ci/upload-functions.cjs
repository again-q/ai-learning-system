/**
 * 部署云开发云函数（同一把代码上传密钥，官方 ci.cloud.uploadFunction）
 * 需要 env：WECHAT_APPID / WECHAT_ENV / WECHAT_PRIVATE_KEY / PROJECT_PATH / FUNCTIONS（逗号分隔）
 * remoteNpmInstall=true：云端装依赖，不上传本地 node_modules
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ci = require('miniprogram-ci');

const appid = process.env.WECHAT_APPID;
const env = process.env.WECHAT_ENV;
const projectPath = process.env.PROJECT_PATH;
const key = process.env.WECHAT_PRIVATE_KEY;
const names = (process.env.FUNCTIONS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (!appid || !env || !projectPath || !key || !names.length) {
  console.error('缺少 WECHAT_APPID / WECHAT_ENV / PROJECT_PATH / WECHAT_PRIVATE_KEY / FUNCTIONS');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wxci-'));
const keyPath = path.join(tmp, 'private.key');
fs.writeFileSync(keyPath, key.replace(/\\n/g, '\n'), { mode: 0o600 });

const project = new ci.Project({ appid, type: 'miniProgram', projectPath, privateKeyPath: keyPath });

(async () => {
  for (const name of names) {
    const dir = path.join(projectPath, 'cloudfunctions', name);
    if (!fs.existsSync(dir)) throw new Error('云函数目录不存在: ' + dir);
    console.log('→ 部署 ' + name);
    await ci.cloud.uploadFunction({ project, env, name, path: dir, remoteNpmInstall: true });
    console.log('✅ ' + name);
  }
})().then(
  () => fs.rmSync(tmp, { recursive: true, force: true }),
  (e) => { fs.rmSync(tmp, { recursive: true, force: true }); console.error(e); process.exitCode = 1; }
);
