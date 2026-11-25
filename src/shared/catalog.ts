import type { Build, Category, FanMount, FormFactor, MemoryType, Part, Preset, Socket, Specs } from './types'

const checkedAt = '2026-11-26'
const standardBoards: FormFactor[] = ['ATX', 'Micro-ATX', 'Mini-ITX']
const atxPowerSupplies: Specs['psuFormFactors'] = ['ATX']

function dimensions(width: number, height: number, depth: number): Part['dimensions'] {
  return { width, height, depth }
}

type SizedMount = FanMount & { fanSizeLimits?: Record<number, number> }

function mount(
  location: FanMount['location'], fanSizes: number[], quantity: number, radiatorSizes: number[] = [],
  fanSizeLimits?: Record<number, number>,
): SizedMount {
  return { location, fanSizes, quantity, radiatorSizes, ...(fanSizeLimits ? { fanSizeLimits } : {}) }
}

function part(
  category: Category, id: string, brand: string, name: string, model: string, price: number, source: string,
  specs: Specs, size?: Part['dimensions'], colors = ['Чёрный'], inStock = true,
): Part {
  return { category, id, brand, name, model, price, source, specs, dimensions: size, colors, checkedAt, priceStatus: 'demo', inStock }
}

const cases: Part[] = [
  part('case', 'nzxt-h5-flow-2024', 'NZXT', 'NZXT H5 Flow (2024)', 'CC-H52FB-01', 11990,
    'https://nzxt.com/en-intl/products/h5-flow', {
      formFactors: ['E-ATX', ...standardBoards], eAtxWidthLimitMm: 277, gpuClearanceMm: 410, gpuSlotClearance: 7,
      coolerClearanceMm: 170, psuClearanceMm: 200, psuFormFactors: atxPowerSupplies, storageMounts: 2,
      topRadiatorFanStackLimitMm: 55, top280RequiresLowProfileRam: true, sidePanel: 'Закалённое стекло',
      variants: { 'Чёрный': 'CC-H52FB-01', 'Белый': 'CC-H52FW-01' },
      radiatorSupportSource: 'https://support.nzxt.com/hc/en-us/articles/47060012674203-What-radiator-sizes-does-the-H5-Flow-2024-support',
      fanMounts: [
        mount('front', [120, 140], 3, [120, 140, 240, 280, 360], { 140: 2 }),
        mount('top', [120, 140], 2, [120, 140, 240, 280]),
        mount('rear', [120], 1, [120]), mount('bottom', [120], 2),
      ],
    }, dimensions(225, 465, 430), ['Чёрный', 'Белый']),
  part('case', 'nzxt-h7-flow-2024', 'NZXT', 'NZXT H7 Flow (2024)', 'CM-H72FB-01', 17990,
    'https://nzxt.com/en-intl/products/h7-flow', {
      formFactors: ['E-ATX', ...standardBoards], eAtxWidthLimitMm: 277, gpuClearanceMm: 410, gpuSlotClearance: 7,
      coolerClearanceMm: 185, psuClearanceMm: 200, psuFormFactors: atxPowerSupplies, storageMounts: 4,
      top140RadiatorFanStackLimitMm: 57, sidePanel: 'Закалённое стекло',
      variants: { 'Чёрный': 'CM-H72FB-01', 'Белый': 'CM-H72FW-01' },
      fanMounts: [
        mount('front', [120, 140], 3, [120, 140, 240, 280, 360, 420]),
        mount('top', [120, 140], 3, [120, 140, 240, 280, 360], { 140: 2 }),
        mount('rear', [120, 140], 1, [120, 140]), mount('bottom', [120], 3),
      ],
    }, dimensions(244, 544, 468), ['Чёрный', 'Белый']),
  part('case', 'corsair-4000d-airflow', 'Corsair', 'Corsair 4000D Airflow', 'CC-9011200-WW', 10990,
    'https://www.corsair.com/us/en/p/pc-cases/cc-9011200-ww/4000d-airflow-tempered-glass-mid-tower-atx-case-black-cc-9011200-ww', {
      formFactors: ['E-ATX', ...standardBoards], eAtxWidthLimitMm: 277, gpuClearanceMm: 360, gpuSlotClearance: 7,
      coolerClearanceMm: 170, psuClearanceMm: 220, psuFormFactors: atxPowerSupplies, storageMounts: 4,
      sidePanel: 'Закалённое стекло',
      fanMounts: [
        mount('front', [120, 140], 3, [120, 140, 240, 280, 360], { 140: 2 }),
        mount('top', [120, 140], 2, [120, 140, 240, 280]), mount('rear', [120], 1, [120]),
      ],
    }, dimensions(230, 466, 453)),
  part('case', 'fractal-north', 'Fractal Design', 'Fractal Design North Charcoal Black TG Light', 'FD-C-NOR1C-02', 16990,
    'https://www.fractal-design.com/products/cases/north-series/north/north-charcoal-black-tg-light/', {
      formFactors: standardBoards, gpuClearanceMm: 355, gpuHeightClearanceMm: 148, gpuSlotClearance: 7,
      coolerClearanceMm: 170, psuClearanceMm: 255, psuClearanceWithTwoDriveTraysMm: 155,
      psuFormFactors: atxPowerSupplies, storageMounts: 2, sidePanel: 'Закалённое стекло',
      dimensionsSource: 'https://www.fractal-design.com/app/uploads/2022/12/North-Manual-V1.2.pdf',
      fanMounts: [
        mount('front', [120, 140], 3, [120, 140, 240, 280, 360], { 140: 2 }), mount('top', [120, 140], 2, [120, 240]),
        mount('rear', [120], 1, [120]),
      ],
    }, dimensions(215, 469, 447)),
  part('case', 'fractal-pop-mini-air', 'Fractal Design', 'Fractal Design Pop Mini Air RGB Black TG Clear Tint', 'FD-C-POR1M-06', 9990,
    'https://www.fractal-design.com/products/cases/pop-series/pop-mini-air/pop-mini-air-rgb-black-tg-clear-tint/', {
      formFactors: ['Micro-ATX', 'Mini-ITX'], gpuClearanceMm: 365, gpuSlotClearance: 4, coolerClearanceMm: 170,
      psuClearanceMm: 150, psuFormFactors: atxPowerSupplies, storageMounts: 2, sidePanel: 'Закалённое стекло',
      rgb: true, fanMounts: [
        mount('front', [120, 140], 2, [120, 240], { 140: 1 }), mount('top', [120, 140], 2, [120, 240], { 140: 1 }),
        mount('rear', [120], 1, [120]),
      ],
    }, dimensions(215, 393, 432)),
]

