## 5.3 诱导公式

前面利用圆的几何性质，得到了同角三角函数之间的基本关系。我们知道，圆的最重要的性质是对称性，而对称性（如奇偶性）也是函数的重要性质。由此想到，可以利用圆的对称性，研究三角函数的对称性。

### 探究1

如图5.3-1，在直角坐标系内，设任意角 $\alpha$ 的终边与单位圆交于点 $P_1$。

(1) 作 $P_1$ 关于原点的对称点 $P_2$，以 $OP_2$ 为终边的角 $\beta$ 与角 $\alpha$ 有什么关系？角 $\beta$，$\alpha$ 的三角函数值之间有什么关系？

(2) 如果作 $P_1$ 关于 $x$ 轴（或 $y$ 轴）的对称点 $P_3$（或 $P_4$），那么又可以得到什么结论？

下面，借助单位圆的对称性进行探究。

如图5.3-2，以 $OP_2$ 为终边的角 $\beta$ 都是与角 $\pi+\alpha$ 终边相同的角，即 $\beta = 2k\pi + (\pi + \alpha)(k \in \mathbb{Z})$。因此，只要探究角 $\pi+\alpha$ 与 $\alpha$ 的三角函数值之间的关系即可。

设 $P_1(x_1, y_1)$，$P_2(x_2, y_2)$，因为 $P_2$ 是点 $P_1$ 关于原点的对称点，所以

$$x_2 = -x_1,\quad y_2 = -y_1.$$

根据三角函数的定义，得

$$\sin \alpha = y_1,\quad \cos \alpha = x_1,\quad \tan \alpha = \frac{y_1}{x_1},$$
$$\sin(\pi+\alpha) = y_2,\quad \cos(\pi+\alpha) = x_2,\quad \tan(\pi+\alpha) = \frac{y_2}{x_2}.$$

（角 $\pi+\alpha$ 还可以看作是角 $\alpha$ 的终边按逆时针方向旋转角 $\pi$ 得到的。）

从而得

### 公式二

$$
\sin(\pi+\alpha) = -\sin\alpha,
$$
$$
\cos(\pi+\alpha) = -\cos\alpha,
$$
$$
\tan(\pi+\alpha) = \tan\alpha.
$$

如图5.3-3，作 $P_1$ 关于 $x$ 轴的对称点 $P_3$，则以 $OP_3$ 为终边的角为 $-\alpha$，并且有

### 公式三

$$
\sin(-\alpha) = -\sin\alpha,
$$
$$
\cos(-\alpha) = \cos\alpha,
$$
$$
\tan(-\alpha) = -\tan\alpha.
$$

如图5.3-4，作 $P_1$ 关于 $y$ 轴的对称点 $P_4$，则以 $OP_4$ 为终边的角为 $\pi-\alpha$，并且有

### 公式四

$$
\sin(\pi-\alpha) = \sin\alpha,
$$
$$
\cos(\pi-\alpha) = -\cos\alpha,
$$
$$
\tan(\pi-\alpha) = -\tan\alpha.
$$

（请你类比公式二，证明公式三和公式四。）

### 例1

利用公式求下列三角函数值：

1. $\cos 225^\circ$；
2. $\sin \dfrac{8\pi}{3}$；
3. $\sin\left(-\dfrac{16\pi}{3}\right)$；
4. $\tan(-2\,040^\circ)$.

**解：**

1. $\cos 225^\circ = \cos(180^\circ + 45^\circ) = -\cos 45^\circ = -\dfrac{\sqrt{2}}{2}$；

2. $\sin \dfrac{8\pi}{3} = \sin\left(2\pi + \dfrac{2\pi}{3}\right) = \sin \dfrac{2\pi}{3} = \sin\left(\pi - \dfrac{\pi}{3}\right) = \sin \dfrac{\pi}{3} = \dfrac{\sqrt{3}}{2}$；

3. $\sin\left(-\dfrac{16\pi}{3}\right) = -\sin \dfrac{16\pi}{3} = -\sin\left(5\pi + \dfrac{\pi}{3}\right) = -\left(-\sin \dfrac{\pi}{3}\right) = \dfrac{\sqrt{3}}{2}$；

4. $\tan(-2\,040^\circ) = -\tan 2\,040^\circ = -\tan(6 \times 360^\circ - 120^\circ) = \tan 120^\circ$
   $= \tan(180^\circ - 60^\circ) = -\tan 60^\circ = -\sqrt{3}$.

### 思考

由例1，你对公式一~公式四的作用有什么进一步的认识？你能自己归纳一下把任意角的三角函数转化为锐角三角函数的步骤吗？

