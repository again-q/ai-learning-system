## 5.2 三角函数的概念

在弧度制下，我们已经将角的范围扩展到全体实数。下面借助这些知识研究上一节开头提出的问题。不失一般性，先研究单位圆上点的运动。现在的任务是：

如图5.2-1，单位圆O上的点P以A为起点做逆时针方向旋转，建立一个数学模型，刻画点P的位置变化情况。

### 5.2.1 三角函数的概念

根据研究函数的经验，我们利用直角坐标系来研究上述问题。

如图5.2-2，以单位圆的圆心O为原点，以射线OA为x轴的非负半轴，建立直角坐标系，点A的坐标为(1，0)，点P的坐标为(x，y)。射线OA从x轴的非负半轴开始，绕点O按逆时针方向旋转角$\alpha$，终止位置为OP。

#### 探究

当$\alpha = \frac{\pi}{6}$时，点P的坐标是什么？当$\alpha = \frac{\pi}{2}$或$\frac{2\pi}{3}$时，点P的坐标又是什么？它们是唯一确定的吗？

一般地，任意给定一个角$\alpha$，它的终边OP与单位圆交点P的坐标能唯一确定吗？

利用勾股定理可以发现，当$\alpha = \frac{\pi}{6}$时，点P的坐标是$\left(\frac{\sqrt{3}}{2}, \frac{1}{2}\right)$；当$\alpha = \frac{\pi}{2}$或$\frac{2\pi}{3}$时，点P的坐标分别是(0, 1)和$\left(-\frac{1}{2}, \frac{\sqrt{3}}{2}\right)$。它们都是唯一确定的。

一般地，任意给定一个角$\alpha \in \mathbf{R}$，它的终边OP与单位圆交点P的坐标，无论是横坐标$x$还是纵坐标$y$，都是唯一确定的。所以，点P的横坐标$x$、纵坐标$y$都是角$\alpha$的函数。下面给出这些函数的定义。

设$\alpha$是一个任意角，$\alpha \in \mathbf{R}$，它的终边OP与单位圆相交于点$P(x, y)$。

1. 把点P的纵坐标$y$叫做$\alpha$的正弦函数（sine function），记作$\sin \alpha$，即
   $$y = \sin \alpha;$$
2. 把点P的横坐标$x$叫做$\alpha$的余弦函数（cosine function），记作$\cos \alpha$，即
   $$x = \cos \alpha;$$
3. 把点P的纵坐标与横坐标的比值$\frac{y}{x}$叫做$\alpha$的正切，记作$\tan \alpha$，即
   $$\frac{y}{x} = \tan \alpha \ (x \neq 0).$$

可以看出，当$\alpha = \frac{\pi}{2}$时，$\alpha$的终边在y轴上，这时点P的横坐标$x = 0$，所以$\frac{y}{x} = \tan \alpha$无意义。除此之外，对于确定的角$\alpha$，$\frac{y}{x}$的值也是唯一确定的。所以，
$$\frac{y}{x} = \tan \alpha \ (x \neq 0)$$
也是以角为自变量，以单位圆上点的纵坐标与横坐标的比值为函数值的函数，称为正切函数（tangent function）。

我们将正弦函数、余弦函数和正切函数统称为三角函数（trigonometric function），通常将它们记为：

- 正弦函数 $y = \sin x$，$x \in \mathbf{R}$；
- 余弦函数 $y = \cos x$，$x \in \mathbf{R}$；
- 正切函数 $y = \tan x$，$x \neq \frac{\pi}{2} + k\pi \ (k \in \mathbf{Z})$。

#### 探究

在初中我们学了锐角三角函数，知道它们都是以锐角为自变量，以比值为函数值的函数。设$x \in \left(0, \frac{\pi}{2}\right)$，把按锐角三角函数定义求得的锐角x的正弦记为$z_1$，并把按本节三角函数定义求得的x的正弦记为$y_1$。$z_1$与$y_1$相等吗？对于余弦、正切也有相同的结论吗？

#### 例1

求$\frac{5\pi}{3}$的正弦、余弦和正切值。

**解：** 在直角坐标系中，作$\angle AOB = \frac{5\pi}{3}$（图5.2-3）。易知$\angle AOB$的终边与单位圆的交点坐标为$\left(\frac{1}{2}, -\frac{\sqrt{3}}{2}\right)$。所以，
$$\sin \frac{5\pi}{3} = -\frac{\sqrt{3}}{2}, \quad
\cos \frac{5\pi}{3} = \frac{1}{2}, \quad
\tan \frac{5\pi}{3} = -\sqrt{3}.$$