const nvidiaSources = {
  'RTX 4060': 'https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4060-4060ti/',
  'RTX 4060 Ti': 'https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4060-4060ti/',
  'RTX 4070 SUPER': 'https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4070-family/',
  'RTX 4070 Ti SUPER': 'https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4070-family/',
  'RTX 4080 SUPER': 'https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4080-family/',
  'RTX 4090': 'https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/',
} as const

function nvidiaGpu(
  id: string, brand: string, name: string, model: string, price: number, source: string,
  gpuChip: keyof typeof nvidiaSources, vramGb: number, wattage: number, recommendedPsuWatts: number,
  gpuSlots: number, connector: 'PCIe 8-pin' | '12VHPWR', size: Part['dimensions'], rgb = false, inStock = true,
): Part {
  const estimates = brand === 'NVIDIA' ? { cableClearanceMm: 36 } : { boardPowerBasis: 'Эталонное значение NVIDIA' }
  return part('gpu', id, brand, name, model, price, source, {
    gpuChip, vramGb, wattage, recommendedPsuWatts, gpuSlots, powerConnectors: { [connector]: 1 }, rgb,
    boardPowerSource: nvidiaSources[gpuChip], ...estimates,
    encoder: 'H.264, HEVC, AV1', encoderSource: 'https://developer.nvidia.com/video-encode-decode-support-matrix',
  }, size, ['Чёрный'], inStock)
}

function sapphireGpu(
  id: string, name: string, model: string, price: number, sourcePath: string, gpuChip: string,
  vramGb: number, wattage: number, recommendedPsuWatts: number, gpuSlots: number, connectors: number,
  size: Part['dimensions'],
): Part {
  const isRdna2 = gpuChip === 'RX 6600'
  const generation = isRdna2 ? '6000-series' : '7000-series'
  const chipSlug = gpuChip.toLowerCase().replaceAll(' ', '-')
  return part('gpu', id, 'Sapphire', name, model, price, `https://www.sapphiretech.com/en/consumer/${sourcePath}`, {
    gpuChip, vramGb, wattage, recommendedPsuWatts, gpuSlots, powerConnectors: { 'PCIe 8-pin': connectors }, rgb: false,
    encoder: isRdna2 ? 'H.264, HEVC' : 'H.264, HEVC, AV1',
    encoderSource: `https://www.amd.com/en/products/graphics/desktops/radeon/${generation}/amd-radeon-${chipSlug}.html`,
  }, size)
}

const gpus: Part[] = [
  nvidiaGpu('asus-dual-rtx4060-oc', 'ASUS', 'ASUS Dual GeForce RTX 4060 OC', 'DUAL-RTX4060-O8G', 35490,
    'https://www.asus.com/motherboards-components/graphics-cards/dual/dual-rtx4060-o8g/techspec/',
    'RTX 4060', 8, 115, 550, 2.5, 'PCIe 8-pin', dimensions(227.2, 123.24, 49.6)),
  nvidiaGpu('asus-dual-rtx4060-ti-oc', 'ASUS', 'ASUS Dual GeForce RTX 4060 Ti OC 8GB', 'DUAL-RTX4060TI-O8G', 48990,
    'https://www.asus.com/motherboards-components/graphics-cards/dual/dual-rtx4060ti-o8g/techspec/',
    'RTX 4060 Ti', 8, 160, 650, 2.5, 'PCIe 8-pin', dimensions(227.2, 123.24, 49.6)),
  nvidiaGpu('asus-dual-rtx4070-super-oc', 'ASUS', 'ASUS Dual GeForce RTX 4070 SUPER OC', 'DUAL-RTX4070S-O12G', 72990,
    'https://www.asus.com/motherboards-components/graphics-cards/dual/dual-rtx4070s-o12g/techspec/',
    'RTX 4070 SUPER', 12, 220, 750, 2.56, '12VHPWR', dimensions(267.01, 133.94, 51.13)),
  nvidiaGpu('asus-tuf-rtx4070-ti-super-oc', 'ASUS', 'ASUS TUF Gaming GeForce RTX 4070 Ti SUPER OC', 'TUF-RTX4070TIS-O16G-GAMING', 104990,
    'https://www.asus.com/motherboards-components/graphics-cards/tuf-gaming/tuf-rtx4070tis-o16g-gaming/techspec/',
    'RTX 4070 Ti SUPER', 16, 285, 750, 3.25, '12VHPWR', dimensions(305, 138, 65), true),
  nvidiaGpu('asus-tuf-rtx4080-super-oc', 'ASUS', 'ASUS TUF Gaming GeForce RTX 4080 SUPER OC', 'TUF-RTX4080S-O16G-GAMING', 147990,
    'https://www.asus.com/motherboards-components/graphics-cards/tuf-gaming/tuf-rtx4080s-o16g-gaming/techspec/',
    'RTX 4080 SUPER', 16, 320, 850, 3.65, '12VHPWR', dimensions(348.2, 150, 72.6), true),
  nvidiaGpu('nvidia-rtx4090-fe', 'NVIDIA', 'NVIDIA GeForce RTX 4090 Founders Edition', 'Founders Edition', 214990,
    nvidiaSources['RTX 4090'], 'RTX 4090', 24, 450, 850, 3, '12VHPWR', dimensions(304, 137, 61), false, false),
  sapphireGpu('sapphire-pulse-rx6600', 'Sapphire PULSE Radeon RX 6600 8GB', '11310-01-20G', 23490,
    'pulse-radeon-rx-6600-8g-gddr6', 'RX 6600', 8, 140, 500, 2, 1, dimensions(193, 120.05, 40.05)),
  sapphireGpu('sapphire-pulse-rx7600', 'Sapphire PULSE Radeon RX 7600 8GB', '11324-01-20G', 29990,
    'pulse-radeon-rx-7600-8g-gddr6', 'RX 7600', 8, 185, 550, 2, 1, dimensions(240, 107.1, 44.07)),
  sapphireGpu('sapphire-pulse-rx7700-xt', 'Sapphire PULSE Radeon RX 7700 XT 12GB', '11335-04-20G', 46990,
    'pulse-radeon-rx-7700-xt-12g-gddr6', 'RX 7700 XT', 12, 230, 700, 2.5, 2, dimensions(280, 128.75, 52.57)),
  sapphireGpu('sapphire-pulse-rx7800-xt', 'Sapphire PULSE Radeon RX 7800 XT 16GB', '11330-02-20G', 53990,
    'pulse-radeon-rx-7800-xt-16g-gddr6', 'RX 7800 XT', 16, 266, 700, 2.5, 2, dimensions(280, 128.75, 52.57)),
]

