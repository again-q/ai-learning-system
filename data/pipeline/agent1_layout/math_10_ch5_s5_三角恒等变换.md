# 5.5 三角恒等变换

前面我们学习了诱导公式，利用它们对三角函数式进行恒等变形，可以达到化简、求值或证明的目的。这种利用公式对三角函数式进行的恒等变形就是三角恒等变换。观察诱导公式，可以发现它们都是特殊角与任意角 $\alpha$ 的和（或差）的三角函数与这个任意角 $\alpha$ 的三角函数的恒等关系。如果把特殊角换为任意角 $\beta$，那么任意角 $\alpha$ 与 $\beta$ 的和（或差）的三角函数与 $\alpha, \beta$ 的三角函数会有什么关系呢？下面来研究这个问题。

## 5.5.1 两角和与差的正弦、余弦和正切公式

### 1. 两角差的余弦公式

### 探究

如果已知任意角 $\alpha, \beta$ 的正弦、余弦，能由此推出 $\alpha+\beta, \alpha-\beta$ 的正弦、余弦吗？

下面，我们来探究 $\cos(\alpha-\beta)$ 与角 $\alpha, \beta$ 的正弦、余弦之间的关系。

不妨令 $\alpha \neq 2k\pi + \beta$，$k \in \mathbb{Z}$。

如图 5.5-1，设单位圆与 $x$ 轴的正半轴相交于点 $A(1, 0)$，以 $x$ 轴非负半轴为始边作角 $\alpha, \beta, \alpha-\beta$，它们的终边分别与单位圆相交于点 $P_1(\cos \alpha, \sin \alpha)$，$A_1(\cos \beta, \sin \beta)$，$P(\cos(\alpha-\beta), \sin(\alpha-\beta))$。

连接 $A_1P_1$，$AP$，若把扇形 $OAP$ 绕着点 $O$ 旋转 $\beta$ 角，则点 $A$，$P$ 分别与点 $A_1$，$P_1$ 重合。根据圆的旋转对称性可知，$\overparen{AP}$ 与 $\overparen{A_1P_1}$ 重合，从而 $AP = A_1P_1$，所以 $AP = A_1P_1$。

> **任意一个圆绕着其圆心旋转任意角后都与原来的圆重合**，这一性质叫做**圆的旋转对称性**。

根据两点间的距离公式，得
$$
[\cos(\alpha-\beta)-1]^2 + \sin^2(\alpha-\beta) = (\cos \alpha - \cos \beta)^2 + (\sin \alpha - \sin \beta)^2,
$$
化简得
$$
\cos(\alpha-\beta) = \cos \alpha \cos \beta + \sin \alpha \sin \beta.
$$

> 平面上任意两点 $P_1(x_1, y_1)$，$P_2(x_2, y_2)$ 间的距离公式 $P_1P_2 = \sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}$。

当 $\alpha = 2k\pi + \beta\;(k \in \mathbb{Z})$ 时，容易证明上式仍然成立。

所以，对于任意角 $\alpha, \beta$ 有
$$
\cos(\alpha-\beta) = \cos \alpha \cos \beta + \sin \alpha \sin \beta. \qquad (C_{(\alpha-\beta)})
$$

此公式给出了任意角 $\alpha, \beta$ 的正弦、余弦与其差角 $\alpha-\beta$ 的余弦之间的关系，称为**差角的余弦公式**，简记作 $C_{(\alpha-\beta)}$。

### 例1

利用公式 $C_{(\alpha-\beta)}$ 证明：

(1) $\cos\left(\dfrac{\pi}{2} - \alpha\right) = \sin \alpha$；

(2) $\cos(\pi - \alpha) = -\cos \alpha$。

**证明：**

(1) $\cos\left(\dfrac{\pi}{2} - \alpha\right) = \cos \dfrac{\pi}{2} \cos \alpha + \sin \dfrac{\pi}{2} \sin \alpha = 0 + 1 \times \sin \alpha = \sin \alpha$。

(2) $\cos(\pi - \alpha) = \cos \pi \cos \alpha + \sin \pi \sin \alpha = (-1) \times \cos \alpha + 0 = -\cos \alpha$。

### 例2

已知 $\sin \alpha = \dfrac{3}{5}$，$\alpha \in \left(\dfrac{\pi}{2}, \pi\right)$，$\cos \beta = -\dfrac{5}{13}$，$\beta$ 是第三象限角，求 $\cos(\alpha - \beta)$ 的值。

**解：** 由 $\sin \alpha = \dfrac{3}{5}$，$\alpha \in \left(\dfrac{\pi}{2}, \pi\right)$，得
$$
\cos \alpha = -\sqrt{1-\sin^2\alpha} = -\sqrt{1 - \left(\dfrac{3}{5}\right)^2} = -\dfrac{4}{5}.
$$
又由 $\cos \beta = -\dfrac{5}{13}$，$\beta$ 是第三象限角，得
$$
\sin \beta = -\sqrt{1-\cos^2\beta} = -\sqrt{1 - \left(-\dfrac{5}{13}\right)^2} = -\dfrac{12}{13}.
$$
所以
$$
\cos(\alpha-\beta) = \cos \alpha \cos \beta + \sin \alpha \sin \beta
= \left(-\dfrac{4}{5}\right) \times \left(-\dfrac{5}{13}\right) + \dfrac{3}{5} \times \left(-\dfrac{12}{13}\right)
= \dfrac{20}{65} - \dfrac{36}{65} = -\dfrac{16}{65}.
$$

### 练习

1. 利用公式 $C_{(\alpha-\beta)}$ 证明：
   (1) $\cos\left(\dfrac{3\pi}{2} - \alpha\right) = -\sin \alpha$；
   (2) $\cos(-\alpha) = \cos \alpha$。

