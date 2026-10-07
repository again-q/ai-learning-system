const ci = require('miniprogram-ci');
const project = new ci.Project({
  appid: 'wxff46c8329892715c',
  type: 'miniProgram',
  projectPath: '/Users/apple/Downloads/班级生日祝福小程序 3/小程序版',
  privateKeyPath: '/Users/apple/.wxkeys/private.wxff46c8329892715c.key',
  ignores: ['node_modules/**/*'],
});
ci.upload({ project, version: '0.0.1', desc: 'CI 连通性测试', robot: 1, onProgressUpdate: () => {} })
  .then(r => console.log('✅ 上传成功！', JSON.stringify(r).slice(0, 400)))
  .catch(e => console.log('❌ 失败:', (e && (e.message || e.errMsg)) || String(e)));
