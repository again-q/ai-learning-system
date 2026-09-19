const KEY = 'sk-a1249f5828944bb58da1fb506728d70e';
const user = '题面：函数 y=(a^2-3a+3)a^x 是指数函数，则 a 的值为____。学生答案：2（后面划掉一个像1或3的）。';
const sys = '你是数学诊断判定的知识点提取。严格规则：只有知识本体（定义/表示/性质/操作/关系）才建K，且用**中粒度概念**（教材粗概念：分式、二次根式、函数定义域、图象变换、函数的单调性、指数函数、一元二次方程…）；具体条件/子情形（如「XX有意义的条件」「复合函数的定义域」「XX的平移变换」）归并到父知识概念，不要单独作为一个知识点；细粒度（具体条件/参数细节）属于题型pattern的variant，不放进知识点名；方法/思想/题型（换元法、分类讨论、指数不等式、解法套路）不建。name 从下方【知识点节点清单】挑选/归一到清单名：分式、二次根式、函数定义域、图象变换、函数单调性、指数函数、指数函数的概念、指数函数的图象与性质、一元二次方程、一元二次方程的解法、集合、不等式。输出纯JSON：{"knowledgeUsage":[{"name":"...","P":1,"D":0.3}]}';
(async () => {
  const t0 = Date.now();
  const resp = await fetch('https://api.deepseek.com/chat/completions', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+KEY}, body: JSON.stringify({ model:'deepseek-v4-flash', thinking:{type:'disabled'}, temperature:0.2, messages:[{role:'system',content:sys},{role:'user',content:user}], max_tokens:600 }) });
  const d = await resp.json();
  if (!resp.ok) { console.log('HTTP', resp.status, JSON.stringify(d).slice(0,300)); process.exit(1); }
  console.log('耗时', ((Date.now()-t0)/1000).toFixed(1)+'s');
  console.log('usage:', JSON.stringify(d.usage||{}));
  console.log('输出:', (d.choices[0].message.content||'').trim());
})().catch(e=>console.log('ERR', e.message));