2. 利用公式 $C_{(\alpha-\beta)}$ 求 $\cos 15^\circ$ 的值。

3. 已知 $\cos \alpha = -\dfrac{3}{5}$，$\alpha \in \left(\dfrac{\pi}{2}, \pi\right)$，求 $\cos\left(\dfrac{\pi}{4} - \alpha\right)$ 的值。

4. 已知 $\sin \theta = \dfrac{15}{17}$，$\theta$ 是第二象限角，求 $\cos\left(\theta - \dfrac{\pi}{3}\right)$ 的值。

5. 已知 $\sin \alpha = -\dfrac{2}{3}$，$\alpha \in \left(\pi, \dfrac{3\pi}{2}\right)$，$\cos \beta = \dfrac{3}{4}$，$\beta \in \left(\dfrac{3\pi}{2}, 2\pi\right)$，求 $\cos(\beta - \alpha)$ 的值。

### 2. 两角和与差的正弦、余弦、正切公式

### 思考

由公式 $C_{(\alpha-\beta)}$ 出发，你能推导出两角和与差的三角函数的其他公式吗？

下面以公式 $C_{(\alpha-\beta)}$ 为基础来推导其他公式。

例如，比较 $\cos(\alpha-\beta)$ 与 $\cos(\alpha+\beta)$，并注意到 $\alpha+\beta$ 与 $\alpha - \beta$ 之间的联系：$\alpha + \beta = \alpha - (-\beta)$，则由公式 $C_{(\alpha-\beta)}$，有

> 这里用到的是加法和减法的联系，也可用换元的观点来考虑：由于公式 $C_{(\alpha-\beta)}$ 对于任意 $\alpha, \beta$ 都成立，那么把其中的 $\beta$ 换成 $-\beta$ 后，也一定成立。由此也可推得公式 $C_{(\alpha+\beta)}$。

$$
\cos(\alpha+\beta) = \cos[\alpha - (-\beta)] = \cos \alpha \cos(-\beta) + \sin \alpha \sin(-\beta) = \cos \alpha \cos \beta - \sin \alpha \sin \beta.
$$

于是得到了两角和的余弦公式，简记作 $C_{(\alpha+\beta)}$。

$$
\cos(\alpha+\beta) = \cos \alpha \cos \beta - \sin \alpha \sin \beta. \qquad (C_{(\alpha+\beta)})
$$

### 探究

上面得到了两角和与差的余弦公式。我们知道，用诱导公式五（或六）可以实现正弦、余弦的互化。你能根据 $C_{(\alpha+\beta)}$，$C_{(\alpha-\beta)}$ 及诱导公式五（或六），推导出用任意角 $\alpha, \beta$ 的正弦、余弦表示 $\sin(\alpha+\beta)$，$\sin(\alpha-\beta)$ 的公式吗？

通过推导，可以得到：

$$
\sin(\alpha + \beta) = \sin \alpha \cos \beta + \cos \alpha \sin \beta, \qquad (S_{(\alpha + \beta)})
$$
$$
\sin(\alpha - \beta) = \sin \alpha \cos \beta - \cos \alpha \sin \beta. \qquad (S_{(\alpha - \beta)})
$$

### 探究

你能根据正切函数与正弦函数、余弦函数的关系，从 $C_{(\alpha\pm\beta)}$，$S_{(\alpha\pm\beta)}$ 出发，推导出用任意角 $\alpha, \beta$ 的正切表示 $\tan(\alpha+\beta)$，$\tan(\alpha-\beta)$ 的公式吗？

通过推导，可以得到：

$$
\tan(\alpha+\beta) = \frac{\tan \alpha + \tan \beta}{1 - \tan \alpha \tan \beta}, \qquad (T_{(\alpha+\beta)})
$$
$$
\tan(\alpha-\beta) = \frac{\tan \alpha - \tan \beta}{1 + \tan \alpha \tan \beta}. \qquad (T_{(\alpha-\beta)})
$$

公式 $S_{(\alpha+\beta)}$，$C_{(\alpha+\beta)}$，$T_{(\alpha+\beta)}$ 给出了任意角 $\alpha, \beta$ 的三角函数值与其和角 $\alpha+\beta$ 的三角函数值之间的关系，为方便起见，我们把这三个公式都叫做**和角公式**。

类似地，$S_{(\alpha-\beta)}$，$C_{(\alpha-\beta)}$，$T_{(\alpha-\beta)}$ 都叫做**差角公式**。

### 探究

和（差）角公式中，$\alpha, \beta$ 都是任意角。如果令 $\alpha$ 为某些特殊角，就能得到许多有用的公式。你能从和（差）角公式出发推导出诱导公式吗？你还能得到哪些等式？

### 例3

已知 $\sin \alpha = -\dfrac{3}{5}$，$\alpha$ 是第四象限角，求 $\sin\left(\dfrac{\pi}{4} - \alpha\right)$，$\cos\left(\dfrac{\pi}{4} + \alpha\right)$，$\tan\left(\alpha - \dfrac{\pi}{4}\right)$ 的值。

**解：** 由 $\sin \alpha = -\dfrac{3}{5}$，$\alpha$ 是第四象限角，得
$$
\cos \alpha = \sqrt{1-\sin^2\alpha} = \sqrt{1 - \left(-\dfrac{3}{5}\right)^2} = \dfrac{4}{5},
$$
所以
$$
\tan \alpha = \frac{\sin \alpha}{\cos \alpha} = \frac{-\dfrac{3}{5}}{\dfrac{4}{5}} = -\dfrac{3}{4}.
$$
于是有
$$
\begin{aligned}
\sin\left(\dfrac{\pi}{4} - \alpha\right) &= \sin \dfrac{\pi}{4} \cos \alpha - \cos \dfrac{\pi}{4} \sin \alpha \\
&= \dfrac{\sqrt{2}}{2} \times \dfrac{4}{5} - \dfrac{\sqrt{2}}{2} \times \left(-\dfrac{3}{5}\right) \\
&= \dfrac{7\sqrt{2}}{10};
\end{aligned}
$$