#### 例2

如图5.2-4，设$\alpha$是一个任意角，它的终边上任意一点P（不与原点O重合）的坐标为$(x, y)$，点P与原点的距离为$r$。求证：
$$\sin \alpha = \frac{y}{r}, \quad \cos \alpha = \frac{x}{r}, \quad \tan \alpha = \frac{y}{x}.$$

**分析：** 观察图5.2-5，由$\triangle OMP \sim \triangle OM_0P_0$，根据三角函数的定义可以得到证明。

**证明：** 如图5.2-5，设角$\alpha$的终边与单位圆交于点$P_0(x_0, y_0)$。分别过点P，$P_0$作x轴的垂线PM，$P_0M_0$，垂足分别为M，$M_0$，则
$$|P_0M_0| = |y_0|, \ |PM| = |y|,$$
$$|OM_0| = |x_0|, \ |OM| = |x|,$$
$$\triangle OMP \sim \triangle OM_0P_0.$$

于是
$$\frac{|P_0M_0|}{1} = \frac{|PM|}{r}, \quad \text{即} \quad \frac{|y_0|}{1} = \frac{|y|}{r}.$$

因为$y_0$与$y$同号，所以
$$\frac{y_0}{1} = \frac{y}{r}, \quad \text{即} \quad \sin \alpha = \frac{y}{r}.$$

同理可得
$$\cos \alpha = \frac{x}{r}, \quad \tan \alpha = \frac{y}{x}.$$

根据勾股定理，$r = \sqrt{x^2 + y^2}$。由例2可知，只要知道角$\alpha$终边上任意一点P的坐标，就可以求得角$\alpha$的各个三角函数值，并且这些函数值不会随P点位置的改变而改变。

#### 练习

1. 利用三角函数定义，求$0$，$\frac{\pi}{2}$，$\pi$，$\frac{3\pi}{2}$的三个三角函数值。
2. 利用三角函数定义，求$\frac{7\pi}{6}$的三个三角函数值。
3. 已知角$\theta$的终边过点$P(-12, 5)$，求角$\theta$的三角函数值。
4. 已知点P在半径为2的圆上按顺时针方向做匀速圆周运动，角速度为1 rad/s，求2 s时点P所在的位置。

学习了三角函数的定义，接下来研究它们的一些性质。

#### 探究

根据任意角的三角函数定义，先将正弦、余弦、正切函数在弧度制下的定义域填入表5.2-1，再将这三种函数的值在各象限的符号填入图5.2-6中的括号。

**表5.2-1**

| 三角函数 | 定义域 |
|---------|--------|
| $\sin \alpha$ | |
| $\cos \alpha$ | |
| $\tan \alpha$ | |

**图5.2-6**（象限符号图）

#### 例3

求证：角$\theta$为第三象限角的充要条件是
$$\begin{cases}
\sin \theta < 0, \\
\tan \theta > 0.
\end{cases}$$

**证明：** 先证充分性，即如果①②式都成立，那么$\theta$为第三象限角。

因为①式$\sin \theta < 0$成立，所以$\theta$角的终边可能位于第三或第四象限，也可能与y轴的负半轴重合；

又因为②式$\tan \theta > 0$成立，所以$\theta$角的终边可能位于第一或第三象限。

因为①②式都成立，所以$\theta$角的终边只能位于第三象限。于是角$\theta$为第三象限角。

必要性请同学们自己证明。

由三角函数的定义，可以知道：终边相同的角的同一三角函数的值相等，由此得到一组公式：

**公式一**

$$\begin{aligned}
\sin(\alpha + k \cdot 2\pi) &= \sin \alpha, \\
\cos(\alpha + k \cdot 2\pi) &= \cos \alpha, \\
\tan(\alpha + k \cdot 2\pi) &= \tan \alpha,
\end{aligned}$$
其中$k \in \mathbf{Z}$。

> 由公式一可知，三角函数值有"周而复始"的变化规律，即角$\alpha$的终边每绕原点旋转一周，函数值将重复出现。

利用公式一，可以把求任意角的三角函数值，转化为求$0 \sim 2\pi$（或$0^\circ \sim 360^\circ$）角的三角函数值。

#### 例4

确定下列三角函数值的符号，然后用计算工具验证：

