const CITY_SUFFIXES = ['市', '地区', '自治州', '自治县', '盟', '州', '特别行政区'];

export const normalizeCityName = (name = '') => {
  if (!name) return '';
  let normalized = name.trim();
  CITY_SUFFIXES.forEach((suffix) => {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
    }
  });
  return normalized.replace(/\s+/g, '');
};