$$
\begin{aligned}
\cos\left(\dfrac{\pi}{4} + \alpha\right) &= \cos \dfrac{\pi}{4} \cos \alpha - \sin \dfrac{\pi}{4} \sin \alpha \\
&= \dfrac{\sqrt{2}}{2} \times \dfrac{4}{5} - \dfrac{\sqrt{2}}{2} \times \left(-\dfrac{3}{5}\right) \\
&= \dfrac{7\sqrt{2}}{10};
\end{aligned}
$$

$$
\begin{aligned}
\tan\left(\alpha - \dfrac{\pi}{4}\right) &= \frac{\tan \alpha - \tan \dfrac{\pi}{4}}{1 + \tan \alpha \tan \dfrac{\pi}{4}} \\
&= \frac{-\dfrac{3}{4} - 1}{1 + \left(-\dfrac{3}{4}\right) \times 1} = \frac{-\dfrac{7}{4}}{\dfrac{1}{4}} = -7.
\end{aligned}
$$

### 思考

由以上解答可以看到，在本题条件下有 $\sin\left(\dfrac{\pi}{4} - \alpha\right) = \cos\left(\dfrac{\pi}{4} + \alpha\right)$。那么对于任意角 $\alpha$，此等式成立吗？若成立，你会用几种方法予以证明？

### 例4

利用和（差）角公式计算下列各式的值：

(1) $\sin 72^\circ \cos 42^\circ - \cos 72^\circ \sin 42^\circ$；

(2) $\cos 20^\circ \cos 70^\circ - \sin 20^\circ \sin 70^\circ$；

(3) $\dfrac{1 + \tan 15^\circ}{1 - \tan 15^\circ}$。

**分析：** 和、差角公式把 $\alpha \pm \beta$ 的三角函数式转化成了 $\alpha, \beta$ 的三角函数式。如果反过来，从右到左使用公式，就可以将上述三角函数式化简。

**解：**

(1) 由公式 $S_{(\alpha-\beta)}$，得
$$
\sin 72^\circ \cos 42^\circ - \cos 72^\circ \sin 42^\circ = \sin(72^\circ - 42^\circ) = \sin 30^\circ = \dfrac{1}{2}.
$$

(2) 由公式 $C_{(\alpha+\beta)}$，得
$$
\cos 20^\circ \cos 70^\circ - \sin 20^\circ \sin 70^\circ = \cos(20^\circ + 70^\circ) = \cos 90^\circ = 0.
$$

(3) 由公式 $T_{(\alpha+\beta)}$ 及 $\tan 45^\circ = 1$，得
$$
\frac{1 + \tan 15^\circ}{1 - \tan 15^\circ} = \frac{\tan 45^\circ + \tan 15^\circ}{1 - \tan 45^\circ \tan 15^\circ} = \tan(45^\circ + 15^\circ) = \tan 60^\circ = \sqrt{3}.
$$

### 练习

1. 利用和（差）角公式，求下列各式的值：
   (1) $\sin 15^\circ$；
   (2) $\cos 75^\circ$；
   (3) $\sin 75^\circ$；
   (4) $\tan 15^\circ$。

2. (1) 已知 $\cos \theta = -\dfrac{3}{5}$，$\theta \in \left(\dfrac{\pi}{2}, \pi\right)$，求 $\sin\left(\theta + \dfrac{\pi}{3}\right)$ 的值；
   (2) 已知 $\sin \theta = -\dfrac{12}{13}$，$\theta$ 是第三象限角，求 $\cos\left(\dfrac{\pi}{6} + \theta\right)$ 的值；
   (3) 已知 $\tan \alpha = 3$，求 $\tan\left(\alpha + \dfrac{\pi}{4}\right)$ 的值。

3. 求下列各式的值：
   (1) $\sin 72^\circ \cos 18^\circ + \cos 72^\circ \sin 18^\circ$；
   (2) $\cos 72^\circ \cos 12^\circ + \sin 72^\circ \sin 12^\circ$；
   (3) $\dfrac{\tan 12^\circ + \tan 33^\circ}{1 - \tan 12^\circ \tan 33^\circ}$；
   (4) $\cos 74^\circ \sin 14^\circ - \sin 74^\circ \cos 14^\circ$；
   (5) $\sin 34^\circ \sin 26^\circ - \cos 34^\circ \cos 26^\circ$；
   (6) $\sin 20^\circ \cos 110^\circ + \cos 160^\circ \sin 70^\circ$。

4. 化简：
   (1) $\cos x - \dfrac{\sqrt{3}}{2} \sin x$；
   (2) $\sqrt{3} \sin x + \cos x$；
   (3) $\sqrt{2}(\sin x - \cos x)$；
   (4) $\sqrt{2} \cos x - \sqrt{6} \sin x$。

5. 已知 $\sin(\alpha-\beta)\cos \alpha - \cos(\beta-\alpha)\sin \alpha = \dfrac{3}{5}$，$\beta$ 是第三象限角，求 $\sin\left(\beta + \dfrac{5\pi}{4}\right)$ 的值。

### 3. 二倍角的正弦、余弦、正切公式

以公式 $C_{(\alpha-\beta)}$ 为基础，我们已经得到六个和（差）角公式，下面将以和（差）角公式为基础来推导倍角公式。

### 探究

你能利用 $S_{(\alpha\pm\beta)}$，$C_{(\alpha\pm\beta)}$，$T_{(\alpha\pm\beta)}$ 推导出 $\sin 2\alpha$，$\cos 2\alpha$，$\tan 2\alpha$ 的公式吗？

