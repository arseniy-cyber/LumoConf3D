# Источники начального каталога

В каталоге 58 реальных позиций из девяти категорий. Каждая запись содержит производителя, модель, цену в рублях, дату проверки и ссылку на спецификацию товара или технический паспорт. Идентификаторы используются в сборках, базе данных и путях к ресурсам. [Начальные данные](../src/shared/catalog.ts)

| Категория | Позиций | Производители |
|---|---:|---|
| Корпуса | 5 | NZXT, Corsair, Fractal Design |
| Видеокарты | 10 | ASUS, NVIDIA, Sapphire |
| Процессоры | 10 | AMD, Intel |
| Материнские платы | 6 | MSI, ASUS |
| Оперативная память | 6 | Corsair, Kingston |
| Охлаждение | 6 | DeepCool, Thermalright, Noctua, NZXT, ARCTIC, Corsair |
| Блоки питания | 5 | Corsair |
| Накопители | 5 | Kingston, Samsung, Crucial |
| Вентиляторы | 5 | ARCTIC, Noctua, Corsair |

Цены и наличие в начальных данных демонстрационные. В реальном магазине их следует заменить значениями из учётной системы. Номера белых вариантов корпусов NZXT и Kraken Plus указаны в спецификациях. Связанные с ними цена и остаток требуют отдельной записи учёта. [Инструкция по развёртыванию](../DEPLOYMENT.md)

## Параметры совместимости

- Пределы длины видеокарт и высоты кулеров записаны в миллиметрах. В карточке Fractal North TG Light использованы данные инструкции для стеклянной панели. Зазор 148 мм учитывает разъёмы видеокарты. Длина отсека блока питания составляет до 255 мм с одним лотком и до 155 мм с двумя. [Инструкция Fractal North](https://www.fractal-design.com/app/uploads/2022/12/North-Manual-V1.2.pdf)
- Для H5 Flow размеры передних и верхних радиаторов, задний радиатор и требование низкопрофильной памяти для верхнего радиатора 280 мм подтверждены NZXT. Отдельный предел толщины верхнего радиатора с вентиляторами взят из карточки корпуса. [Спецификация H5 Flow](https://nzxt.com/en-intl/products/h5-flow) · [Таблица радиаторов NZXT](https://support.nzxt.com/hc/en-us/articles/47060012674203-What-radiator-sizes-does-the-H5-Flow-2024-support)
- Таблицы поддержки процессоров ASUS и MSI предоставляют опубликованные версии BIOS для 22 пар платы и процессора из каталога. Установленная на конкретном экземпляре платы версия неизвестна. В данных хранится версия из таблицы с идентификатором платы производителя. [ASUS TUF B550](https://www.asus.com/motherboards-components/motherboards/tuf-gaming/tuf-gaming-b550-plus-wifi-ii/helpdesk_cpu?model2Name=TUF-GAMING-B550-PLUS-WIFI-II) · [MSI PRO B760M](https://www.msi.com/Motherboard/PRO-B760M-A-WIFI-DDR4/support#cpu) · [MSI MAG B760](https://www.msi.com/Motherboard/MAG-B760-TOMAHAWK-WIFI/support#cpu) · [MSI MAG Z790](https://www.msi.com/Motherboard/MAG-Z790-TOMAHAWK-WIFI/support#cpu) · [MSI MAG B650](https://www.msi.com/Motherboard/MAG-B650-TOMAHAWK-WIFI/support#cpu) · [MSI PRO B650M](https://www.msi.com/Motherboard/PRO-B650M-A-WIFI/support#cpu)
- Для видеокарт ASUS мощность соответствует опубликованной NVIDIA эталонной конфигурации чипа. Для Sapphire в карточке приводится мощность самой платы. Intel публикует базовую и максимальную турбомощность. Для выбранных AMD Ryzen используется опубликованный TDP. [NVIDIA RTX 4060](https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4060-4060ti/) · [NVIDIA RTX 4070](https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4070-family/) · [NVIDIA RTX 4080](https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4080-family/)
- Платы содержат размеры PCB по ширине и высоте, все шесть комплектов памяти содержат габариты отдельного модуля. Глубину узла материнской платы, зазор отдельных кабелей и размещение конкретного воздушного кулера относительно соседних деталей проверяют по чертежам и фактической установке. Источники кодеков и размеры, полученные из отдельных руководств, указаны в полях `encoderSource` и `dimensionsSource`. [Начальные данные](../src/shared/catalog.ts) · [Габариты модулей Corsair](https://help.corsair.com/hc/en-us/articles/34381966388881-RAM-Memory-Module-Dimensions)
- Corsair SF750 имеет формат SFX. Для его установки в корпуса из начального каталога требуется отдельно проверенное крепление SFX–ATX и достаточная длина кабелей. [Характеристики SF750](https://www.corsair.com/us/en/p/psu/cp-9020284-na/sf-series-sf750-fully-modular-80-plus-platinum-sfx-power-supply-cp-9020284-na)

Восемь пресетов включают девять категорий. Девятый пресет открывает пустой корпус. Проверка сопоставляет каждый идентификатор с категорией и наличием и проверяет отсутствие подтверждённых конфликтов. Версии BIOS и отдельные физические зазоры требуют проверки при сборке. [Тест каталога](../tests/catalog.test.ts) · [Реестр моделей и фотографий](../ASSETS.md)

Фотографии и кадры из видео используются после проверки совпадения варианта, разрешения на коммерческое распространение и условий атрибуции. Оптимизированные WebP хранятся локально. Фотографии и самостоятельные визуализации обозначены в данных как `photograph` и `render`. [Авторы и лицензии](../public/asset-credits.html)