1. $\cos 250^\circ$；
2. $\sin\left(-\frac{\pi}{4}\right)$；
3. $\tan(-672^\circ)$；
4. $\tan 3\pi$.

**解：**

1. 因为$250^\circ$是第三象限角，所以
   $$\cos 250^\circ < 0;$$

2. 因为$-\frac{\pi}{4}$是第四象限角，所以
   $$\sin\left(-\frac{\pi}{4}\right) < 0;$$

3. 因为$\tan(-672^\circ) = \tan(48^\circ - 2 \times 360^\circ) = \tan 48^\circ$，而$48^\circ$是第一象限角，所以
   $$\tan(-672^\circ) > 0;$$

4. 因为
   $$\tan 3\pi = \tan(\pi + 2\pi) = \tan \pi,$$
   而$\pi$的终边在x轴上，所以
   $$\tan \pi = 0.$$

请同学们自己完成用计算工具验证。

#### 例5

求下列三角函数值：

1. $\sin 1\,480^\circ 10'$（精确到$0.001$）；
2. $\cos \frac{9\pi}{4}$；
3. $\tan\left(-\frac{11\pi}{6}\right)$.

**解：**

1. $\sin 1\,480^\circ 10' = \sin(40^\circ 10' + 4 \times 360^\circ) = \sin 40^\circ 10' \approx 0.645$；

2. $\cos \frac{9\pi}{4} = \cos\left(\frac{\pi}{4} + 2\pi\right) = \cos \frac{\pi}{4} = \frac{\sqrt{2}}{2}$；

3. $\tan\left(-\frac{11\pi}{6}\right) = \tan\left(\frac{\pi}{6} - 2\pi\right) = \tan \frac{\pi}{6} = \frac{\sqrt{3}}{3}$.

> 可以直接利用计算工具求三角函数的值。用计算工具求值时要注意设置角的适当的度量制。

#### 练习

1. 填表：

| $\alpha$ | $-\pi$ | $\frac{13\pi}{6}$ | $\frac{4\pi}{3}$ | $\frac{15\pi}{4}$ | $2\pi$ |
|----------|--------|-------------------|------------------|-------------------|--------|
| $\sin \alpha$ | | | | | |
| $\cos \alpha$ | | | | | |
| $\tan \alpha$ | | | | | |

2. （口答）设$\alpha$是三角形的一个内角，在$\sin \alpha$，$\cos \alpha$，$\tan \alpha$，$\tan \frac{\alpha}{2}$中，哪些有可能取负值？

3. 确定下列三角函数值的符号：

   - (1) $\sin 156^\circ$；
   - (2) $\cos \frac{16}{5}\pi$；
   - (3) $\cos(-450^\circ)$；
   - (4) $\tan(-8\pi)$；
   - (5) $\sin\left(-\frac{17\pi}{6}\right)$；
   - (6) $\tan 556^\circ$.

4. 对于①$\sin\theta > 0$，②$\sin\theta < 0$，③$\cos\theta > 0$，④$\cos\theta < 0$，⑤$\tan\theta > 0$与⑥$\tan\theta < 0$，选择恰当的关系式序号填空：

   - (1) 角$\theta$为第一象限角的充要条件是____________；
   - (2) 角$\theta$为第二象限角的充要条件是____________；
   - (3) 角$\theta$为第三象限角的充要条件是____________；
   - (4) 角$\theta$为第四象限角的充要条件是____________。

5. 求下列三角函数值（可用计算工具，第(1)题精确到$0.0001$）：

   - (1) $\cos 1\,109^\circ$；
   - (2) $\tan \frac{19\pi}{3}$；
   - (3) $\sin(-1\,050^\circ)$；
   - (4) $\tan(-31\pi)$.

---

### 5.2.2 同角三角函数的基本关系

#### 探究

公式一表明终边相同的角的同一三角函数值相等，那么，终边相同的角的三个三角函数值之间是否也有某种关系呢？

因为三个三角函数值都是由角的终边与单位圆交点所唯一确定的，所以终边相同的角的三个三角函数值一定有内在联系，由公式一可知，我们不妨讨论同一个角的三个三角函数值之间的关系。

如图5.2-7，设点$P(x, y)$是角$\alpha$的终边与单位圆的交点。过P作x轴的垂线，交x轴于M，则$\triangle OMP$是直角三角形，而且$OP = 1$。由勾股定理有
$$OM^2 + MP^2 = 1.$$
因此，$x^2 + y^2 = 1$，即
$$\sin^2 \alpha + \cos^2 \alpha = 1.$$
显然，当$\alpha$的终边与坐标轴重合时，这个公式也成立。