通过推导，可以得到：

$$
\sin 2\alpha = 2\sin \alpha \cos \alpha, \qquad (S_{2\alpha})
$$
$$
\cos 2\alpha = \cos^2 \alpha - \sin^2 \alpha, \qquad (C_{2\alpha})
$$
$$
\tan 2\alpha = \frac{2\tan \alpha}{1 - \tan^2 \alpha}. \qquad (T_{2\alpha})
$$

如果要求二倍角的余弦公式 $(C_{2\alpha})$ 中仅含 $\alpha$ 的正弦（余弦），那么又可得到：

$$
\cos 2\alpha = 1 - 2\sin^2 \alpha,
$$
$$
\cos 2\alpha = 2\cos^2 \alpha - 1.
$$

> 这里的"倍角"专指"二倍角"，遇到"三倍角"等名词时，"三"字等不可省去。

以上这些公式都叫做**倍角公式**。倍角公式给出了 $\alpha$ 的三角函数与 $2\alpha$ 的三角函数之间的关系。

### 归纳

从和（差）角公式、倍角公式的推导过程可以发现，这些公式存在紧密的逻辑联系，请你进行归纳总结。

### 例5

已知 $\sin 2\alpha = \dfrac{5}{13}$，$\dfrac{\pi}{4} < \alpha < \dfrac{\pi}{2}$，求 $\sin 4\alpha$，$\cos 4\alpha$，$\tan 4\alpha$ 的值。

**分析：** 已知条件给出了 $2\alpha$ 的正弦函数值。由于 $4\alpha$ 是 $2\alpha$ 的二倍角，因此可以考虑用倍角公式。

**解：** 由 $\dfrac{\pi}{4} < \alpha < \dfrac{\pi}{2}$，得 $\dfrac{\pi}{2} < 2\alpha < \pi$。

> "倍"是描述两个数量之间关系的，$2\alpha$ 是 $\alpha$ 的二倍，$4\alpha$ 是 $2\alpha$ 的二倍，$\dfrac{\pi}{2}$ 是 $\dfrac{\pi}{4}$ 的二倍，这里蕴含着换元思想。

又 $\sin 2\alpha = \dfrac{5}{13}$，所以
$$
\cos 2\alpha = -\sqrt{1 - \left(\dfrac{5}{13}\right)^2} = -\dfrac{12}{13}.
$$
于是
$$
\begin{aligned}
\sin 4\alpha &= \sin[2 \times (2\alpha)] \\
&= 2\sin 2\alpha \cos 2\alpha \\
&= 2 \times \dfrac{5}{13} \times \left(-\dfrac{12}{13}\right) = -\dfrac{120}{169};
\end{aligned}
$$

$$
\begin{aligned}
\cos 4\alpha &= \cos[2 \times (2\alpha)] \\
&= 1 - 2\sin^2 2\alpha \\
&= 1 - 2 \times \left(\dfrac{5}{13}\right)^2 = 1 - \dfrac{50}{169} = \dfrac{119}{169};
\end{aligned}
$$

$$
\tan 4\alpha = \frac{\sin 4\alpha}{\cos 4\alpha} = \frac{-\dfrac{120}{169}}{\dfrac{119}{169}} = -\dfrac{120}{119}.
$$

### 例6

在 $\triangle ABC$ 中，$\cos A = \dfrac{4}{5}$，$\tan B = 2$，求 $\tan(2A + 2B)$ 的值。

**解法1：** 在 $\triangle ABC$ 中，

由 $\cos A = \dfrac{4}{5}$，$0 < A < \pi$，得
$$
\sin A = \sqrt{1 - \cos^2 A} = \sqrt{1 - \left(\dfrac{4}{5}\right)^2} = \dfrac{3}{5},
$$
所以
$$
\tan A = \frac{\sin A}{\cos A} = \frac{\dfrac{3}{5}}{\dfrac{4}{5}} = \dfrac{3}{4}.
$$

$$
\tan 2A = \frac{2\tan A}{1 - \tan^2 A} = \frac{2 \times \dfrac{3}{4}}{1 - \left(\dfrac{3}{4}\right)^2} = \frac{\dfrac{3}{2}}{1 - \dfrac{9}{16}} = \frac{\dfrac{3}{2}}{\dfrac{7}{16}} = \dfrac{24}{7}.
$$

又 $\tan B = 2$，所以
$$
\tan 2B = \frac{2\tan B}{1 - \tan^2 B} = \frac{2 \times 2}{1 - 2^2} = \frac{4}{-3} = -\dfrac{4}{3}.
$$

于是
$$
\tan(2A + 2B) = \frac{\tan 2A + \tan 2B}{1 - \tan 2A \tan 2B}
= \frac{\dfrac{24}{7} + \left(-\dfrac{4}{3}\right)}{1 - \dfrac{24}{7} \times \left(-\dfrac{4}{3}\right)}
= \frac{\dfrac{72 - 28}{21}}{1 + \dfrac{96}{21}} = \frac{\dfrac{44}{21}}{\dfrac{117}{21}} = \dfrac{44}{117}.
$$

**解法2：** 在 $\triangle ABC$ 中，

由 $\cos A = \dfrac{4}{5}$，$0 < A < \pi$，得
$$
\sin A = \sqrt{1 - \cos^2 A} = \sqrt{1 - \left(\dfrac{4}{5}\right)^2} = \dfrac{3}{5},
$$
所以
$$
\tan A = \frac{\sin A}{\cos A} = \frac{\dfrac{3}{5}}{\dfrac{4}{5}} = \dfrac{3}{4}.
$$