function cpu(
  id: string, brand: 'AMD' | 'Intel', model: string, price: number, source: string, socket: Socket, family: string,
  cores: number, threads: number, wattage: number, boostGhz: number, hasIntegratedGraphics: boolean, maxPowerW?: number,
): Part {
  return part('cpu', id, brand, `${brand} ${model}`, model, price, source, {
    socket, family, cores, threads, wattage, maxPowerW, hasIntegratedGraphics, boostGhz,
    powerBasis: brand === 'Intel' ? 'Базовая мощность' : 'Расчётная тепловая мощность (TDP)',
    memoryType: socket === 'AM4' ? 'DDR4' : socket === 'AM5' ? 'DDR5' : undefined,
    memoryTypes: socket === 'LGA1700' ? ['DDR4', 'DDR5'] : undefined,
    packageWidthMm: socket === 'LGA1700' ? 37.5 : undefined,
    packageDepthMm: socket === 'LGA1700' ? 45 : undefined,
  }, undefined, ['Серебристый'])
}

const cpus: Part[] = [
  cpu('intel-core-i5-12400f', 'Intel', 'Core i5-12400F', 10990,
    'https://www.intel.com/content/www/us/en/products/sku/134587/intel-core-i512400f-processor-18m-cache-up-to-4-40-ghz/specifications.html',
    'LGA1700', 'Intel 12th Gen', 6, 12, 65, 4.4, false, 117),
  cpu('intel-core-i5-13400f', 'Intel', 'Core i5-13400F', 16990,
    'https://www.intel.com/content/www/us/en/products/sku/230501/intel-core-i513400f-processor-20m-cache-up-to-4-60-ghz/specifications.html',
    'LGA1700', 'Intel 13th Gen', 10, 16, 65, 4.6, false, 148),
  cpu('intel-core-i5-13600k', 'Intel', 'Core i5-13600K', 24990,
    'https://www.intel.com/content/www/us/en/products/sku/230493/intel-core-i513600k-processor-24m-cache-up-to-5-10-ghz/specifications.html',
    'LGA1700', 'Intel 13th Gen', 14, 20, 125, 5.1, true, 181),
  cpu('intel-core-i7-14700k', 'Intel', 'Core i7-14700K', 34990,
    'https://www.intel.com/content/www/us/en/products/sku/236783/intel-core-i7-processor-14700k-33m-cache-up-to-5-60-ghz/specifications.html',
    'LGA1700', 'Intel 14th Gen', 20, 28, 125, 5.6, true, 253),
  cpu('amd-ryzen-5-5600', 'AMD', 'Ryzen 5 5600', 10490,
    'https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html',
    'AM4', 'Ryzen 5000', 6, 12, 65, 4.4, false),
  cpu('amd-ryzen-7-5700x', 'AMD', 'Ryzen 7 5700X', 14490,
    'https://www.amd.com/en/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-7-5700x.html',
    'AM4', 'Ryzen 5000', 8, 16, 65, 4.6, false),
  cpu('amd-ryzen-5-7600', 'AMD', 'Ryzen 5 7600', 18990,
    'https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html',
    'AM5', 'Ryzen 7000', 6, 12, 65, 5.1, true),
  cpu('amd-ryzen-7-7700x', 'AMD', 'Ryzen 7 7700X', 25990,
    'https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-7-7700x.html',
    'AM5', 'Ryzen 7000', 8, 16, 105, 5.4, true),
  cpu('amd-ryzen-7-7800x3d', 'AMD', 'Ryzen 7 7800X3D', 38990,
    'https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-7-7800x3d.html',
    'AM5', 'Ryzen 7000', 8, 16, 120, 5, true),
  cpu('amd-ryzen-7-9800x3d', 'AMD', 'Ryzen 7 9800X3D', 50990,
    'https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-7-9800x3d.html',
    'AM5', 'Ryzen 9000', 8, 16, 120, 5.2, true),
]

const intelDesktopFamilies = ['Intel 12th Gen', 'Intel 13th Gen', 'Intel 14th Gen']
const am5DesktopFamilies = ['Ryzen 7000', 'Ryzen 8000', 'Ryzen 9000']