根据三角函数的定义，当$\alpha \neq k\pi + \frac{\pi}{2} \ (k \in \mathbf{Z})$时，有
$$\frac{\sin \alpha}{\cos \alpha} = \tan \alpha.$$

这就是说，同一个角$\alpha$的正弦、余弦的平方和等于1，商等于角$\alpha$的正切。

#### 例6

已知$\sin \alpha = -\frac{3}{5}$，求$\cos \alpha$，$\tan \alpha$的值。

**解：** 因为$\sin \alpha < 0$，$\sin \alpha \neq -1$，所以$\alpha$是第三或第四象限角。

由$\sin^2 \alpha + \cos^2 \alpha = 1$得
$$\cos^2 \alpha = 1 - \sin^2 \alpha = 1 - \left(-\frac{3}{5}\right)^2 = \frac{16}{25}.$$

如果$\alpha$是第三象限角，那么$\cos \alpha < 0$。于是
$$\cos \alpha = -\sqrt{\frac{16}{25}} = -\frac{4}{5},$$
从而
$$\tan \alpha = \frac{\sin \alpha}{\cos \alpha} = \left(-\frac{3}{5}\right) \times \left(-\frac{5}{4}\right) = \frac{3}{4}.$$

如果$\alpha$是第四象限角，那么
$$\cos \alpha = \frac{4}{5}, \quad \tan \alpha = -\frac{3}{4}.$$

#### 例7

求证：$\frac{\cos x}{1 - \sin x} = \frac{1 + \sin x}{\cos x}$.

**证法1：** 由$\cos x \neq 0$，知$\sin x \neq -1$，所以$1 + \sin x \neq 0$，于是

$$
\begin{aligned}
\text{左边} &= \frac{\cos x (1 + \sin x)}{(1 - \sin x)(1 + \sin x)} \\[2mm]
&= \frac{\cos x (1 + \sin x)}{1 - \sin^2 x} \\[2mm]
&= \frac{\cos x (1 + \sin x)}{\cos^2 x} \\[2mm]
&= \frac{1 + \sin x}{\cos x} = \text{右边}.
\end{aligned}
$$

所以，原式成立。

**证法2：** 因为
$$\begin{aligned}
(1 - \sin x)(1 + \sin x) &= 1 - \sin^2 x = \cos^2 x \\
&= \cos x \cdot \cos x,
\end{aligned}$$
且$1 - \sin x \neq 0$，$\cos x \neq 0$，所以
$$\frac{\cos x}{1 - \sin x} = \frac{1 + \sin x}{\cos x}.$$

> 今后，除特殊注明外，我们假定三角恒等式是在使两边都有意义的情况下的恒等式。

#### 练习

1. 已知$\cos \alpha = -\frac{4}{5}$，且$\alpha$为第三象限角，求$\sin \alpha$，$\tan \alpha$的值。
2. 已知$\tan \varphi = -\sqrt{3}$，求$\sin \varphi$，$\cos \varphi$的值。
3. 已知$\sin \theta = 0.35$，求$\cos \theta$，$\tan \theta$的值（精确到$0.01$）。
4. 化简：

   - (1) $\cos \theta \cdot \tan \theta$；
   - (2) $\frac{2 \cos^2 \alpha - 1}{1 - 2 \sin^2 \alpha}$；
   - (3) $(1 + \tan^2 \alpha) \cos^2 \alpha$.

5. 求证：$\sin^4 \alpha + \sin^2 \alpha \cos^2 \alpha + \cos^2 \alpha = 1$.

---

### 习题5.2

#### 复习巩固

1. 用定义法、公式一求下列角的三个三角函数值（可用计算工具）：

   - (1) $-\frac{17\pi}{3}$；
   - (2) $\frac{21\pi}{4}$；
   - (3) $-\frac{23\pi}{6}$；
   - (4) $1\,500^\circ$.

2. 已知角$\alpha$的终边上有一点P的坐标是$(3a, 4a)$，其中$a \neq 0$，求$\sin \alpha$，$\cos \alpha$，$\tan \alpha$的值。