又 $\tan B = 2$，所以
$$
\tan(A + B) = \frac{\tan A + \tan B}{1 - \tan A \tan B}
= \frac{\dfrac{3}{4} + 2}{1 - \dfrac{3}{4} \times 2}
= \frac{\dfrac{11}{4}}{1 - \dfrac{3}{2}} = \frac{\dfrac{11}{4}}{-\dfrac{1}{2}} = -\dfrac{11}{2}.
$$

所以
$$
\tan(2A + 2B) = \tan[2(A + B)]
= \frac{2\tan(A+B)}{1 - \tan^2(A+B)}
= \frac{2 \times \left(-\dfrac{11}{2}\right)}{1 - \left(-\dfrac{11}{2}\right)^2}
= \frac{-11}{1 - \dfrac{121}{4}} = \frac{-11}{-\dfrac{117}{4}} = \dfrac{44}{117}.
$$

### 练习

1. 已知 $\cos \dfrac{\alpha}{8} = -\dfrac{4}{5}$，$8\pi < \alpha < 12\pi$，求 $\sin \dfrac{\alpha}{4}$，$\cos \dfrac{\alpha}{4}$，$\tan \dfrac{\alpha}{4}$ 的值。

2. 已知 $\sin\left(\alpha - \dfrac{\pi}{4}\right) = \dfrac{5}{13}$，求 $\cos 2\alpha$ 的值。

3. 已知 $\sin 2\alpha = -\sin \alpha$，$\alpha \in \left(\dfrac{\pi}{2}, \pi\right)$，求 $\tan \alpha$ 的值。

4. 已知 $\tan 2\alpha = \dfrac{3}{4}$，求 $\tan \alpha$ 的值。

5. 求下列各式的值：
   (1) $\sin 15^\circ \cos 15^\circ$；
   (2) $\cos^2 \dfrac{\pi}{8} - \sin^2 \dfrac{\pi}{8}$；
   (3) $\dfrac{\tan 22.5^\circ}{1 - \tan^2 22.5^\circ}$；
   (4) $2\cos^2 22.5^\circ - 1$。

### 信息技术应用

**利用信息技术制作三角函数表**

前面在"对数的发明"中曾经谈到，纳皮尔利用对数制作了 $0^\circ \sim 90^\circ$ 每隔 $1'$ 的八位三角函数表。应当说，纳皮尔仅仅凭借手工运算得到这个三角函数表的工作量是非常大的，这也显示出他超人的毅力和为科学献身的精神。今天，我们可以利用已经学会的三角函数知识以及算法知识，借助信息技术，容易地制作出非常精确的三角函数表，下面我们借助信息技术来作一个 $0^\circ \sim 90^\circ$ 每隔 $1'$ 的八位三角函数表。

用计算工具可得：
$$
\sin 1' = 2.908\,882\,046 \times 10^{-4} \approx 0.000\,290\,888.
$$
以此作为初始值，利用
$$
\cos 1' = \sqrt{1 - \sin^2 1'};
$$
$$
\alpha_0 = 1', \quad \alpha_n = \alpha_{n-1} + 1' \;(n \ge 1);
$$
$$
\sin \alpha_n = \sin 1' \cos \alpha_{n-1} + \cos 1' \sin \alpha_{n-1};
$$
$$
\cos \alpha_n = \sqrt{1 - \sin^2 \alpha_n},
$$
就可以写出一个程序框图，然后通过信息技术得到一个正弦函数的三角函数表。

请同学们根据上述思路，自己编写程序，得出一个三角函数表。

## 5.5.2 简单的三角恒等变换

学习了和（差）角公式、二倍角公式以后，我们就有了进行三角恒等变换的新工具，从而使三角恒等变换的内容、思路和方法更加丰富。

### 例7

试以 $\cos \alpha$ 表示 $\sin^2 \dfrac{\alpha}{2}$，$\cos^2 \dfrac{\alpha}{2}$，$\tan^2 \dfrac{\alpha}{2}$。

**解：** $\alpha$ 是 $\dfrac{\alpha}{2}$ 的二倍角。在倍角公式 $\cos 2\alpha = 1 - 2\sin^2 \alpha$ 中，以 $\alpha$ 代替 $2\alpha$，以 $\dfrac{\alpha}{2}$ 代替 $\alpha$，得
$$
\cos \alpha = 1 - 2\sin^2 \dfrac{\alpha}{2},
$$
所以
$$
\sin^2 \dfrac{\alpha}{2} = \frac{1 - \cos \alpha}{2}. \quad \text{①}
$$
在倍角公式 $\cos 2\alpha = 2\cos^2 \alpha - 1$ 中，以 $\alpha$ 代替 $2\alpha$，以 $\dfrac{\alpha}{2}$ 代替 $\alpha$，得
$$
\cos \alpha = 2\cos^2 \dfrac{\alpha}{2} - 1,
$$
所以
$$
\cos^2 \dfrac{\alpha}{2} = \frac{1 + \cos \alpha}{2}. \quad \text{②}
$$
将①②两个等式的左右两边分别相除，得
$$
\tan^2 \dfrac{\alpha}{2} = \frac{1 - \cos \alpha}{1 + \cos \alpha}.
$$

> 例7的结果还可以表示为：
> $$
> \sin \dfrac{\alpha}{2} = \pm \sqrt{\frac{1 - \cos \alpha}{2}}, \quad
> \cos \dfrac{\alpha}{2} = \pm \sqrt{\frac{1 + \cos \alpha}{2}}, \quad
> \tan \dfrac{\alpha}{2} = \pm \sqrt{\frac{1 - \cos \alpha}{1 + \cos \alpha}}
> $$
> 并称之为**半角公式**，符号由 $\dfrac{\alpha}{2}$ 所在象限决定。