function motherboard(
  id: string, brand: string, model: string, price: number, source: string, socket: Socket, chipset: string,
  formFactor: FormFactor, memoryType: MemoryType, cpuFamilies: string[], storagePorts: Specs['storagePorts'],
  m2LengthsMm: number[], extra: Specs = {},
): Part {
  return part('motherboard', id, brand, `${brand} ${model}`, model, price, source, {
    socket, chipset, formFactor, memoryType, memorySlots: 4, cpuFamilies, storagePorts, m2LengthsMm,
    widthMm: 243.84, heightMm: formFactor === 'ATX' ? 304.8 : 243.84, ...extra,
  })
}

const motherboards: Part[] = [
  motherboard('msi-pro-b760m-a-wifi-ddr4', 'MSI', 'PRO B760M-A WIFI DDR4', 13490,
    'https://www.msi.com/Motherboard/PRO-B760M-A-WIFI-DDR4/Specification',
    'LGA1700', 'B760', 'Micro-ATX', 'DDR4', intelDesktopFamilies, { 'M.2 NVMe': 2, 'M.2 SATA': 1, SATA: 4 },
    [42, 60, 80], {
      powerConnectors: { 'ATX 24-pin': 1, 'EPS 8-pin': 1 }, maxMemoryGb: 128,
      laneSharing: 'Накопитель M.2 SATA в M2_2 отключает SATA8.',
      cpuSupportSource: 'https://www.msi.com/Motherboard/PRO-B760M-A-WIFI-DDR4/support#cpu',
      biosRequired: {
        'intel-core-i5-12400f': '7D99v10', 'intel-core-i5-13400f': '7D99v10',
        'intel-core-i5-13600k': '7D99v10', 'intel-core-i7-14700k': '7D99v17',
      },
    }),
  motherboard('msi-mag-b760-tomahawk-wifi', 'MSI', 'MAG B760 TOMAHAWK WIFI', 18990,
    'https://www.msi.com/Motherboard/MAG-B760-TOMAHAWK-WIFI/Specification',
    'LGA1700', 'B760', 'ATX', 'DDR5', intelDesktopFamilies, { 'M.2 NVMe': 3, 'M.2 SATA': 1, SATA: 4 }, [42, 60, 80, 110],
    {
      powerConnectors: { 'ATX 24-pin': 1, 'EPS 8-pin': 1 }, maxMemoryGb: 256,
      cpuSupportSource: 'https://www.msi.com/Motherboard/MAG-B760-TOMAHAWK-WIFI/support#cpu',
      biosRequired: {
        'intel-core-i5-12400f': '7D96vA0', 'intel-core-i5-13400f': '7D96vA0',
        'intel-core-i5-13600k': '7D96vA0', 'intel-core-i7-14700k': '7D96vA5',
      },
    }),
  motherboard('msi-mag-z790-tomahawk-wifi', 'MSI', 'MAG Z790 TOMAHAWK WIFI', 25490,
    'https://www.msi.com/Motherboard/MAG-Z790-TOMAHAWK-WIFI/Specification',
    'LGA1700', 'Z790', 'ATX', 'DDR5', intelDesktopFamilies, { 'M.2 NVMe': 4, 'M.2 SATA': 1, SATA: 7 }, [42, 60, 80, 110],
    {
      powerConnectors: { 'ATX 24-pin': 1, 'EPS 8-pin': 1 }, maxMemoryGb: 256,
      laneSharing: 'Доступность SATA зависит от использования M2_3 в режиме SATA.',
      cpuSupportSource: 'https://www.msi.com/Motherboard/MAG-Z790-TOMAHAWK-WIFI/support#cpu',
      biosRequired: {
        'intel-core-i5-12400f': '7D91vH0', 'intel-core-i5-13400f': '7D91vH0',
        'intel-core-i5-13600k': '7D91vH0', 'intel-core-i7-14700k': '7D91vH8',
      },
    }),
  motherboard('asus-tuf-b550-plus-wifi-ii', 'ASUS', 'TUF GAMING B550-PLUS WIFI II', 14990,
    'https://www.asus.com/motherboards-components/motherboards/tuf-gaming/tuf-gaming-b550-plus-wifi-ii/techspec/',
    'AM4', 'B550', 'ATX', 'DDR4', ['Ryzen 3000', 'Ryzen 4000G', 'Ryzen 5000'], { 'M.2 NVMe': 2, 'M.2 SATA': 2, SATA: 6 },
    [42, 60, 80, 110], {
      rgb: true, maxMemoryGb: 128, powerConnectors: { 'ATX 24-pin': 1, 'EPS 8-pin': 1 },
      biosRequired: { 'amd-ryzen-5-5600': '0303', 'amd-ryzen-7-5700x': '0303' },
      cpuSupportSource: 'https://www.asus.com/motherboards-components/motherboards/tuf-gaming/tuf-gaming-b550-plus-wifi-ii/helpdesk_cpu?model2Name=TUF-GAMING-B550-PLUS-WIFI-II',
      laneSharing: 'При заполнении M.2_2 порты SATA6G_5 и SATA6G_6 отключаются.',
    }),
  motherboard('msi-mag-b650-tomahawk-wifi', 'MSI', 'MAG B650 TOMAHAWK WIFI', 21990,
    'https://www.msi.com/Motherboard/MAG-B650-TOMAHAWK-WIFI/Specification',
    'AM5', 'B650', 'ATX', 'DDR5', am5DesktopFamilies, { 'M.2 NVMe': 3, SATA: 6 }, [60, 80, 110],
    {
      powerConnectors: { 'ATX 24-pin': 1, 'EPS 8-pin': 1 }, maxMemoryGb: 256,
      laneSharing: 'M2_3 и PCI_E2 делят пропускную способность.',
      cpuSupportSource: 'https://www.msi.com/Motherboard/MAG-B650-TOMAHAWK-WIFI/support#cpu',
      biosRequired: {
        'amd-ryzen-5-7600': '7D75v10', 'amd-ryzen-7-7700x': '7D75v10',
        'amd-ryzen-7-7800x3d': '7D75v13', 'amd-ryzen-7-9800x3d': '7D75v1L',
      },
    }),
  motherboard('msi-pro-b650m-a-wifi', 'MSI', 'PRO B650M-A WIFI', 15490,
    'https://www.msi.com/Motherboard/PRO-B650M-A-WIFI/Specification',
    'AM5', 'B650', 'Micro-ATX', 'DDR5', am5DesktopFamilies, { 'M.2 NVMe': 2, SATA: 4 }, [60, 80],
    {
      powerConnectors: { 'ATX 24-pin': 1, 'EPS 8-pin': 1 }, maxMemoryGb: 256,
      cpuSupportSource: 'https://www.msi.com/Motherboard/PRO-B650M-A-WIFI/support#cpu',
      biosRequired: {
        'amd-ryzen-5-7600': '7D77v12', 'amd-ryzen-7-7700x': '7D77v12',
        'amd-ryzen-7-7800x3d': '7D77v16', 'amd-ryzen-7-9800x3d': '7D77v1N',
      },
    }),
]