利用公式一~公式四，可以把任意角的三角函数转化为锐角三角函数，一般可按下面步骤进行：

```
任意负角的三角函数
    ↓ 用公式三或一
任意正角的三角函数
    ↓ 用公式一
0~2π的角的三角函数
    ↓ 用公式二或四
锐角的三角函数
```

数学史上，求三角函数值曾经是一个重要而困难的问题。数学家制作了锐角三角函数表，并通过公式一~公式四，按上述步骤解决了问题。现在，我们可以利用计算工具方便地求任意角的三角函数值，所以这些公式的"求值"作用已经不重要了，但它们所体现的三角函数的对称性，在解决三角函数的各种问题中却依然有重要的作用。

### 例2

化简
$$\frac{\cos(180^\circ + \alpha)\sin(\alpha + 360^\circ)}{\tan(-\alpha-180^\circ)\cos(-180^\circ+\alpha)}.$$

**解：**
$$\tan(-\alpha-180^\circ) = \tan[-(180^\circ + \alpha)] = -\tan(180^\circ + \alpha) = -\tan\alpha,$$
$$\cos(-180^\circ + \alpha) = \cos[-(180^\circ - \alpha)] = \cos(180^\circ - \alpha) = -\cos\alpha,$$

所以

$$
\text{原式} = \frac{(-\cos\alpha)(\sin\alpha)}{(-\tan\alpha)(-\cos\alpha)} = \frac{-\cos\alpha\sin\alpha}{\tan\alpha\cos\alpha} = -\frac{\sin\alpha}{\tan\alpha} = -\cos\alpha.
$$

### 练习