因为不同的三角函数式不仅会有结构形式方面的差异，而且还会存在所包含的角，以及这些角的三角函数种类方面的差异，所以进行三角恒等变换时，常常要先寻找式子所包含的各个角之间的联系，并以此为依据选择适当的公式。这是三角恒等变换的一个重要特点。

### 例8

求证：

(1) $\sin \alpha \cos \beta = \dfrac{1}{2}[\sin(\alpha + \beta) + \sin(\alpha - \beta)]$；

(2) $\sin \theta + \sin \varphi = 2\sin \dfrac{\theta + \varphi}{2} \cos \dfrac{\theta - \varphi}{2}$。

**证明：**

(1) 因为
$$
\sin(\alpha+\beta) = \sin \alpha \cos \beta + \cos \alpha \sin \beta,
$$
$$
\sin(\alpha-\beta) = \sin \alpha \cos \beta - \cos \alpha \sin \beta,
$$
将以上两式的左右两边分别相加，得
$$
\sin(\alpha+\beta) + \sin(\alpha-\beta) = 2\sin \alpha \cos \beta,
$$
即
$$
\sin \alpha \cos \beta = \dfrac{1}{2}[\sin(\alpha + \beta) + \sin(\alpha - \beta)].
$$

(2) 由 (1) 可得
$$
\sin(\alpha+\beta) + \sin(\alpha-\beta) = 2\sin \alpha \cos \beta, \quad \text{①}
$$
设 $\alpha+\beta = \theta$，$\alpha-\beta = \varphi$，那么
$$
\alpha = \frac{\theta + \varphi}{2}, \quad \beta = \frac{\theta - \varphi}{2}.
$$
把 $\alpha, \beta$ 的值代入①，即得
$$
\sin \theta + \sin \varphi = 2\sin \frac{\theta + \varphi}{2} \cos \frac{\theta - \varphi}{2}.
$$

> 如果不用 (1) 的结果，如何证明？

例8的证明用到了换元的方法。如把 $\alpha+\beta$ 看作 $\theta$，$\alpha-\beta$ 看作 $\varphi$，从而把包含 $\alpha, \beta$ 的三角函数式转化为 $\theta, \varphi$ 的三角函数式。或者，把 $\sin \alpha \cos \beta$ 看作 $x$，$\cos \alpha \sin \beta$ 看作 $y$，把等式看作 $x$，$y$ 的方程，则原问题转化为解方程（组）求 $x$。它们都体现了化归思想。

### 练习

1. 求证：$\tan \dfrac{\alpha}{2} = \dfrac{\sin \alpha}{1 + \cos \alpha} = \dfrac{1 - \cos \alpha}{\sin \alpha}$。

2. 已知 $\cos \theta = \dfrac{1}{3}$，且 $270^\circ < \theta < 360^\circ$，试求 $\sin \dfrac{\theta}{2}$ 和 $\cos \dfrac{\theta}{2}$ 的值。

3. 已知等腰三角形的顶角的余弦等于 $\dfrac{7}{25}$，求这个三角形的一个底角的正切。

4. 求证：
   (1) $\cos \alpha \sin \beta = \dfrac{1}{2}[\sin(\alpha + \beta) - \sin(\alpha - \beta)]$；
   (2) $\cos \alpha \cos \beta = \dfrac{1}{2}[\cos(\alpha + \beta) + \cos(\alpha - \beta)]$；
   (3) $\sin \alpha \sin \beta = -\dfrac{1}{2}[\cos(\alpha + \beta) - \cos(\alpha - \beta)]$。

5. 求证：
   (1) $\sin \theta - \sin \varphi = 2\cos \dfrac{\theta + \varphi}{2} \sin \dfrac{\theta - \varphi}{2}$；
   (2) $\cos \theta + \cos \varphi = 2\cos \dfrac{\theta + \varphi}{2} \cos \dfrac{\theta - \varphi}{2}$；
   (3) $\cos \theta - \cos \varphi = -2\sin \dfrac{\theta + \varphi}{2} \sin \dfrac{\theta - \varphi}{2}$。

### 例9

求下列函数的周期，最大值和最小值：

(1) $y = \sin x + \sqrt{3} \cos x$；

(2) $y = 3\sin x + 4\cos x$。

**分析：** 便于求周期和最大值、最小值的三角函数式是 $y = A\sin(x + \varphi)$。利用和角公式将其展开，可化为 $y = a\sin x + b\cos x$ 的形式。反之，利用和（差）角公式，可将 $y = a\sin x + b\cos x$ 转化为 $y = A\sin(x + \varphi)$ 的形式，进而就可以求得其周期和最值了。

**解：**

(1) $y = \sin x + \sqrt{3}\cos x$
$$
= 2\left(\frac{1}{2}\sin x + \frac{\sqrt{3}}{2}\cos x\right)
= 2(\sin x \cos \frac{\pi}{3} + \cos x \sin \frac{\pi}{3})
= 2\sin\left(x + \frac{\pi}{3}\right).
$$
因此，所求周期为 $2\pi$，最大值为 $2$，最小值为 $-2$。

> 你能说说这一步变形的理由吗？

(2) 设 $3\sin x + 4\cos x = A\sin(x + \varphi)$，则
$$
3\sin x + 4\cos x = A\sin x \cos \varphi + A\cos x \sin \varphi.
$$
于是
$$
A\cos \varphi = 3,\quad A\sin \varphi = 4,
$$
于是
$$
A^2\cos^2 \varphi + A^2\sin^2 \varphi = 25,
$$
所以 $A^2 = 25$。取 $A = 5$，则 $\cos \varphi = \dfrac{3}{5}$，$\sin \varphi = \dfrac{4}{5}$。

由 $y = 5\sin(x + \varphi)$ 可知，所求周期为 $2\pi$，最大值为 $5$，最小值为 $-5$。

### 例10