3. 计算：

   - (1) $6\sin(-90^\circ) + 3\sin 0^\circ - 8\sin 270^\circ + 12\cos 180^\circ$；
   - (2) $10\cos 270^\circ + 4\sin 0^\circ + 9\tan 0^\circ + 15\cos 360^\circ$；
   - (3) $2\cos^2 \frac{\pi}{4} - \tan^2 \frac{\pi}{4} + \frac{4}{3} \tan^2 \frac{\pi}{6} - \sin^2 \frac{\pi}{6} + \cos^2 \frac{\pi}{6} + \sin^2 \frac{2\pi}{3}$；
   - (4) $\sin^2 \frac{\pi}{3} + \cos^4 \frac{\pi}{2} - \tan^2 \frac{\pi}{3}$.

4. 化简：

   - (1) $a \sin 0^\circ + b \cos 90^\circ + c \tan 180^\circ$；
   - (2) $-p^2 \cos 180^\circ + q^2 \sin 90^\circ - 2pq \cos 0^\circ$；
   - (3) $a^2 \cos 2\pi - b^2 \sin \frac{3\pi}{2} + ab \cos \pi - ab \sin \frac{\pi}{2}$；
   - (4) $m \tan 0 + n \cos \frac{\pi}{2} - p \sin \pi - q \cos \frac{3\pi}{2} - r \sin 2\pi$.

5. 确定下列三角函数值的符号：

   - (1) $\sin 186^\circ$；
   - (2) $\tan 505^\circ$；
   - (3) $\sin 7.6\pi$；
   - (4) $\tan\left(-\frac{23\pi}{4}\right)$；
   - (5) $\cos 940^\circ$；
   - (6) $\cos(-17)$.

6. (1) 已知$\sin \alpha = -\frac{3}{5}$，且$\alpha$为第四象限角，求$\cos \alpha$，$\tan \alpha$的值；
   (2) 已知$\cos \alpha = -\frac{12}{13}$，且$\alpha$为第二象限角，求$\sin \alpha$，$\tan \alpha$的值；
   (3) 已知$\tan \alpha = -3$，求$\sin \alpha$，$\cos \alpha$的值；
   (4) 已知$\cos \alpha = 0.68$，求$\sin \alpha$，$\tan \alpha$的值（精确到$0.01$）。

#### 综合运用

7. 根据下列条件求函数$f(x) = \sin\left(x + \frac{\pi}{4}\right) + 2\sin\left(x - \frac{\pi}{4}\right) - 4\cos 2x + 3\cos\left(x + \frac{\pi}{4}\right)$的值：

   - (1) $x = \frac{\pi}{4}$；
   - (2) $x = \frac{3\pi}{4}$.

8. 确定下列式子的符号：

   - (1) $\tan 125^\circ \cdot \sin 273^\circ$；
   - (2) $\frac{\tan 108^\circ}{\cos 305^\circ}$；
   - (3) $\sin \frac{5\pi}{4} \cdot \cos \frac{4\pi}{5} \cdot \tan \frac{11\pi}{6}$；
   - (4) $\frac{\cos \frac{11\pi}{6} \cdot \tan \frac{11\pi}{6}}{\sin \frac{2\pi}{3}}$.

9. 求下列三角函数值（可用计算工具，第(1)(3)(4)题精确到$0.0001$）：

   - (1) $\sin\left(-\frac{67\pi}{6}\right)$；
   - (2) $\tan\left(-\frac{3\pi}{4}\right)$；
   - (3) $\cos 398^\circ 13'$；
   - (4) $\tan 766^\circ 15'$.

10. 求证：

    - (1) 角$\theta$为第二或第三象限角的充要条件是$\sin \theta \cdot \tan \theta < 0$；
    - (2) 角$\theta$为第三或第四象限角的充要条件是$\cos \theta \cdot \tan \theta < 0$；
    - (3) 角$\theta$为第一或第四象限角的充要条件是$\frac{\tan \theta}{\sin \theta} > 0$；
    - (4) 角$\theta$为第一或第三象限角的充要条件是$\sin \theta \cdot \cos \theta > 0$.

11. 已知$\sin x = -\frac{1}{3}$，求$\cos x$，$\tan x$的值。

12. 已知$\tan \alpha = \sqrt{3}$，$\pi < \alpha < \frac{3\pi}{2}$，求$\cos \alpha - \sin \alpha$的值。

13. 已知角$\alpha$的终边不在坐标轴上，

    - (1) 用$\cos \alpha$表示$\sin \alpha$，$\tan \alpha$；
    - (2) 用$\sin \alpha$表示$\cos \alpha$，$\tan \alpha$.