1. 将下列三角函数转化为锐角三角函数，并填在题中横线上：

   1. $\cos \dfrac{13\pi}{9}=$ \_\_\_\_\_\_；
   2. $\sin \dfrac{13\pi}{6}=$ \_\_\_\_\_\_；
   3. $\sin\left(-\dfrac{\pi}{5}\right)=$ \_\_\_\_\_\_；
   4. $\tan(-70^\circ 6')=$ \_\_\_\_\_\_；
   5. $\cos \dfrac{7\pi}{6}=$ \_\_\_\_\_\_；
   6. $\tan 1\,000^\circ 21'=$ \_\_\_\_\_\_。

2. 利用公式求下列三角函数值：

   1. $\cos(-420^\circ)$；
   2. $\sin\left(-\dfrac{7\pi}{6}\right)$；
   3. $\tan(-1\,140^\circ)$；
   4. $\cos\left(-\dfrac{7\pi}{6}\right)$；
   5. $\tan 315^\circ$；
   6. $\sin\left(-\dfrac{11\pi}{4}\right)$.

3. 化简：

   1. $\sin(-\alpha-180^\circ)\cos(-\alpha)\sin(-\alpha+180^\circ)$；
   2. $\cos^3(-\alpha)\sin(2\pi+\alpha)\tan^3(-\alpha-\pi)$.

4. 填表：

| $\alpha$ | $-\dfrac{4\pi}{3}$ | $-\dfrac{5\pi}{3}$ | $\dfrac{5\pi}{4}$ | $-\dfrac{7\pi}{3}$ | $\dfrac{8\pi}{3}$ | $\dfrac{11\pi}{4}$ |
|:--------:|:------------------:|:------------------:|:-----------------:|:------------------:|:-----------------:|:------------------:|
| $\sin\alpha$ | | | | | | |
| $\cos\alpha$ | | | | | | |
| $\tan\alpha$ | | | | | | |

下面在探究1的基础上继续探究。

### 探究2

作 $P_1$ 关于直线 $y=x$ 的对称点 $P_5$，以 $OP_5$ 为终边的角 $\gamma$ 与角 $\alpha$ 有什么关系？角 $\gamma$ 与角 $\alpha$ 的三角函数值之间有什么关系？

如图5.3-5，以 $OP_5$ 为终边的角 $\gamma$ 都是与角 $\dfrac{\pi}{2}-\alpha$ 终边相同的角，即 $\gamma = 2k\pi + \left(\dfrac{\pi}{2} - \alpha\right)(k \in \mathbb{Z})$。因此，只要探究角 $\dfrac{\pi}{2}-\alpha$ 与 $\alpha$ 的三角函数值之间的关系即可。

设 $P_5(x_5, y_5)$，由于 $P_5$ 是点 $P_1$ 关于直线 $y=x$ 的对称点，可以证明

$$x_5 = y_1,\quad y_5 = x_1.$$

根据三角函数的定义，得

$$\sin\left(\frac{\pi}{2} - \alpha\right) = y_5,\quad \cos\left(\frac{\pi}{2} - \alpha\right) = x_5,$$

从而得

### 公式五

$$
\sin\left(\frac{\pi}{2} - \alpha\right) = \cos\alpha,
$$
$$
\cos\left(\frac{\pi}{2} - \alpha\right) = \sin\alpha.
$$

（你能利用平面几何的知识，就图5.3-5所示的情况证明①式吗？其他情况呢？）

### 探究3

作 $P_5$ 关于 $y$ 轴的对称点，又能得到什么结论？

类似地，可得

### 公式六

$$
\sin\left(\frac{\pi}{2} + \alpha\right) = \cos\alpha,
$$
$$
\cos\left(\frac{\pi}{2} + \alpha\right) = -\sin\alpha.
$$

（角 $\dfrac{\pi}{2}+\alpha$ 的终边与角 $\alpha$ 的终边具有怎样的对称性？据此你将如何证明公式六？）

利用公式五或公式六，可以实现正弦函数与余弦函数的相互转化。

公式一~公式六都叫做**诱导公式**（induction formula）。

### 例3

证明：

1. $\sin\left(\dfrac{3\pi}{2} - \alpha\right) = -\cos\alpha$；
2. $\cos\left(\dfrac{3\pi}{2} + \alpha\right) = \sin\alpha$.

**证明：**

1. $\sin\left(\dfrac{3\pi}{2} - \alpha\right) = \sin\left[\pi + \left(\dfrac{\pi}{2} - \alpha\right)\right] = -\sin\left(\dfrac{\pi}{2} - \alpha\right) = -\cos\alpha$；

2. $\cos\left(\dfrac{3\pi}{2} + \alpha\right) = \cos\left[\pi + \left(\dfrac{\pi}{2} + \alpha\right)\right] = -\cos\left(\dfrac{\pi}{2} + \alpha\right) = \sin\alpha$.

### 例4

化简
$$\frac{\sin(2\pi-\alpha)\cos(\pi+\alpha)\cos\left(\dfrac{\pi}{2}+\alpha\right)\cos\left(\dfrac{11\pi}{2}-\alpha\right)}{\cos(\pi-\alpha)\sin(3\pi-\alpha)\sin(-\pi-\alpha)\sin\left(\dfrac{9\pi}{2}+\alpha\right)}.$$

**解：**

原式
$$= \frac{(-\sin\alpha)(-\cos\alpha)(-\sin\alpha)\cos\left[5\pi+\left(\dfrac{\pi}{2}-\alpha\right)\right]}{(-\cos\alpha)\sin(\pi-\alpha)[-\sin(\pi+\alpha)]\sin\left[4\pi+\left(\dfrac{\pi}{2}+\alpha\right)\right]}$$
$$= \frac{-\sin^2\alpha\cos\alpha\left[-\cos\left(\dfrac{\pi}{2}-\alpha\right)\right]}{-\sin\alpha}$$
$$= \frac{-\sin^2\alpha\cos\alpha(-\sin\alpha)}{-\sin\alpha}$$
$$= -\tan\alpha.$$

### 例5

已知 $\sin(53^\circ - \alpha) = \dfrac{1}{5}$，且 $-270^\circ < \alpha < -90^\circ$，求 $\sin(37^\circ + \alpha)$ 的值。

**分析：** 联系条件与结论，注意到 $(53^\circ - \alpha) + (37^\circ + \alpha) = 90^\circ$，由此可利用诱导公式解决问题。

**解：** 因为 $(53^\circ - \alpha) + (37^\circ + \alpha) = 90^\circ$，所以由诱导公式五，得
$$\sin(37^\circ + \alpha) = \sin[90^\circ - (53^\circ - \alpha)] = \cos(53^\circ - \alpha).$$

因为
$$-270^\circ < \alpha < -90^\circ,$$
所以
$$143^\circ < 53^\circ - \alpha < 323^\circ.$$

由 $\sin(53^\circ - \alpha) = \dfrac{1}{5} > 0$，得 $143^\circ < 53^\circ - \alpha < 180^\circ$.

所以
$$\cos(53^\circ - \alpha) = -\sqrt{1 - \sin^2(53^\circ - \alpha)} = -\sqrt{1 - \left(\frac{1}{5}\right)^2} = -\frac{2\sqrt{6}}{5},$$

所以
$$\sin(37^\circ + \alpha) = -\frac{2\sqrt{6}}{5}.$$

### 练习

1. 用诱导公式求下列三角函数值（可用计算工具，第(3)(4)(6)题精确到 $0.000\;1$）：

   1. $\cos \dfrac{65\pi}{6}$；
   2. $\sin\left(-\dfrac{31\pi}{6}\right)$；
   3. $\cos(-1\,182^\circ 13')$；
   4. $\sin 670^\circ 39'$；
   5. $\tan\left(-\dfrac{\pi}{3}\right)$；
   6. $\tan 580^\circ 21'$.

2. 证明：

   1. $\cos\left(\dfrac{3\pi}{2} - \alpha\right) = -\sin\alpha$；
   2. $\cos\left(\dfrac{3\pi}{2} + \alpha\right) = \sin\alpha$；
   3. $\sin\left(\dfrac{3\pi}{2} - \alpha\right) = -\cos\alpha$；
   4. $\sin\left(\dfrac{3\pi}{2} + \alpha\right) = -\cos\alpha$.

3. 化简：

   1. $\dfrac{\cos(\alpha-\pi)}{\sin(\alpha-2\pi)\cos(2\pi-\alpha)}$；
   2. $\cos^2(-\alpha) - \tan(360^\circ + \alpha)$；
   3. $\dfrac{\sin\left(\dfrac{\pi}{2}+\alpha\right)}{\cos\left(\dfrac{\pi}{2}+\alpha\right)} \cdot \dfrac{\cos(\alpha-3\pi)\cos\left(\dfrac{3\pi}{2}-\alpha\right)}{\sin^2\left(\alpha-\dfrac{\pi}{2}\right)}$.

## 习题5.3

#### 复习巩固

1. 用诱导公式求下列三角函数值（可用计算工具，第(2)(3)(4)(5)题精确到 $0.000\;1$）：

   1. $\cos\left(-\dfrac{17\pi}{6}\right)$；
   2. $\sin(-1\,574^\circ)$；
   3. $\sin(-2\,160^\circ 52')$；
   4. $\cos(-1\,751^\circ 36')$；
   5. $\cos\left(-\dfrac{4\pi}{3}\right)$；
   6. $\sin\left(-\dfrac{26\pi}{3}\right)$.

2. 求证：

   1. $\sin(360^\circ - \alpha) = -\sin\alpha$；
   2. $\cos(360^\circ - \alpha) = \cos\alpha$；
   3. $\tan(360^\circ - \alpha) = -\tan\alpha$.

3. 化简：

   1. $1 + \sin(\alpha - 2\pi)\sin(\pi + \alpha) - 2\cos^2(-\alpha)$；
   2. $\sin(-1\,071^\circ)\sin 99^\circ + \sin(-171^\circ)\sin(-261^\circ)$.

4. 在单位圆中，已知角 $\alpha$ 的终边与单位圆的交点为 $P\left(-\dfrac{\sqrt{5}}{5},\ \dfrac{2\sqrt{5}}{5}\right)$，分别求角 $\pi+\alpha$，$-\alpha$，$\pi-\alpha$ 的正弦、余弦函数值。

#### 综合运用

5. 已知 $\sin\left(\dfrac{7\pi}{2} + \alpha\right) = \dfrac{3}{5}$，那么 $\cos\alpha =$（　）

   A. $-\dfrac{4}{5}$　　B. $-\dfrac{3}{5}$　　C. $\dfrac{3}{5}$　　D. $\dfrac{4}{5}$

6. 已知 $\sin(\pi+\alpha) = -\dfrac{\sqrt{2}}{2}$，计算：

   1. $\sin(5\pi-\alpha)$；
   2. $\sin\left(\dfrac{\pi}{2} + \alpha\right)$；
   3. $\cos(\alpha-3\pi)$；
   4. $\tan\left(\dfrac{\pi}{2} - \alpha\right)$.

7. 在 $\triangle ABC$ 中，试判断下列关系是否成立，并说明理由。

   1. $\cos(A+B) = -\cos C$；
   2. $\sin(A+B) = \sin C$；
   3. $\sin\dfrac{A}{2} = \cos\dfrac{C}{2}$；
   4. $\cos\dfrac{A+B}{2} = \sin\dfrac{C}{2}$.

8. 已知 $\sin\left(\dfrac{\pi}{3} - x\right) = \dfrac{1}{3}$，且 $0 < x < \dfrac{\pi}{2}$，求 $\sin\left(\dfrac{\pi}{6} + x\right)$ 和 $\cos\left(\dfrac{2\pi}{3} + x\right)$ 的值。

#### 拓广探索

9. 化简下列各式，其中 $n \in \mathbb{Z}$：

   1. $\sin\left(\dfrac{n\pi}{2} + \alpha\right)$；
   2. $\cos\left(\dfrac{n\pi}{2} - \alpha\right)$.

10. 借助单位圆，还可以建立角的终边之间的哪些特殊位置关系？由此还能得到三角函数值之间的哪些恒等关系？
