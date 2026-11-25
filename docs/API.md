# HTTP API LUMO

API обслуживается под префиксом `/api`. Магазин определяется по зарегистрированному hostname или по параметру `?store=slug`. JSON-запросы используют `Content-Type: application/json`. Ответы с ошибкой включают `error.code`, `error.message` и иногда `error.details`. Разрешённые публичные origins настраиваются отдельно для каждого магазина.

## Витрина

| Метод и адрес | Запрос и ответ |
| --- | --- |
| GET `/api/health` | `{status}` после подключения витрины к D1 |
| GET `/api/store` | `{store: {slug,name,logoUrl,accent,contact,currency,assemblyFee,services,turnstileSiteKey,checkoutEnabled}}` |
| GET `/api/catalog` | Фильтр `category` и необязательное смещение `offset`. Возвращает `{products,nextOffset}` |
| GET `/api/presets` | `{presets}` |
| POST `/api/quote` | `{parts,services?,promoCode?,options?}` → `{pricing,compatibility}` |
| POST `/api/orders` | Поля расчёта плюс `{customer,turnstileToken,expectedTotal?}` → `{order:{id,status,total,currency}}` |
| POST `/api/builds` | `{build,name?}` → `{id}` |
| GET `/api/builds/:id` | `{build,name}` по ссылке, доступной 30 дней |
| GET или HEAD `/api/media/:id` | Бинарные данные из каталога указанного магазина |

`parts` и `build` задаются объектом соответствия категории и идентификатора товара. Расчёт допускает неполную сборку. `services` содержит идентификаторы опций, включая системную услугу `assembly`. В `options` допустимы `fanLocation` и `radiatorLocation`. Публичный расчёт использует текущие значения D1. Итог округляется целыми единицами валюты, скидка применяется к стоимости товаров.

В `customer` требуется `name` и хотя бы одно из полей `email` или `phone`. `comment` необязателен. С `expectedTotal` новая цена требует повторного подтверждения. Для повторной безопасной отправки клиент может указать случайный `Idempotency-Key` из 20–120 символов. Повтор с тем же содержимым получает номер существующей заявки, а изменение данных с этим же ключом приводит к 409. Публичного просмотра заявки по номеру нет.

## Панель

Административные операции выполняются с origin приложения. Войдите с `{email,password,code}` через `POST /api/admin/login`. Результат содержит `{user,csrfToken}` и cookie. Для последующих изменяющих запросов отправьте `X-CSRF-Token` и сохраните cookie. `GET /api/admin/session` возвращает текущую сессию. `POST /api/admin/logout` отзывает её.

| Ресурс под `/api/admin` | Доступ | Методы |
| --- | --- | --- |
| `/products` | Владелец, менеджер | GET с `offset` возвращает `{products,archivedIds,nextOffset}`. PUT атомарно импортирует `{products}` |
| `/products/:id` | Владелец, менеджер | PUT с `{product}` добавляет, редактирует либо возвращает из архива. DELETE архивирует |
| `/presets` и `/presets/:id` | Владелец, менеджер | GET списка, PUT `{preset}` по id, DELETE по id |
| `/media` | Владелец, менеджер | POST бинарного файла с Content-Type. Ответ `{url,mime}` |
| `/orders` и `/orders/:id` | Владелец, менеджер, поддержка | GET списка с `offset`. PATCH `{status}` по id |
| `/stats` | Владелец, менеджер, поддержка | GET `{stats:{products,available,orders,total,currency}}` |
| `/settings` | Владелец | GET или PUT `{settings}` |
| `/users` и `/users/:id` | Владелец | GET списка. POST `{email,role,password}` возвращает одноразовые данные настройки TOTP. PATCH `{active?,role?}` отзывает сессии сотрудника |
| `/audit` | Владелец | GET последних записей журнала |

Доступные статусы заявки `new`, `review`, `confirmed`, `completed`, `cancelled`. Заказ хранит неизменяемый снимок товаров, услуг, суммы, скидки, конфигурации мест крепления и статуса исходных цен. Смена наличия и цен у товара затрагивает только новые заявки.