如图5.5-2，在扇形 $OPQ$ 中，半径 $OP = 1$，圆心角 $\angle POQ = \dfrac{\pi}{3}$，$C$ 是扇形弧上的动点，矩形 $ABCD$ 内接于扇形。记 $\angle POC = \alpha$，求当角 $\alpha$ 取何值时，矩形 $ABCD$ 的面积最大？并求出这个最大面积。

**分析：** 可先建立矩形 $ABCD$ 的面积 $S$ 与 $\alpha$ 之间的函数关系 $S = f(\alpha)$，再求函数 $S = f(\alpha)$ 的最大值。

**解：** 在 $\mathrm{Rt}\triangle OBC$ 中，$OB = \cos \alpha$，$BC = \sin \alpha$。

在 $\mathrm{Rt}\triangle OAD$ 中，$\dfrac{DA}{OA} = \tan 60^\circ = \sqrt{3}$，所以 $OA = \dfrac{DA}{\sqrt{3}} = \dfrac{BC}{\sqrt{3}} = \dfrac{\sqrt{3}}{3}\sin \alpha$。

设矩形 $ABCD$ 的面积为 $S$，则
$$
\begin{aligned}
S &= AB \cdot BC \\
&= (\cos \alpha - OA) \sin \alpha \\
&= \left(\cos \alpha - \frac{\sqrt{3}}{3}\sin \alpha\right) \sin \alpha \\
&= \sin \alpha \cos \alpha - \frac{\sqrt{3}}{3}\sin^2 \alpha \\
&= \frac{1}{2}\sin 2\alpha - \frac{\sqrt{3}}{3} \cdot \frac{1 - \cos 2\alpha}{2} \\
&= \frac{1}{2}\sin 2\alpha + \frac{\sqrt{3}}{6}\cos 2\alpha - \frac{\sqrt{3}}{6} \\
&= \frac{\sqrt{3}}{3}\left(\frac{\sqrt{3}}{2}\sin 2\alpha + \frac{1}{2}\cos 2\alpha\right) - \frac{\sqrt{3}}{6} \\
&= \frac{\sqrt{3}}{3}\sin\left(2\alpha + \frac{\pi}{6}\right) - \frac{\sqrt{3}}{6}.
\end{aligned}
$$

由 $0 < \alpha < \dfrac{\pi}{3}$，得 $\dfrac{\pi}{6} < 2\alpha + \dfrac{\pi}{6} < \dfrac{5\pi}{6}$，所以当 $2\alpha + \dfrac{\pi}{6} = \dfrac{\pi}{2}$，即 $\alpha = \dfrac{\pi}{6}$ 时，
$$
S_{\text{最大}} = \frac{\sqrt{3}}{3} \times 1 - \frac{\sqrt{3}}{6} = \frac{\sqrt{3}}{6}.
$$

因此，当 $\alpha = \dfrac{\pi}{6}$ 时，矩形 $ABCD$ 的面积最大，最大面积为 $\dfrac{\sqrt{3}}{6}$。

由例9、例10可以看到，通过三角恒等变换，我们把 $y = a\sin x + b\cos x$ 转化为 $y = A\sin(x + \varphi)$ 的形式，这个过程中蕴含了化归思想。

### 练习

1. 求下列函数的周期，最大值和最小值：
   (1) $y = 5\cos x - 12\sin x$；
   (2) $y = \cos x + 2\sin x$。

2. 要在半径为 $R$ 的圆形场地内建一个矩形的花坛，应怎样截取，才能使花坛的面积最大？

3. 已知正 $n$ 边形的边长为 $a$，内切圆的半径为 $r$，外接圆的半径为 $R$。求证 $R + r = \dfrac{a}{2}\cot \dfrac{\pi}{2n}$。

## 习题5.5

### 复习巩固

1. 已知 $\sin \alpha = \dfrac{\sqrt{3}}{2}$，$\cos \beta = -\dfrac{1}{4}$，$\alpha \in \left(\dfrac{\pi}{2}, \pi\right)$，$\beta \in \left(\pi, \dfrac{3\pi}{2}\right)$，求 $\cos(\alpha - \beta)$ 的值。

2. 已知 $\alpha, \beta$ 都是锐角，$\cos \alpha = \dfrac{1}{7}$，$\cos(\alpha + \beta) = -\dfrac{11}{14}$，求 $\cos \beta$ 的值。（提示：$\beta = (\alpha + \beta) - \alpha$）

3. 已知 $\sin(30^\circ + \alpha) = \dfrac{3}{5}$，$60^\circ < \alpha < 150^\circ$，求 $\cos \alpha$ 的值。

4. 在 $\triangle ABC$ 中，$\sin A = \dfrac{5}{13}$，$\cos B = \dfrac{3}{5}$，求 $\cos C$ 的值。

5. 已知 $\tan(\alpha + \beta) = 3$，$\tan(\alpha - \beta) = 5$，求 $\tan 2\alpha$，$\tan 2\beta$ 的值。

6. 化简：
   (1) $\sin 347^\circ \cos 148^\circ + \sin 77^\circ \cos 58^\circ$；
   (2) $\sin 164^\circ \sin 224^\circ + \sin 254^\circ \sin 314^\circ$；
   (3) $\sin(\alpha + \beta)\cos(\gamma - \beta) - \cos(\beta + \alpha)\sin(\beta - \gamma)$；
   (4) $\sin(\alpha - \beta)\sin(\beta - \gamma) - \cos(\alpha - \beta)\cos(\gamma - \beta)$；
   (5) $\dfrac{\tan \dfrac{5\pi}{12} + \tan \dfrac{\pi}{4}}{1 - \tan \dfrac{5\pi}{12} \tan \dfrac{\pi}{4}}$；
   (6) $\dfrac{\sin(\alpha + \beta) - 2\sin \alpha \cos \beta}{2\sin \alpha \sin \beta + \cos(\alpha + \beta)}$。

