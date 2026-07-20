export const KIOSK_CONFIG_FIELDS = [
  'grayscalePricePerPage',
  'colorLowSaturationThreshold',
  'colorLowPricePerPage',
  'colorHighSaturationThreshold',
  'colorHighPricePerPage',
  'bluetoothDisplayName',
];

export function validateKioskConfig(input = {}) {
  const values = {};
  for (const field of KIOSK_CONFIG_FIELDS) {
    if (input[field] === undefined) return { valid: false, message: `Falta el campo "${field}" en la configuración del kiosco.` };
    values[field] = input[field];
  }

  const numericFields = KIOSK_CONFIG_FIELDS.filter(field => field !== 'bluetoothDisplayName');
  for (const field of numericFields) {
    values[field] = Number(values[field]);
    if (!Number.isFinite(values[field]) || values[field] < 0) {
      return { valid: false, message: `El campo "${field}" debe ser un número mayor o igual a 0.` };
    }
  }
  if (values.colorLowSaturationThreshold > 1 || values.colorHighSaturationThreshold > 1) {
    return { valid: false, message: 'Los umbrales de saturación deben estar entre 0 y 1.' };
  }
  if (values.colorLowSaturationThreshold >= values.colorHighSaturationThreshold) {
    return { valid: false, message: 'El umbral de saturación bajo debe ser menor que el alto.' };
  }
  if (typeof values.bluetoothDisplayName !== 'string' || values.bluetoothDisplayName.length > 120) {
    return { valid: false, message: 'El nombre visible de Bluetooth debe ser texto de hasta 120 caracteres.' };
  }
  values.bluetoothDisplayName = values.bluetoothDisplayName.trim();
  return { valid: true, values };
}

export function kioskConfigFromRow(row) {
  if (!row || !row.config_version) return null;
  return {
    grayscalePricePerPage: row.grayscale_price_per_page,
    colorLowSaturationThreshold: row.color_low_saturation_threshold,
    colorLowPricePerPage: row.color_low_price_per_page,
    colorHighSaturationThreshold: row.color_high_saturation_threshold,
    colorHighPricePerPage: row.color_high_price_per_page,
    bluetoothDisplayName: row.bluetooth_display_name || '',
    version: row.config_version,
    updatedAt: row.config_updated_at,
    changedAt: row.config_changed_at,
    source: row.config_source,
  };
}