14. 求证：

    - (1) $\frac{1 - 2\sin x \cos x}{\cos^2 x - \sin^2 x} = \frac{1 - \tan x}{1 + \tan x}$；
    - (2) $\tan^2 \alpha - \sin^2 \alpha = \tan^2 \alpha \cdot \sin^2 \alpha$；
    - (3) $(\cos \beta - 1)^2 + \sin^2 \beta = 2 - 2\cos \beta$；
    - (4) $\sin^4 x + \cos^4 x = 1 - 2\sin^2 x \cos^2 x$.

15. 已知$\tan \alpha = 2$，求$\frac{\sin \alpha + \cos \alpha}{\sin \alpha - \cos \alpha}$的值。

#### 拓广探索

16. 化简$\sqrt{\frac{1 + \sin \alpha}{1 - \sin \alpha}}$，其中$\alpha$为第二象限角。

17. 从本节的例7可以看出，$\frac{\cos x}{1 - \sin x} = \frac{1 + \sin x}{\cos x}$就是$\sin^2 x + \cos^2 x = 1$的一个变形。你能利用同角三角函数的基本关系推导出更多的关系式吗？

18. (1) 分别计算$\sin^4 \frac{\pi}{3} - \cos^4 \frac{\pi}{3}$和$\sin^2 \frac{\pi}{3} - \cos^2 \frac{\pi}{3}$的值，你有什么发现？
    (2) 任取一个$\alpha$的值，分别计算$\sin^4 \alpha - \cos^4 \alpha$，$\sin^2 \alpha - \cos^2 \alpha$，你又有什么发现？
    (3) 证明：$\forall x \in \mathbf{R}$，$\sin^2 x - \cos^2 x = \sin^4 x - \cos^4 x$.

---

### 阅读与思考 —— 三角学与天文学

三角学的起源、发展与天文学密不可分，它是天文观察结果推算的一种方法。

在1450年以前的三角学主要是球面三角，这不但是因为航海、历法推算以及天文观测等人类实践活动的需要，而且也因为宇宙的奥秘对人类的巨大吸引力，这种"量天的学问"确实太诱人了。后来，由于间接测量、测绘工作的需要而出现了平面三角。

在欧洲，最早将三角学从天文学中独立出来的数学家是德国人雷格蒙塔努斯（J. Regiomontanus，1436—1476）。他在1464年完成的5卷本的著作《论各种三角形》，是欧洲第一部独立于天文学的三角学著作，这部著作首次对三角学做出了完整、独立的阐述，前2卷论述平面三角学，后3卷讨论球面三角学，前2卷中，他采用印度人的正弦，即弧的半弦，明确使用了正弦函数，讨论了一般三角形的正弦定理，提出了求三角形边长的代数解法；后3卷中，给出了球面三角的正弦定理和关于边的余弦定理，他的工作为三角学在平面与球面几何中的应用奠定了牢固基础，对16世纪的数学家产生了极大影响，也对哥白尼等一批天文学家产生了很大影响。

由于雷格蒙塔努斯仅仅采用正弦函数和余弦函数，而且函数值也限定在正数范围内，因而不能推出应有的三角公式，导致计算的困难，后来，哥白尼的学生雷提库斯（G. J. Rheticus，1514—1576）将传统的弧与弦的关系改进为角的三角函数关系，把三角函数定义为直角三角形的边长之比，从而使平面三角学从球面三角学中独立出来。他还采用了六个函数（正弦、余弦、正切、余切、正割、余割），制定了更为精确的正弦、正切、正割表。这些工作都极大推进了三角学的发展。实际上，由于天文学研究的需要，制定更加精确的三角函数表一直是数学家奋斗的目标，这大大推动了三角学的发展。

法国数学家韦达（F. Viete，1540—1603）所做的平面三角与球面三角系统化工作，使得三角学得到进一步发展。他总结了前人的三角学研究成果，将解平面直角三角形和斜三角形的公式汇集在一起，还补充了自己发现的新公式，如正切公式、和差化积公式等，他将解斜三角形的问题转化为解直角三角形的问题，对球面直角三角形，他给出了计算的方法和一套完整的公式及其记忆法则，并将这套公式表示成了代数形式，这是非常重要的工作。

16世纪，三角学从天文学中分离出来，成为数学的一个独立分支。后来，在微积分、物理学的研究和应用（如对振动、声音传播等的研究）中，三角学又找到了新的用武之地。