7. 已知 $\sin \alpha = 0.80$，$\alpha \in \left(0, \dfrac{\pi}{2}\right)$，求 $\sin 2\alpha$，$\cos 2\alpha$ 的值（精确到 0.01）。

8. 求证：
   (1) $(\sin 2\alpha - \cos 2\alpha)^2 = 1 - \sin 4\alpha$；
   (2) $\tan\left(\dfrac{x}{2} + \dfrac{\pi}{4}\right) + \tan\left(\dfrac{x}{2} - \dfrac{\pi}{4}\right) = 2\tan x$；
   (3) $\dfrac{1 + \sin 2\varphi}{\cos \varphi + \sin \varphi} = \cos \varphi + \sin \varphi$；
   (4) $\dfrac{1 - 2\sin \alpha \cos \alpha}{\cos^2 \alpha - \sin^2 \alpha} = \dfrac{1 - \tan \alpha}{1 + \tan \alpha}$；
   (5) $\dfrac{1 - \cos 2\theta}{1 + \cos 2\theta} = \tan^2 \theta$；
   (6) $\dfrac{1 + \sin 2\theta - \cos 2\theta}{1 + \sin 2\theta + \cos 2\theta} = \tan \theta$。

9. 已知 $\sin(\alpha + \beta) = \dfrac{2}{3}$，$\sin(\alpha - \beta) = \dfrac{3}{4}$，求证：
   (1) $\dfrac{\sin \alpha}{\cos \beta} = 5\dfrac{\cos \alpha}{\sin \beta}$；
   (2) $\tan \alpha = 5\tan \beta$。

10. 已知 $\dfrac{1 - \tan \theta}{2 + \tan \theta} = 1$，求证 $\tan 2\theta = -4\tan\left(\theta + \dfrac{\pi}{4}\right)$。

11. 已知一段圆弧所对的圆心角的正弦值等于 $\dfrac{3}{5}$，求这段圆弧所对的圆周角的正弦、余弦和正切。

12. 化简：
    (1) $3\sqrt{15}\sin x + 3\sqrt{5}\cos x$；
    (2) $\dfrac{3}{2}\cos x - \sqrt{3}\sin x$；
    (3) $\sqrt{3}\sin \dfrac{x}{2} + \cos \dfrac{x}{2}$；
    (4) $\sqrt{2}\sin\left(\dfrac{\pi}{4} - x\right) + \sqrt{6}\cos\left(\dfrac{\pi}{4} - x\right)$。

### 综合运用

13. 在 $\triangle ABC$ 中，已知 $\tan A$，$\tan B$ 是 $x$ 的方程 $x^2 + p(x + 1) + 1 = 0$ 的两个实根，求 $\angle C$。

14. 在 $\triangle ABC$ 中，$\angle B = \dfrac{\pi}{4}$，$BC$ 边上的高等于 $\dfrac{1}{3}BC$，则 $\cos A =$（ ）
    A. $\dfrac{3\sqrt{10}}{10}$ \qquad B. $\dfrac{\sqrt{10}}{10}$ \qquad C. $-\dfrac{\sqrt{10}}{10}$ \qquad D. $-\dfrac{3\sqrt{10}}{10}$

15. 求证：
    (1) $3 + \cos 4\alpha - 4\cos 2\alpha = 8\sin^4 \alpha$；
    (2) $\dfrac{\tan \alpha \tan 2\alpha}{\tan 2\alpha - \tan \alpha} + \sqrt{3}(\sin^2 \alpha - \cos^2 \alpha) = 2\sin\left(2\alpha - \dfrac{\pi}{3}\right)$。

16. 是否存在锐角 $\alpha, \beta$，使 $\alpha + 2\beta = \dfrac{2\pi}{3}$，$\tan \dfrac{\alpha}{2} \tan \beta = 2 - \sqrt{3}$ 同时成立？若存在，求出 $\alpha, \beta$ 的度数；若不存在，请说明理由。

17. (1) 求函数 $f(x) = \sin\left(\dfrac{\pi}{3} + 4x\right) + \sin\left(4x - \dfrac{\pi}{6}\right)$ 的周期和单调递增区间；
    (2) 求函数 $f(x) = a\sin x + b\cos x\;(a^2 + b^2 \neq 0)$ 的最大值和最小值。

### 拓广探索

18. 观察以下各等式：
    $$
    \sin^2 30^\circ + \cos^2 60^\circ + \sin 30^\circ \cos 60^\circ = \dfrac{3}{4},
    $$
    $$
    \sin^2 20^\circ + \cos^2 50^\circ + \sin 20^\circ \cos 50^\circ = \dfrac{3}{4},
    $$
    $$
    \sin^2 15^\circ + \cos^2 45^\circ + \sin 15^\circ \cos 45^\circ = \dfrac{3}{4}.
    $$
    分析上述各式的共同特点，写出能反映一般规律的等式，并对等式的正确性作出证明。

19. 你能利用所给图形，证明下列两个等式吗？
    $$
    \sin \alpha + \sin \beta = 2\sin \frac{\alpha + \beta}{2} \cos \frac{\alpha - \beta}{2},
    $$
    $$
    \cos \alpha + \cos \beta = 2\cos \frac{\alpha + \beta}{2} \cos \frac{\alpha - \beta}{2}.
    $$

20. 设 $f(\alpha) = \sin^x \alpha + \cos^x \alpha$，$x \in \{n \mid n = 2k,\; k \in \mathbf{N}_+\}$。利用三角变换，估计 $f(\alpha)$ 在 $x = 2, 4, 6$ 时的取值情况，进而猜想 $x$ 取一般值时 $f(\alpha)$ 的取值范围。