function memory(
  id: string, brand: string, name: string, model: string, price: number, source: string,
  memoryType: MemoryType, capacityGb: number, speedMts: number, latencyCl: number, moduleHeightMm: number, rgb = false,
): Part {
  return part('ram', id, brand, name, model, price, source, {
    memoryType, capacityGb, speedMts, latencyCl, memoryModules: 2, moduleHeightMm, rgb, form: 'UDIMM',
    lowProfile: id.startsWith('corsair-vengeance-lpx-') || id === 'corsair-vengeance-ddr5-32-6000' ? true : undefined,
    profileNote: 'Заявленная скорость достигается при соответствующем профиле памяти и поддержке платы и процессора.',
  })
}

const memoryKits: Part[] = [
  memory('corsair-vengeance-lpx-16-3200', 'Corsair', 'Corsair Vengeance LPX 16 ГБ DDR4-3200', 'CMK16GX4M2B3200C16', 3990,
    'https://www.corsair.com/us/en/p/memory/cmk16gx4m2b3200c16/vengeancea-lpx-16gb-2-x-8gb-ddr4-dram-3200mhz-c16-memory-kit-black-cmk16gx4m2b3200c16',
    'DDR4', 16, 3200, 16, 34),
  memory('corsair-vengeance-lpx-32-3600', 'Corsair', 'Corsair Vengeance LPX 32 ГБ DDR4-3600', 'CMK32GX4M2D3600C18', 6990,
    'https://www.corsair.com/us/en/p/memory/cmk32gx4m2d3600c18/vengeancea-lpx-32gb-2-x-16gb-ddr4-dram-3600mhz-c18-memory-kit-black-cmk32gx4m2d3600c18',
    'DDR4', 32, 3600, 18, 34),
  memory('kingston-fury-beast-ddr4-32-3200', 'Kingston', 'Kingston FURY Beast 32 ГБ DDR4-3200', 'KF432C16BBK2/32', 6490,
    'https://www.kingston.com/datasheets/KF432C16BBK2_32.pdf', 'DDR4', 32, 3200, 16, 34),
  memory('corsair-vengeance-ddr5-32-6000', 'Corsair', 'Corsair Vengeance 32 ГБ DDR5-6000', 'CMK32GX5M2B6000Z30', 10490,
    'https://www.corsair.com/us/en/p/memory/cmk32gx5m2b6000z30/vengeance-32gb-2x16gb-ddr5-dram-6000mt-s-cl30-amd-expo-intel-xmp-memory-kit-cmk32gx5m2b6000z30',
    'DDR5', 32, 6000, 30, 35),
  memory('corsair-vengeance-rgb-ddr5-32-6000', 'Corsair', 'Corsair Vengeance RGB 32 ГБ DDR5-6000', 'CMH32GX5M2B6000Z30K', 12990,
    'https://www.corsair.com/us/en/p/memory/cmh32gx5m2b6000z30k/vengeance-rgb-32gb-2x16gb-ddr5-dram-6000mt-s-cl30-amd-expo-intel-xmp-memory-kit-cmh32gx5m2b6000z30k',
    'DDR5', 32, 6000, 30, 44, true),
  memory('kingston-fury-beast-ddr5-64-6000', 'Kingston', 'Kingston FURY Beast 64 ГБ DDR5-6000', 'KF560C36BBEK2-64', 20990,
    'https://www.kingston.com/datasheets/KF560C36BBEK2-64.pdf', 'DDR5', 64, 6000, 36, 34.9),
]

const commonCoolerSockets: Socket[] = ['AM4', 'AM5', 'LGA1700']
const currentCoolerSockets: Socket[] = [...commonCoolerSockets, 'LGA1851']

