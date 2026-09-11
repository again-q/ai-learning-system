/**
 * 上传小程序代码包 → 微信后台生成「开发版」（等价开发者工具里的"上传"）
 * 需要 env：WECHAT_APPID / WECHAT_PRIVATE_KEY / PROJECT_PATH / VERSION / DESC / GITHUB_SHA
 * 私钥只在临时目录落地（mode 600），用完即删，绝不 echo 到日志。
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

const desc = ((process.env.DESC || '').split('\n')[0] || 'ci').trim().slice(0, 60)
  + ' @' + (process.env.GITHUB_SHA || '').slice(0, 7);

const project = new ci.Project({
  appid,
  type: 'miniProgram',
  projectPath,
  privateKeyPath: keyPath,
  // miniprogramRoot 之外的东西本来就不进包，这里只做显式声明 + 排除大目录
  ignores: ['cloudfunctions/**/*', 'node_modules/**/*', 'doc/**/*', 'output/**/*'],
});

(async () => {
  // 不传 setting：直接继承仓库 project.config.json 的编译设置，避免手写错键
  const res = await ci.upload({
    project,
    version: process.env.VERSION || '0.0.0',
    desc,
    robot: 1,
    onProgressUpdate: console.log,
  });
  if (res && Array.isArray(res.subPackageInfo)) {
    for (const p of res.subPackageInfo) {
      console.log('包体积 ' + p.name + ': ' + (p.size / 1024).toFixed(1) + ' KB');
    }
  }
})().then(
  () => fs.rmSync(tmp, { recursive: true, force: true }),
  (e) => { fs.rmSync(tmp, { recursive: true, force: true }); console.error(e); process.exitCode = 1; }
);
