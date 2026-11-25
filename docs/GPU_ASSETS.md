# Видеокарты LUMO

В каталоге десять моделей видеокарт. Для девяти моделей дополнительно изготовлена собственная PBR-геометрия по габаритам и открытым видам производителя. Дата просмотра галерей и проверки размеров 26 ноября 2026 года. Скрипт строит корпус, радиатор, тепловые трубки, плату с контактом PCIe, планку ввода-вывода, разъёмы и роторы как раздельные части. Геометрия и материалы входят в проект с исходниками Blender. Файлы и текстуры сторонних производителей в этих GLB отсутствуют.

| Идентификатор файла | Длина × высота × толщина, мм | Соответствие изделию и ориентиры |
| --- | --- | --- |
| `asus-dual-rtx4060-oc` | 227,2 × 123,24 × 49,6 | Литой кожух компактной серии Dual с двумя роторами Axial-tech, тыльной пластиной и разъёмом 8-pin. [ASUS](https://www.asus.com/motherboards-components/graphics-cards/dual/dual-rtx4060-o8g/) |
| `asus-dual-rtx4060-ti-oc` | 227,2 × 123,24 × 49,6 | Тот же форм-фактор серии Dual, два ротора, своя маркировка модели. [ASUS](https://www.asus.com/motherboards-components/graphics-cards/dual/dual-rtx4060ti-o8g/) |
| `asus-tuf-rtx4070-ti-super-oc` | 305 × 138 × 65 | Металлическая наружная рама, три отдельных ротора, окно в тыльной пластине, зона RGB, 16-pin. [ASUS](https://www.asus.com/motherboards-components/graphics-cards/tuf-gaming/tuf-rtx4070tis-o16g-gaming/) |
| `asus-tuf-rtx4080-super-oc` | 348,2 × 150 × 72,6 | Профиль TUF большего размера с тремя роторами, длинным радиатором, зоной RGB и разъёмом 16-pin. [ASUS](https://www.asus.com/motherboards-components/graphics-cards/tuf-gaming/tuf-rtx4080s-o16g-gaming/) |
| `nvidia-rtx4090-fe` | 304 × 137 × 61 | Перекрёстная металлическая рама FE, закрытые секции, два вентилятора с разных сторон и разъём 16-pin. [NVIDIA](https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/) · [Фотография реального изделия](https://commons.wikimedia.org/wiki/File:Leistungsanalyse_NVIDIA_GeForce_RTX_4090_(Geekerwan)_02_cropped.jpg) |
| `sapphire-pulse-rx6600` | 193 × 120,05 × 40,05 | Компактный Dual-X кожух, два вентилятора, красные акценты и разъём 8-pin. [Sapphire](https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-6600-8g-gddr6) |
| `sapphire-pulse-rx7600` | 240 × 107,1 × 44,07 | Два вентилятора, красный рисунок на лицевой и тыльной пластинах, разъём 8-pin. [Sapphire](https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-7600-8g-gddr6) |
| `sapphire-pulse-rx7700-xt` | 280 × 128,75 × 52,57 | Тяжёлый Dual-X кожух, два вентилятора, красный рисунок, два разъёма 8-pin. [Sapphire](https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-7700-xt-12g-gddr6) |
| `sapphire-pulse-rx7800-xt` | 280 × 128,75 × 52,57 | Та же серия и габариты, маркировка RX 7800 XT, два вентилятора и два разъёма 8-pin. [Sapphire](https://www.sapphiretech.com/en/consumer/pulse-radeon-rx-7800-xt-16g-gddr6) |

Масштаб источников соответствует миллиметрам, при экспорте Blender переводит их в метры. Высота карты, толщина и длина идут по X, Y и Z. Точные внешние размеры подтверждены по границам декодированного меша с допустимой погрешностью 0,25 мм. Мелкие детали, крепёжные координаты, внутренние контуры и рисунки отрисованы приближённо. Производители не предоставляли CAD-материалы для этих файлов.

## Повторная сборка

```bash
LUMO_MODEL_OUTPUT=/tmp/lumo-gpu-source blender -b -t 4 --python-exit-code 1 --python scripts/build_gpu_models.py
for model in /tmp/lumo-gpu-source/*.glb; do
  npx --yes --package @gltf-transform/cli@4.5.1 -- gltf-transform meshopt "$model" "public/models/${model##*/}"
done
node --experimental-strip-types --test tests/gpu-assets.test.ts
```

Можно передать идентификатор модели после `--` для одиночной сборки. Опция `--render` сохраняет проверочные рендеры в /tmp. Компактные GLB занимают 205–250 КБ. Девять тестов проверяют загрузку через Three.js и Meshopt, масштаб, отсутствие внешних ресурсов, количество отдельных вентиляторов и наличие узлов планки, PCIe и питания.
