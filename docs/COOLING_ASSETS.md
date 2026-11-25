# Вентиляторы и воздушные кулеры

GLB созданы для LUMO как авторские аппроксимации на основе опубликованных габаритов и внешнего вида. В проект включены собственная геометрия, параметры материалов, точки установки и отдельные роторы. Изображения производителей использовались для сверки конструкции. Они отсутствуют в моделях и в комплекте поставки.

| ID модели | Габарит по осям GLB, мм | Конструкция | Источник |
| --- | --- | --- | --- |
| `arctic-p12-pwm-pst` | 120 × 120 × 25 | Квадратная рама, пять профилированных лопастей | [ARCTIC P12 PWM PST](https://www.arctic.de/en/P12-PWM-PST/ACFAN00120A) |
| `arctic-p14-pwm-pst` | 140 × 140 × 27 | Увеличенная рама и отверстия креплений, пять лопастей | [ARCTIC P14 PWM PST](https://www.arctic.de/en/P14-PWM-PST/ACFAN00125A/) |
| `noctua-nf-a12x25-pwm` | 120 × 120 × 25 | Бежевая рама, коричневые лопасти и демпферы | [Noctua NF-A12x25 PWM](https://www.noctua.at/en/products/nf-a12x25-pwm/specifications) |
| `corsair-ar120-rgb` | 120 × 120 × 25 | Тёмная рама, светорассеивающий ротор с отдельным RGB-материалом | [Corsair AR120 RGB](https://www.corsair.com/us/en/p/case-fans/co-9050166-ww/icue-ar120-digital-rgb-120mm-pwm-fan-co-9050166-ww) |
| `arctic-p12-pwm-pst-argb` | 120 × 120 × 25 | Ротор с соединительным кольцом и RGB-материалом | [ARCTIC P12 PWM PST A-RGB](https://www.arctic.de/en/P12-PWM-PST-A-RGB) |
| `deepcool-ak400` | 155 × 127 × 97 | Одна секция рёбер, чёрная крышка, четыре тепловые трубки и один вентилятор | [DeepCool AK400](https://www.deepcool.com/products/Cooling/cpuaircoolers/AK400-Performance-CPU-Cooler/2021/15222.shtml) |
| `thermalright-peerless-assassin-120-se` | 155 × 125 × 135 | Две секции рёбер, шесть тепловых трубок и два вентилятора. В паспортной глубине радиатора указано 110 мм. В модели учтён внешний вентилятор 25 мм | [Thermalright Peerless Assassin 120 SE](https://www.thermalright.com/product/peerless-assassin-120-se/) |
| `noctua-nh-d15-chromax-black` | 168 × 150 × 161 | Две чёрные секции рёбер, шесть тепловых трубок и два вентилятора | [Noctua NH-D15 chromax.black](https://www.noctua.at/en/products/nh-d15-chromax-black/specifications) |

Соберите модели с помощью `scripts/build_fan_models.py` и `scripts/build_air_cooler_models.py` в Blender. Затем сожмите GLB командой Meshopt из [реестра](ASSET_RESEARCH.md). Вентилятор имеет ротор с осью Z, а точка посадки воздушного кулера находится на стороне X+. Отдельные роторы кулеров также вращаются вокруг Z. Внешние размеры проверяются по декодированным вершинам с допуском 0,6 мм. Точные сечения лопастей, крепёжные отверстия, подшипники и светорассеяние требуют измерений физических образцов.
