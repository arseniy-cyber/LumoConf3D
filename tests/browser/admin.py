"""Exercise admin UI against a disposable loopback-only Pages and D1 environment.

Set LUMO_ADMIN_FIXTURES to a private directory containing a password file and
bootstrap-admin output in an enrollment file. An optional qa-order-001 SQL
fixture lets this run verify actual order status mutations.
"""
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import struct
import time
from playwright.sync_api import sync_playwright, expect

directory = Path(os.environ['LUMO_ADMIN_FIXTURES'])
origin = os.environ.get('LUMO_ADMIN_TEST_ORIGIN', 'http://127.0.0.1:8793').rstrip('/')
if urlparse(origin).hostname not in {'127.0.0.1', 'localhost', '::1'}:
    raise ValueError('This test modifies fixtures and accepts a loopback origin only.')
owner_email = os.environ.get('LUMO_ADMIN_TEST_EMAIL', 'admin-check@example.test')

def token(secret, step=0):
    latch = int(time.time()) // 30 + step
    digest = hmac.new(base64.b32decode(secret), struct.pack('>Q', latch), hashlib.sha1).digest()
    offset = digest[-1] & 15
    return f'{(struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7fffffff) % 1000000:06d}'

def signed_in(page, email, password, secret):
    page.locator('input[name=email]').fill(email)
    page.locator('input[name=password]').fill(password)
    page.locator('input[name=code]').fill(token(secret))
    page.get_by_role('button', name='Войти в панель').click()
    try:
        expect(page.locator('.lumo-admin-user strong')).to_have_text(email, timeout=5000)
    except AssertionError:
        raise AssertionError('Admin test sign-in failed. ' + ' '.join(page.get_by_role('alert').all_text_contents())) from None

def nav(page, title):
    page.get_by_role('navigation', name='Разделы управления').get_by_role('button', name=title, exact=True).click()
    expect(page.get_by_role('heading', level=1)).to_have_text(title)

