const config = require('../../config'),
    hljs = require('./highlight');
// 小程序不支持动态 require（require('./languages/' + lang) 编译失败），改为静态 require 查表
const LANG_MODULES = {
  'c-like': require('./languages/c-like.js'),
  'c': require('./languages/c.js'),
  'bash': require('./languages/bash.js'),
  'css': require('./languages/css.js'),
  'dart': require('./languages/dart.js'),
  'go': require('./languages/go.js'),
  'java': require('./languages/java.js'),
  'javascript': require('./languages/javascript.js'),
  'json': require('./languages/json.js'),
  'less': require('./languages/less.js'),
  'scss': require('./languages/scss.js'),
  'shell': require('./languages/shell.js'),
  'xml': require('./languages/xml.js'),
  'htmlbars': require('./languages/htmlbars.js'),
  'nginx': require('./languages/nginx.js'),
  'php': require('./languages/php.js'),
  'python': require('./languages/python.js'),
  'python-repl': require('./languages/python-repl.js'),
  'typescript': require('./languages/typescript.js'),
};
config.highlight.forEach(item => {
    const mod = LANG_MODULES[item];
    if (mod) hljs.registerLanguage(item, mod.default || mod);
});

module.exports = hljs;