const coolers: Part[] = [
  part('cooler', 'deepcool-ak400', 'DeepCool', 'DeepCool AK400', 'R-AK400-BKNNMN-G-1', 3290,
    'https://www.deepcool.com/products/Cooling/cpuaircoolers/AK400-Performance-CPU-Cooler/2021/15222.shtml',
    { sockets: commonCoolerSockets, coolerHeightMm: 155, fanSizeMm: 120, fanCount: 1, maxRpm: 1850, rgb: false,
      coolingType: 'Воздушное' }, dimensions(127, 155, 97)),
  part('cooler', 'thermalright-peerless-assassin-120-se', 'Thermalright', 'Thermalright Peerless Assassin 120 SE', 'PA120 SE', 5290,
    'https://www.thermalright.com/product/peerless-assassin-120-se/',
    { sockets: commonCoolerSockets, coolerHeightMm: 155, fanSizeMm: 120, fanCount: 2, maxRpm: 1550, rgb: false,
      coolingType: 'Воздушное', sizeNotes: 'Размер радиатора без вентиляторов.' }, dimensions(125, 155, 110)),
  part('cooler', 'noctua-nh-d15-chromax-black', 'Noctua', 'Noctua NH-D15 chromax.black', 'NH-D15 chromax.black', 12990,
    'https://www.noctua.at/en/products/nh-d15-chromax-black/specifications',
    { sockets: currentCoolerSockets, coolerHeightMm: 168, fanSizeMm: 140, fanCount: 2, maxRpm: 1500, rgb: false,
      coolingType: 'Воздушное', ramClearanceMm: 32, fanHeightAdjustable: true },
    dimensions(150, 168, 161)),
  part('cooler', 'nzxt-kraken-240-rgb', 'NZXT', 'NZXT Kraken Plus 240 RGB', 'RL-KR240-B2', 14990,
    'https://nzxt.com/en-intl/products/kraken-plus-240-rgb',
    { sockets: currentCoolerSockets, radiatorMm: 240, radiatorThicknessMm: 27, fanThicknessMm: 26,
      fanSizeMm: 120, fanCount: 2, rgb: true, coolingType: 'Жидкостное',
      variants: { 'Чёрный': 'RL-KR240-B2', 'Белый': 'RL-KR240-W2' },
    }, dimensions(120, 27, 281), ['Чёрный', 'Белый']),
  part('cooler', 'arctic-liquid-freezer-iii-280-argb', 'ARCTIC', 'ARCTIC Liquid Freezer III 280 A-RGB', 'ACFRE00143A', 12990,
    'https://www.arctic.de/en/Liquid-Freezer-III-280-A-RGB-Black/ACFRE00143A',
    { sockets: currentCoolerSockets, radiatorMm: 280, radiatorThicknessMm: 38, fanThicknessMm: 27,
      fanSizeMm: 140, fanCount: 2, maxRpm: 1900, rgb: true, coolingType: 'Жидкостное' }, dimensions(138, 38, 317)),
  part('cooler', 'corsair-h150i-elite-capellix-xt', 'Corsair', 'Corsair iCUE H150i ELITE CAPELLIX XT', 'CW-9060070-WW', 22990,
    'https://www.corsair.com/us/en/p/cpu-coolers/cw-9060070-ww/icue-h150i-elite-capellix-xt-liquid-cpu-cooler-cw-9060070-ww',
    { sockets: currentCoolerSockets, radiatorMm: 360, radiatorThicknessMm: 27, fanThicknessMm: 25,
      fanSizeMm: 120, fanCount: 3, maxRpm: 2100, rgb: true, coolingType: 'Жидкостное' }, dimensions(120, 27, 397)),
]

function powerSupply(
  id: string, name: string, model: string, price: number, source: string, watts: number,
  psuFormFactor: Specs['psuFormFactor'], size: Part['dimensions'], connectors: Record<string, number>, efficiency: string,
): Part {
  return part('psu', id, 'Corsair', name, model, price, source, {
    psuFormFactor, psuLengthMm: size?.depth, psuWatts: watts, connectors, efficiency, modular: true,
  }, size)
}

const supplies: Part[] = [
  powerSupply('corsair-rm650e', 'Corsair RM650e', 'CP-9020302-NA', 8990,
    'https://www.corsair.com/us/en/p/psu/cp-9020302-na/rme-series-rm650e-fully-modular-low-noise-atx-power-supply-cp-9020302-na',
    650, 'ATX', dimensions(150, 86, 140),
    { 'ATX 24-pin': 1, 'EPS 8-pin': 1, 'PCIe 8-pin': 1, '12V-2x6': 1, SATA: 6 }, 'Cybenetics Gold'),
  powerSupply('corsair-rm750e-2023', 'Corsair RM750e', 'CP-9020262-NA', 10990,
    'https://www.corsair.com/us/en/p/psu/cp-9020262-na/rme-series-rm750e-fully-modular-low-noise-atx-power-supply-cp-9020262-na',
    750, 'ATX', dimensions(150, 86, 140),
    { 'ATX 24-pin': 1, 'EPS 8-pin': 2, 'PCIe 8-pin': 3, '12V-2x6': 1, SATA: 7 }, '80 PLUS Gold'),
  powerSupply('corsair-rm850e-2023', 'Corsair RM850e', 'CP-9020263-NA', 12990,
    'https://www.corsair.com/us/en/p/psu/cp-9020263-na/rme-series-rm850e-fully-modular-low-noise-atx-power-supply-cp-9020263-na',
    850, 'ATX', dimensions(150, 86, 140),
    { 'ATX 24-pin': 1, 'EPS 8-pin': 2, 'PCIe 8-pin': 3, '12V-2x6': 1, SATA: 7 }, '80 PLUS Gold'),
  powerSupply('corsair-rm1000e-2023', 'Corsair RM1000e', 'CP-9020264-NA', 16490,
    'https://www.corsair.com/us/en/p/psu/cp-9020264-na/rme-series-rm1000e-fully-modular-low-noise-atx-power-supply-cp-9020264-na',
    1000, 'ATX', dimensions(150, 86, 140),
    { 'ATX 24-pin': 1, 'EPS 8-pin': 2, 'PCIe 8-pin': 6, '12V-2x6': 1, SATA: 7 }, '80 PLUS Gold'),
  powerSupply('corsair-sf750-2024', 'Corsair SF750 (2024)', 'CP-9020284-NA', 18490,
    'https://www.corsair.com/us/en/p/psu/cp-9020284-na/sf-series-sf750-fully-modular-80-plus-platinum-sfx-power-supply-cp-9020284-na',
    750, 'SFX', dimensions(125, 63.5, 100),
    { 'ATX 24-pin': 1, 'EPS 8-pin': 2, 'PCIe 8-pin': 2, '12VHPWR': 1, SATA: 8 }, '80 PLUS Platinum'),
]