enrollment = (directory / 'enrollment').read_text().splitlines()[-1]
secret = parse_qs(urlparse(enrollment).query)['secret'][0]
password = (directory / 'password').read_text().strip()
suffix = secrets.token_hex(4)
test_item = 'qa-mount-fan-' + suffix
chrome = os.environ.get('LUMO_TEST_CHROMIUM', '/usr/bin/chromium')
with sync_playwright() as driver:
    browser = driver.chromium.launch(executable_path=chrome, args=['--no-sandbox'])
    desktop = browser.new_context(viewport={'width': 1440, 'height': 940}, accept_downloads=True)
    page = desktop.new_page()
    exceptions = []
    page.on('pageerror', lambda error: exceptions.append(str(error)))
    result = page.goto(origin + '/admin')
    assert result.status == 200
    expect(page.get_by_role('heading', name='Управление магазином')).to_be_visible()
    page.screenshot(path=str(directory / 'login.png'))
    assert page.request.get(origin + '/api/admin/products').status == 401
    print('1. Anonymous /admin form and catalog API restriction')

    signed_in(page, owner_email, password, secret)
    expect(page.get_by_text('Последние заявки')).to_be_visible()
    assert page.request.get(origin + '/api/admin/stats').json()['stats']['products'] >= 58
    assert any(cookie['httpOnly'] and cookie['sameSite'] == 'Strict' for cookie in desktop.cookies())
    page.screenshot(path=str(directory / 'overview.png'))
    print('2. Owner TOTP session, cookie flags, dashboard metrics')

    nav(page, 'Каталог')
    search = page.get_by_role('searchbox')
    search.fill('Ryzen 7')
    expect(page.get_by_role('table').get_by_text('AMD Ryzen 7 7800X3D', exact=True)).to_be_visible()
    search.fill('unavailable-zzzzz')
    expect(page.get_by_text('Позиции не найдены')).to_be_visible()
    search.clear()
    with page.expect_download() as download:
        page.get_by_role('button', name='Экспорт JSON').click()
    exported = json.loads(Path(download.value.path()).read_text())
    assert len(exported['products']) >= 58
    page.screenshot(path=str(directory / 'catalog.png'))
    print('3. Catalog search, empty results and seeded JSON export')

    page.get_by_role('button', name='Добавить', exact=True).click()
    dialog = page.get_by_role('dialog')
    for name, value in [('name', 'QA Cooling Fan'), ('brand', 'QA Brand'), ('model', 'QA 120'),
                        ('id', test_item), ('price', '1500'), ('source', 'https://example.test/fan'),
                        ('width','120'), ('height','120'), ('depth','25')]:
        dialog.locator('input[name=' + name + ']').fill(value)
    dialog.locator('select[name=category]').select_option('fan')
    dialog.locator('input[name=fanSizeMm]').fill('120')
    dialog.locator('input[name=inStock]').check()
    photo = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/jXUAAAAASUVORK5CYII=')
    dialog.get_by_label('Загрузить фотографию', exact=True).set_input_files({
        'name': 'fixture.png', 'mimeType': 'image/png', 'buffer': photo,
    })
    expect(dialog.locator('input[name="media-image"]')).to_have_value(re.compile(r'^/api/media/'))
    photo_url = dialog.locator('input[name="media-image"]').input_value()
    assert page.request.get(origin + photo_url).headers.get('content-type') == 'image/png'
    mount = dialog.locator('.lumo-admin-mount-graph')
    mount.scroll_into_view_if_needed()
    mount.click(position={'x': 37, 'y': 38})
    assert dialog.locator('input[name=offset-x]').input_value() != '0'
    dialog.locator('input[name=offset-x]').fill('10')
    dialog.locator('input[name=mount-rotation]').fill('20')
    page.screenshot(path=str(directory / 'mount-editor.png'))
    dialog.get_by_role('button', name='Сохранить', exact=True).click()
    expect(page.get_by_text('Комплектующее сохранено.', exact=True)).to_be_visible(timeout=12000)
    created = next(product for product in page.request.get(origin + '/api/admin/products').json()['products'] if product['id'] == test_item)
    assert created['specs']['mountOffsetMm']['x'] == 10 and created['specs']['mountRotationDeg'] == 20
    print('4. Field validation, real PNG upload, graphical mounting point and persisted geometry')

    for category in ('case', 'cpu', 'gpu', 'cooler', 'storage'):
        page.get_by_role('button', name='Добавить', exact=True).click()
        draft = page.get_by_role('dialog')
        draft.locator('select[name=category]').select_option(category)
        hardware_model = draft.locator('input[name="model"]')
        mesh_url = draft.locator('input[name="media-model"]')
        expect(hardware_model).to_have_count(1)
        expect(mesh_url).to_have_count(1)
        hardware_model.fill('Catalog part model')
        if category == 'cpu':
            local_model = Path(__file__).resolve().parents[2] / 'public/models/amd-ryzen-7-7800x3d.glb'
            draft.get_by_label('Загрузить GLB-модель', exact=True).set_input_files(str(local_model))
            expect(mesh_url).to_have_value(re.compile(r'^/api/media/'))
            model_response = page.request.get(origin + mesh_url.input_value())
            assert model_response.headers.get('content-type') == 'model/gltf-binary'
            assert model_response.body()[:4] == b'glTF'
        else:
            mesh_url.fill('/models/catalog-part.glb')
        expect(hardware_model).to_have_value('Catalog part model')
        draft.get_by_role('button', name='Отмена', exact=True).click()
    print('4a. Five model field isolation retests by category and real GLB upload')

    search = page.get_by_role('searchbox')
    search.fill(test_item)
    page.get_by_role('button', name='Редактировать QA Cooling Fan').click()
    dialog = page.get_by_role('dialog')
    dialog.get_by_role('button', name='Архивировать').click()
    dialog.get_by_role('button', name='Подтвердить архивацию').click()
    expect(page.get_by_text('Комплектующее архивировано.')).to_be_visible()
    page.get_by_role('searchbox').fill(test_item)
    expect(page.get_by_text('В архиве', exact=True).last).to_be_visible()
    page.get_by_role('button', name='Редактировать QA Cooling Fan').click()
    page.get_by_role('dialog').get_by_role('button', name='Восстановить').click()
    expect(page.get_by_text('Комплектующее восстановлено.')).to_be_visible()
    print('5. Archive, visibility state and restore')

    imported = {**created, 'id': 'qa-import-fan-' + suffix, 'name': 'QA Imported Fan'}
    page.locator('input[aria-label="Файл каталога JSON"]').set_input_files({
        'name':'catalog.json','mimeType':'application/json',
        'buffer':json.dumps({'products':[imported]}).encode(),
    })
    page.get_by_role('dialog').get_by_role('button', name='Импортировать').click()
    expect(page.get_by_text('Импорт завершён. Обработано позиций: 1.')).to_be_visible()
    page.get_by_role('searchbox').fill(imported['id'])
    expect(page.get_by_role('button', name='Редактировать QA Imported Fan')).to_be_visible()
    print('6. JSON data import')

    nav(page, 'Готовые сборки')
    page.get_by_role('button', name='Новая сборка').click()
    dialog = page.get_by_role('dialog')
    preset_name = 'QA Preset ' + suffix
    dialog.locator('input[name=preset-name]').fill(preset_name)
    dialog.locator('input[name=preset-use]').fill('Проверка конфигурации')
    dialog.locator('input[name=preset-id]').fill('qa-preset-' + suffix)
    dialog.locator('select[name=fan]').select_option(test_item)
    dialog.get_by_role('button', name='Сохранить сборку').click()
    expect(page.get_by_text('Готовая сборка сохранена.')).to_be_visible()
    expect(page.get_by_role('heading', name=preset_name, exact=True)).to_be_visible()
    print('7. Admin preset create and catalog relation')

    nav(page, 'Настройки')
    page.locator('input[name="store-name"]').fill('LUMO QA')
    page.get_by_role('button', name='Добавить промокод').click()
    page.locator('input[name="promo-code"]').last.fill('QA_' + suffix.upper())
    page.locator('input[name="promo-percent"]').last.fill('7')
    page.get_by_role('button', name='Сохранить настройки').click()
    expect(page.get_by_text('Настройки сохранены.')).to_be_visible()
    assert page.request.get(origin + '/api/admin/settings').json()['settings']['promotions'][-1]['code'] == 'QA_' + suffix.upper()
    print('8. Store settings and discount persisted')

    nav(page, 'Заявки')
    expect(page.get_by_role('searchbox')).to_be_visible()
    order_number = page.get_by_role('button', name='Открыть заявку qa-order')
    if order_number.count():
        order_number.click()
        dialog = page.get_by_role('dialog')
        expect(dialog.get_by_text('Тестовый покупатель')).to_be_visible()
        status = dialog.locator('select[name=status]')
        target_status = 'confirmed' if status.input_value() != 'confirmed' else 'completed'
        status.select_option(target_status)
        dialog.get_by_role('button', name='Обновить статус').click()
        expect(page.get_by_text('Статус заявки обновлён.')).to_be_visible()
        assert page.request.get(origin + '/api/admin/orders').json()['orders'][0]['status'] == target_status
        print('9. Order details and server-persisted status')
    else:
        expect(page.get_by_text('Заявок пока нет')).to_be_visible()
        print('9. Empty order state (no fixture)')

    nav(page, 'Пользователи')
    page.get_by_role('button', name='Добавить пользователя').click()
    dialog = page.get_by_role('dialog')
    staff_email = 'support-' + suffix + '@example.test'
    dialog.locator('input[name=email]').fill(staff_email)
    staff_password = secrets.token_urlsafe(27)
    dialog.locator('input[name=password]').fill(staff_password)
    dialog.get_by_role('button', name='Создать пользователя').click()
    expect(page.get_by_role('heading', name='Ключ входа готов')).to_be_visible()
    staff_secret = page.locator('input[name="totp-key"]').input_value()
    assert re.fullmatch('[A-Z2-7]{32}',staff_secret)
    page.get_by_role('button', name='Готово', exact=True).click()
    expect(page.get_by_text(staff_email)).to_be_visible()
    staff_id = next(user['id'] for user in page.request.get(origin + '/api/admin/users').json()['users'] if user['email'] == staff_email)
    nav(page, 'Журнал')
    audit_row = page.get_by_role('row').filter(has_text=staff_id)
    expect(audit_row.get_by_role('cell', name='Создание пользователя', exact=True)).to_be_visible()
    page.get_by_role('button', name='Выйти').click()
    expect(page.get_by_role('heading', name='Управление магазином')).to_be_visible()
    print('10. Add staff account, one-time TOTP enrollment and real audit events')

    mobile = browser.new_context(viewport={'width': 360, 'height': 800}, is_mobile=True, has_touch=True, device_scale_factor=1)
    mobile_page = mobile.new_page()
    mobile_page.goto(origin + '/admin#products')
    signed_in(mobile_page, staff_email, staff_password, staff_secret)
    expect(mobile_page.get_by_role('heading', level=1)).to_have_text('Обзор')
    assert mobile_page.get_by_role('navigation').get_by_role('button', name='Каталог').count() == 0
    assert mobile_page.request.get(origin + '/api/admin/products').status == 403
    assert mobile_page.evaluate('document.documentElement.scrollWidth') <= 360
    mobile_page.screenshot(path=str(directory / 'mobile-support.png'))
    expect(mobile_page.get_by_role('button', name='Все заявки')).to_be_visible()
    print('11. Real support role access, API 403 and 360px mobile layout')
    assert not exceptions, exceptions
    print('12. No JavaScript page errors on desktop admin path')
    browser.close()