function drive(
  id: string, brand: string, name: string, model: string, price: number, source: string,
  storageInterface: NonNullable<Specs['storageInterface']>, capacityGb: number, size: Part['dimensions'],
  readMbPerSec: number, writeMbPerSec: number, colors?: string[],
): Part {
  return part('storage', id, brand, name, model, price, source, {
    storageInterface, capacityGb, storageLengthMm: storageInterface === 'M.2 NVMe' ? size?.depth : undefined,
    readMbPerSec, writeMbPerSec, form: storageInterface === 'SATA' ? '2,5″' : 'M.2 2280',
  }, size, colors)
}

const drives: Part[] = [
  drive('kingston-nv2-1tb', 'Kingston', 'Kingston NV2 1 ТБ', 'SNV2S/1000G', 5090,
    'https://www.kingston.com/datasheets/SNV2S_us.pdf', 'M.2 NVMe', 1000, dimensions(22, 2.2, 80), 3500, 2100),
  drive('kingston-kc3000-1tb', 'Kingston', 'Kingston KC3000 1 ТБ', 'SKC3000S/1024G', 7990,
    'https://www.kingston.com/en/ssd/kc3000-nvme-m2-solid-state-drive', 'M.2 NVMe', 1024, dimensions(22, 2.21, 80), 7000, 6000),
  drive('samsung-990-pro-2tb', 'Samsung', 'Samsung 990 PRO 2 ТБ', 'MZ-V9P2T0B/AM', 14990,
    'https://www.samsung.com/us/memory-storage/nvme-ssd/990-pro-pcie-4-0-nvme-ssd-1tb-sku-mz-v9p2t0b-am/',
    'M.2 NVMe', 2000, dimensions(22, 2.3, 80), 7450, 6900),
  drive('crucial-t500-2tb', 'Crucial', 'Crucial T500 2 ТБ', 'CT2000T500SSD8', 13990,
    'https://www.crucial.com/ssd/t500/ct2000t500ssd8', 'M.2 NVMe', 2000, dimensions(22, 2.3, 80), 7400, 7000),
  drive('samsung-870-evo-1tb', 'Samsung', 'Samsung 870 EVO 1 ТБ', 'MZ-77E1T0B/AM', 6790,
    'https://www.samsung.com/us/memory-storage/sata-ssd/870-evo-sata-2-5-ssd-1tb-sku-mz-77e1t0b-am/',
    'SATA', 1000, dimensions(69.85, 6.8, 100), 560, 530),
]

function fan(
  id: string, brand: string, name: string, model: string, price: number, source: string,
  fanSizeMm: number, thicknessMm: number, maxRpm: number, rgb: boolean, colors?: string[],
): Part {
  return part('fan', id, brand, name, model, price, source, {
    fanSizeMm, maxRpm, rgb, fanCount: 1, fanThicknessMm: thicknessMm, control: '4-pin PWM',
  }, dimensions(fanSizeMm, fanSizeMm, thicknessMm), colors)
}

const fans: Part[] = [
  fan('arctic-p12-pwm-pst', 'ARCTIC', 'ARCTIC P12 PWM PST', 'ACFAN00120A', 1090,
    'https://www.arctic.de/en/P12-PWM-PST/ACFAN00120A', 120, 25, 1800, false),
  fan('arctic-p14-pwm-pst', 'ARCTIC', 'ARCTIC P14 PWM PST', 'ACFAN00125A', 1290,
    'https://www.arctic.de/en/P14-PWM-PST/ACFAN00125A/', 140, 27, 1700, false),
  fan('noctua-nf-a12x25-pwm', 'Noctua', 'Noctua NF-A12x25 PWM', 'NF-A12x25 PWM', 3590,
    'https://www.noctua.at/en/products/nf-a12x25-pwm/specifications', 120, 25, 2000, false, ['Бежевый', 'Коричневый']),
  fan('corsair-ar120-rgb', 'Corsair', 'Corsair iCUE AR120 RGB', 'CO-9050166-WW', 2490,
    'https://www.corsair.com/us/en/p/case-fans/co-9050166-ww/icue-ar120-digital-rgb-120mm-pwm-fan-co-9050166-ww',
    120, 25, 1850, true),
  fan('arctic-p12-pwm-pst-argb', 'ARCTIC', 'ARCTIC P12 PWM PST A-RGB', 'ACFAN00231A', 1790,
    'https://www.arctic.de/en/P12-PWM-PST-A-RGB', 120, 25, 2000, true),
]

const approximatedModels = new Set([
  'nzxt-h5-flow-2024', 'asus-dual-rtx4070-super-oc', 'samsung-990-pro-2tb', 'corsair-rm850e-2023',
  'intel-core-i5-12400f', 'intel-core-i5-13400f', 'intel-core-i5-13600k', 'intel-core-i7-14700k',
  'amd-ryzen-5-5600', 'amd-ryzen-7-5700x', 'amd-ryzen-5-7600', 'amd-ryzen-7-7700x',
  'amd-ryzen-7-7800x3d', 'amd-ryzen-7-9800x3d',
])

const catalogImages: Readonly<Partial<Record<string, 'photograph' | 'render'>>> = {
  'nzxt-h5-flow-2024': 'render',
  'asus-dual-rtx4070-super-oc': 'render',
  'amd-ryzen-5-7600': 'photograph',
  'amd-ryzen-7-5700x': 'photograph',
  'amd-ryzen-7-7700x': 'photograph',
  'amd-ryzen-7-7800x3d': 'photograph',
  'corsair-4000d-airflow': 'photograph',
  'deepcool-ak400': 'photograph',
  'nvidia-rtx4090-fe': 'photograph',
}

function addVisuals(item: Part): Part {
  const imageKind = catalogImages[item.id]
  const hasModel = approximatedModels.has(item.id)
  return {
    ...item,
    image: imageKind ? `/images/parts/${item.id}.webp` : undefined,
    specs: imageKind ? { ...item.specs, imageKind } : item.specs,
    modelUrl: hasModel ? `/models/${item.id}.glb` : undefined,
    modelStatus: hasModel ? 'approximation' : undefined,
  }
}

export const catalog: Part[] = [
  ...cases, ...gpus, ...cpus, ...motherboards, ...memoryKits, ...coolers, ...supplies, ...drives, ...fans,
].map(addVisuals)

const lumoBuild: Build = {
  case: 'nzxt-h5-flow-2024',
  gpu: 'asus-dual-rtx4070-super-oc',
  cpu: 'amd-ryzen-7-7800x3d',
  motherboard: 'msi-mag-b650-tomahawk-wifi',
  ram: 'corsair-vengeance-rgb-ddr5-32-6000',
  cooler: 'nzxt-kraken-240-rgb',
  psu: 'corsair-rm850e-2023',
  storage: 'samsung-990-pro-2tb',
  fan: 'corsair-ar120-rgb',
}

export const presets: Preset[] = [
  {
    id: 'lumo', name: 'Сборка LUMO', use: 'Игры',
    description: 'Игровая сборка с Ryzen 7 7800X3D, GeForce RTX 4070 SUPER и подсветкой памяти.',
    build: lumoBuild,
  },
  {
    id: 'budget', name: 'Игровой старт', use: 'Бюджет',
    description: 'Ryzen 5, Radeon RX 6600 и 16 ГБ памяти для недорогой игровой сборки.',
    build: {
      case: 'corsair-4000d-airflow', cpu: 'amd-ryzen-5-5600', gpu: 'sapphire-pulse-rx6600',
      motherboard: 'asus-tuf-b550-plus-wifi-ii', ram: 'corsair-vengeance-lpx-16-3200', cooler: 'deepcool-ak400',
      psu: 'corsair-rm650e', storage: 'kingston-nv2-1tb', fan: 'arctic-p12-pwm-pst',
    },
  },
  {
    id: 'cyberpunk', name: 'Сборка для Cyberpunk 2077', use: 'Игры',
    description: 'GeForce RTX 4070 Ti SUPER и 32 ГБ памяти. Игровые настройки подбираются по реальным замерам.',
    build: {
      ...lumoBuild, case: 'nzxt-h7-flow-2024', gpu: 'asus-tuf-rtx4070-ti-super-oc', ram: 'corsair-vengeance-ddr5-32-6000',
    },
  },
  {
    id: 'stream', name: 'Сборка для стриминга', use: 'Стриминг',
    description: 'Процессор Core i5 с 14 ядрами и видеокарта GeForce RTX для кодирования трансляций.',
    build: {
      case: 'nzxt-h7-flow-2024', cpu: 'intel-core-i5-13600k', gpu: 'asus-dual-rtx4070-super-oc',
      motherboard: 'msi-mag-b760-tomahawk-wifi', ram: 'corsair-vengeance-ddr5-32-6000',
      cooler: 'nzxt-kraken-240-rgb', psu: 'corsair-rm750e-2023', storage: 'crucial-t500-2tb', fan: 'arctic-p12-pwm-pst-argb',
    },
  },
  {
    id: 'creator', name: 'Монтаж и работа', use: 'Работа',
    description: 'Core i7, 64 ГБ памяти и SSD 2 ТБ для монтажа и многозадачности.',
    build: {
      case: 'nzxt-h7-flow-2024', cpu: 'intel-core-i7-14700k', gpu: 'asus-tuf-rtx4070-ti-super-oc',
      motherboard: 'msi-mag-z790-tomahawk-wifi', ram: 'kingston-fury-beast-ddr5-64-6000',
      cooler: 'corsair-h150i-elite-capellix-xt', psu: 'corsair-rm850e-2023', storage: 'samsung-990-pro-2tb',
      fan: 'noctua-nf-a12x25-pwm',
    },
  },
  {
    id: 'premium', name: 'Премиальная игровая сборка', use: 'Премиум',
    description: 'Ryzen 7 9800X3D, GeForce RTX 4080 SUPER и трёхсекционный радиатор.',
    build: {
      ...lumoBuild, case: 'nzxt-h7-flow-2024', cpu: 'amd-ryzen-7-9800x3d', gpu: 'asus-tuf-rtx4080-super-oc',
      cooler: 'corsair-h150i-elite-capellix-xt', psu: 'corsair-rm1000e-2023',
    },
  },
  {
    id: 'compact', name: 'Компактная сборка', use: 'Micro-ATX',
    description: 'Компактный корпус Pop Mini Air с платой Micro-ATX и двухвентиляторной видеокартой.',
    build: {
      case: 'fractal-pop-mini-air', cpu: 'intel-core-i5-12400f', gpu: 'asus-dual-rtx4060-oc',
      motherboard: 'msi-pro-b760m-a-wifi-ddr4', ram: 'kingston-fury-beast-ddr4-32-3200',
      cooler: 'deepcool-ak400', psu: 'corsair-rm650e', storage: 'kingston-nv2-1tb', fan: 'arctic-p12-pwm-pst',
    },
  },
  {
    id: 'quiet', name: 'Сборка с тихим охлаждением', use: 'Тихая',
    description: 'Процессор с TDP 65 Вт, воздушный кулер и вентилятор с управлением PWM. Шум сборки нужно измерить.',
    build: {
      case: 'corsair-4000d-airflow', cpu: 'amd-ryzen-5-7600', gpu: 'asus-dual-rtx4060-oc',
      motherboard: 'msi-pro-b650m-a-wifi', ram: 'corsair-vengeance-ddr5-32-6000',
      cooler: 'thermalright-peerless-assassin-120-se', psu: 'corsair-rm750e-2023', storage: 'kingston-kc3000-1tb',
      fan: 'noctua-nf-a12x25-pwm',
    },
  },
  {
    id: 'empty', name: 'Пустой корпус', use: 'Самостоятельно',
    description: 'Пустой корпус H5 Flow для самостоятельного подбора каждого компонента.',
    build: { case: 'nzxt-h5-flow-2024' },
  },
]
